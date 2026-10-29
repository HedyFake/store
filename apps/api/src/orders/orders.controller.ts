import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { Prisma } from '@prisma/client';
import {
  cancelOrderSchema,
  canTransitionPayment,
  canTransitionShipment,
  canTransitionSupplierOrder,
  codReconcileSchema,
  createOrderSchema,
  deriveOrderStatus,
  normalizeIndoPhone,
  proofApproveSchema,
  proofRejectSchema,
  quoteRequestSchema,
  shipmentCodSchema,
  shipmentCreateSchema,
  shipmentUpdateSchema,
  sumRupiah,
  supplierOrderStatusSchema,
  type OrderStatus,
  type PaymentMethod,
  type PaymentStatus,
} from '@store/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { StorageService } from '../storage/storage.service';
import { ShippingOption, ShippingService } from '../shipping/shipping.service';
import { TelegramService } from '../telegram/telegram.service';
import {
  DEFAULT_COD_SETTINGS,
  DEFAULT_PAYMENT_SETTINGS,
  DEFAULT_SHIPPING_SETTINGS,
  SettingsService,
} from '../settings/settings.controller';
import { AdminGuard, AuthedUser, CurrentUser, Roles } from '../auth/auth.module';
import { parseOrThrow } from '../common/zod.pipe';
import { randomToken, redact, safeEqual, sha256 } from '../common/crypto';
import { safeDisplayName, validateUpload } from '../common/file-validation';
import { buildShippingLabelPdf } from '../common/pdf-label';
import { env } from '../config/env';

interface QuotedGroup {
  groupKey: string;
  sequence: number;
  supplierId: string;
  supplierName: string;
  supplierPublicLabel: string;
  warehouseId: string;
  warehouseName: string;
  warehouseCity: string;
  shippingOriginId: string | null;
  codSupported: boolean;
  items: Array<{
    productId: string;
    variantId: string | null;
    offerId: string;
    name: string;
    variantName: string | null;
    sku: string;
    supplierSku: string;
    imageUrl: string | null;
    quantity: number;
    unitPrice: number;
    costPrice: number;
    lineTotal: number;
    weightGram: number;
  }>;
  itemsSubtotal: number;
  totalWeightGram: number;
  shippingOptions: ShippingOption[];
}

@Controller('api')
export class OrdersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
    private readonly shipping: ShippingService,
    private readonly settings: SettingsService,
    private readonly telegram: TelegramService,
  ) {}

  /**
   *Deterministic supplier-offer routing:
   * 1. Offer active, supplier active, warehouse active, stockQty >= requested quantity
   * 2. Matches variantId (or generic offer with variantId = null)
   * 3. If paymentMethod === 'COD', prefers offers with codEnabled && supplier.codSupported
   * 4. Sorted by fulfillmentPriority ASC, stockQty DESC, costPrice ASC
   */
  private async allocateCartGroups(
    items: Array<{ productId: string; variantId?: string | null; quantity: number }>,
    destinationId: string | null | undefined,
    paymentMethod?: PaymentMethod,
  ): Promise<{ groups: QuotedGroup[]; codEligibleAllGroups: boolean; codIneligibleReasons: string[] }> {
    // Merge identical product+variant lines
    const merged = new Map<string, { productId: string; variantId: string | null; quantity: number }>();
    for (const line of items) {
      const key = `${line.productId}:${line.variantId ?? ''}`;
      const prev = merged.get(key);
      const nextQty = (prev?.quantity ?? 0) + line.quantity;
      if (nextQty > 99) throw new BadRequestException('Maksimal 99 unit per item.');
      merged.set(key, { productId: line.productId, variantId: line.variantId ?? null, quantity: nextQty });
    }

    const productIds = Array.from(new Set([...merged.values()].map((m) => m.productId)));
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds }, status: 'ACTIVE', archivedAt: null },
      include: {
        images: { orderBy: { sortOrder: 'asc' }, take: 1 },
        variants: true,
        offers: {
          where: { active: true, supplier: { active: true }, warehouse: { active: true } },
          include: { supplier: true, warehouse: true },
        },
      },
    });
    const byId = new Map(products.map((p) => [p.id, p]));

    const groupMap = new Map<string, Omit<QuotedGroup, 'sequence' | 'shippingOptions'>>();
    const codIneligibleReasons: string[] = [];

    for (const line of merged.values()) {
      const product = byId.get(line.productId);
      if (!product) {
        throw new ConflictException('Salah satu produk tidak lagi tersedia atau tidak aktif.');
      }
      let unitPrice = product.salePrice;
      let variantName: string | null = null;
      if (line.variantId) {
        const v = product.variants.find((x) => x.id === line.variantId && x.active);
        if (!v) throw new ConflictException(`Varian produk ${product.name} tidak tersedia.`);
        if (v.priceOverride != null) unitPrice = v.priceOverride;
        variantName = v.name;
      }

      const eligible = product.offers
        .filter((o) => (line.variantId ? o.variantId === line.variantId || o.variantId === null : o.variantId === null))
        .filter((o) => o.stockQty >= line.quantity)
        .sort((a, b) => {
          if (paymentMethod === 'COD') {
            const aCod = a.codEnabled && a.supplier.codSupported ? 0 : 1;
            const bCod = b.codEnabled && b.supplier.codSupported ? 0 : 1;
            if (aCod !== bCod) return aCod - bCod;
          }
          if (a.fulfillmentPriority !== b.fulfillmentPriority) return a.fulfillmentPriority - b.fulfillmentPriority;
          if (b.stockQty !== a.stockQty) return b.stockQty - a.stockQty;
          return a.costPrice - b.costPrice;
        });

      const chosen = eligible[0];
      if (!chosen) {
        throw new ConflictException(`Stok produk "${product.name}" tidak mencukupi untuk jumlah ${line.quantity}.`);
      }

      const offerCodOk = chosen.codEnabled && chosen.supplier.codSupported;
      if (!offerCodOk) {
        codIneligibleReasons.push(
          `Produk "${product.name}" dari ${chosen.warehouse.name} tidak mendukung pembayaran COD.`,
        );
      }

      const groupKey = `${chosen.supplierId}:${chosen.warehouseId}`;
      const existingGroup = groupMap.get(groupKey) ?? {
        groupKey,
        supplierId: chosen.supplierId,
        supplierName: chosen.supplier.name,
        supplierPublicLabel: chosen.supplier.publicLabel || `Mitra Gudang ${chosen.warehouse.city}`,
        warehouseId: chosen.warehouseId,
        warehouseName: chosen.warehouse.name,
        warehouseCity: chosen.warehouse.city,
        shippingOriginId: chosen.warehouse.shippingOriginId ?? null,
        codSupported: true,
        items: [],
        itemsSubtotal: 0,
        totalWeightGram: 0,
      };
      existingGroup.codSupported = existingGroup.codSupported && offerCodOk;
      const lineTotal = unitPrice * line.quantity;
      const lineWeight = Math.max(1, product.weightGram) * line.quantity;
      existingGroup.items.push({
        productId: product.id,
        variantId: line.variantId,
        offerId: chosen.id,
        name: product.name,
        variantName,
        sku: product.sku,
        supplierSku: chosen.supplierSku,
        imageUrl: product.images[0]?.url ?? null,
        quantity: line.quantity,
        unitPrice,
        costPrice: chosen.costPrice,
        lineTotal,
        weightGram: product.weightGram,
      });
      existingGroup.itemsSubtotal += lineTotal;
      existingGroup.totalWeightGram += lineWeight;
      groupMap.set(groupKey, existingGroup);
    }

    const groups: QuotedGroup[] = [];
    let seq = 1;
    for (const g of groupMap.values()) {
      const shippingOptions = await this.shipping.quoteGroup({
        originId: g.shippingOriginId,
        originCity: g.warehouseCity,
        destinationId,
        weightGram: g.totalWeightGram,
      });
      groups.push({ ...g, sequence: seq++, shippingOptions });
    }

    return {
      groups,
      codEligibleAllGroups: codIneligibleReasons.length === 0,
      codIneligibleReasons,
    };
  }

  private async recalculateParentStatus(orderId: string, tx?: Prisma.TransactionClient) {
    const db = tx ?? this.prisma;
    const order = await db.order.findUnique({
      where: { id: orderId },
      include: { supplierOrders: { include: { shipments: true } } },
    });
    if (!order) return;
    const next = deriveOrderStatus({
      current: order.orderStatus as OrderStatus,
      paymentMethod: order.paymentMethod as PaymentMethod,
      paymentStatus: order.paymentStatus as PaymentStatus,
      supplierOrders: order.supplierOrders.map((so) => ({
        status: so.status,
        shipments: so.shipments.map((s) => ({ status: s.status })),
      })),
    });
    if (next !== order.orderStatus) {
      await db.order.update({ where: { id: orderId }, data: { orderStatus: next } });
      await db.orderStatusHistory.create({
        data: {
          orderId,
          field: 'orderStatus',
          fromValue: order.orderStatus,
          toValue: next,
          note: 'Diperbarui otomatis dari status pengiriman sub-pesanan',
        },
      });
    }
  }

  // ─────────────────────── Public Checkout Quote & Order Creation ───────────────────────

  @Post('checkout/quote')
  async createCheckoutQuote(@Body() body: unknown) {
    const input = parseOrThrow(quoteRequestSchema, body);
    const [codCfg, shipCfg, payCfg] = await Promise.all([
      this.settings.get('cod', DEFAULT_COD_SETTINGS),
      this.settings.get('shipping', DEFAULT_SHIPPING_SETTINGS),
      this.settings.get('payment', DEFAULT_PAYMENT_SETTINGS),
    ]);

    const allocation = await this.allocateCartGroups(input.items, input.destinationId, input.paymentMethod);
    const subtotal = sumRupiah(allocation.groups.map((g) => g.itemsSubtotal));
    const minShippingTotal = sumRupiah(allocation.groups.map((g) => g.shippingOptions[0]?.cost ?? 0));

    let codAllowed = codCfg.codEnabled && allocation.codEligibleAllGroups;
    const codReasons = [...allocation.codIneligibleReasons];
    if (!codCfg.codEnabled) codReasons.unshift('Metode COD sedang dinonaktifkan oleh toko.');
    if (codCfg.codMaxOrderTotal > 0 && subtotal > codCfg.codMaxOrderTotal) {
      codAllowed = false;
      codReasons.push(`COD hanya tersedia untuk pesanan hingga Rp ${codCfg.codMaxOrderTotal.toLocaleString('id-ID')}.`);
    }

    const codFee =
      codCfg.codFeeFlat + Math.round((subtotal * codCfg.codFeePercentBps) / 10_000);

    const quote = await this.prisma.shippingQuote.create({
      data: {
        destinationId: input.destinationId ?? 'default',
        payload: { groups: allocation.groups } as unknown as Prisma.InputJsonValue,
        expiresAt: new Date(Date.now() + 30 * 60_000),
      },
    });

    const e = env();
    const gatewayActive = e.PAYMENT_PROVIDER === 'midtrans' && Boolean(e.MIDTRANS_SERVER_KEY);

    return {
      quoteId: quote.id,
      expiresAt: quote.expiresAt.toISOString(),
      subtotal,
      minShippingTotal,
      freeShippingApplied: shipCfg.freeShippingMinSubtotal > 0 && subtotal >= shipCfg.freeShippingMinSubtotal,
      cod: {
        allowed: codAllowed,
        fee: codFee,
        reasons: codReasons,
      },
      paymentMethods: {
        BANK_TRANSFER: payCfg.bankTransferEnabled && Boolean(payCfg.bankAccountNumber),
        QRIS_STATIC: payCfg.qrisStaticEnabled && Boolean(payCfg.qrisImageUrl),
        QRIS_GATEWAY: gatewayActive && e.ENABLE_QRIS,
        VIRTUAL_ACCOUNT: gatewayActive && e.ENABLE_VIRTUAL_ACCOUNT,
        COD: codAllowed,
      },
      groups: allocation.groups.map((g) => ({
        groupKey: g.groupKey,
        sequence: g.sequence,
        originLabel: g.supplierPublicLabel,
        warehouseCity: g.warehouseCity,
        codSupported: g.codSupported,
        itemsSubtotal: g.itemsSubtotal,
        totalWeightGram: g.totalWeightGram,
        items: g.items.map((i) => ({
          productId: i.productId,
          variantId: i.variantId,
          name: i.name,
          variantName: i.variantName,
          sku: i.sku,
          imageUrl: i.imageUrl,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          lineTotal: i.lineTotal,
        })),
        shippingOptions: g.shippingOptions,
      })),
    };
  }

  @Post('orders')
  async createOrder(@Body() body: unknown) {
    const input = parseOrThrow(createOrderSchema, body);
    const phone = normalizeIndoPhone(input.address.phone);
    if (!phone) {
      throw new BadRequestException('Nomor WhatsApp/telepon harus format Indonesia yang valid (mis. 0812... atau 62812...).');
    }

    // Idempotency check
    const existingByKey = await this.prisma.order.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (existingByKey) {
      throw new ConflictException({
        message: 'Pesanan dengan kunci idempotensi ini sudah dibuat.',
        orderNumber: existingByKey.orderNumber,
      });
    }

    const [payCfg, codCfg, shipCfg] = await Promise.all([
      this.settings.get('payment', DEFAULT_PAYMENT_SETTINGS),
      this.settings.get('cod', DEFAULT_COD_SETTINGS),
      this.settings.get('shipping', DEFAULT_SHIPPING_SETTINGS),
    ]);

    // Validate payment method availability
    const e = env();
    const gatewayActive = e.PAYMENT_PROVIDER === 'midtrans' && Boolean(e.MIDTRANS_SERVER_KEY);
    if (input.paymentMethod === 'BANK_TRANSFER' && (!payCfg.bankTransferEnabled || !payCfg.bankAccountNumber)) {
      throw new BadRequestException('Metode Transfer Bank sedang tidak aktif.');
    }
    if (input.paymentMethod === 'QRIS_STATIC' && (!payCfg.qrisStaticEnabled || !payCfg.qrisImageUrl)) {
      throw new BadRequestException('Metode QRIS manual sedang tidak aktif.');
    }
    if (input.paymentMethod === 'QRIS_GATEWAY' && (!gatewayActive || !e.ENABLE_QRIS)) {
      throw new BadRequestException('Payment gateway QRIS otomatis belum dikonfigurasi.');
    }
    if (input.paymentMethod === 'VIRTUAL_ACCOUNT' && (!gatewayActive || !e.ENABLE_VIRTUAL_ACCOUNT)) {
      throw new BadRequestException('Payment gateway Virtual Account belum dikonfigurasi.');
    }

    // Load & validate server-side shipping quote
    const quote = await this.prisma.shippingQuote.findUnique({ where: { id: input.quoteId } });
    if (!quote || quote.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException('Kutipan ongkir sudah kedaluwarsa. Silakan muat ulang ringkasan pengiriman.');
    }
    const quotedPayload = quote.payload as unknown as { groups: QuotedGroup[] };

    // Fresh server-side re-allocation of prices & offers (never trust client price)
    const freshAllocation = await this.allocateCartGroups(
      input.items,
      input.address.destinationId ?? quote.destinationId,
      input.paymentMethod,
    );

    if (input.paymentMethod === 'COD') {
      if (!codCfg.codEnabled || !freshAllocation.codEligibleAllGroups) {
        throw new BadRequestException(
          freshAllocation.codIneligibleReasons[0] ?? 'Pesanan ini tidak memenuhi syarat pembayaran COD.',
        );
      }
      if (
        codCfg.codBlockedProvinces.some(
          (p) => p.toLowerCase() === input.address.province.trim().toLowerCase(),
        )
      ) {
        throw new BadRequestException(`COD tidak tersedia untuk provinsi ${input.address.province}.`);
      }
    }

    const selectionMap = new Map(input.shippingSelections.map((s) => [s.groupKey, s.optionId]));
    const quotedGroupByKey = new Map((quotedPayload.groups ?? []).map((g) => [g.groupKey, g]));

    const resolvedGroups = freshAllocation.groups.map((g) => {
      const qGroup = quotedGroupByKey.get(g.groupKey);
      const selectedOptionId = selectionMap.get(g.groupKey);
      const optionsPool = qGroup?.shippingOptions?.length ? qGroup.shippingOptions : g.shippingOptions;
      const chosenOption =
        optionsPool.find((o) => o.optionId === selectedOptionId) ?? optionsPool[0];
      if (!chosenOption) {
        throw new BadRequestException(`Layanan pengiriman untuk grup ${g.warehouseCity} belum dipilih.`);
      }
      return { ...g, chosenShipping: chosenOption };
    });

    const subtotal = sumRupiah(resolvedGroups.map((g) => g.itemsSubtotal));
    if (input.paymentMethod === 'COD' && codCfg.codMaxOrderTotal > 0 && subtotal > codCfg.codMaxOrderTotal) {
      throw new BadRequestException(
        `Total barang melebihi batas maksimum COD Rp ${codCfg.codMaxOrderTotal.toLocaleString('id-ID')}.`,
      );
    }

    const rawShippingTotal = sumRupiah(resolvedGroups.map((g) => g.chosenShipping.cost));
    const freeShipping = shipCfg.freeShippingMinSubtotal > 0 && subtotal >= shipCfg.freeShippingMinSubtotal;
    const shippingTotal = freeShipping ? 0 : rawShippingTotal;
    const codFee =
      input.paymentMethod === 'COD'
        ? codCfg.codFeeFlat + Math.round((subtotal * codCfg.codFeePercentBps) / 10_000)
        : 0;
    const grandTotal = sumRupiah([subtotal, shippingTotal, codFee]);

    const guestAccessKey = randomToken(24);
    const guestAccessTokenHash = sha256(`${guestAccessKey}:${e.AUTH_SECRET}`);
    const datePart = new Date().toISOString().slice(2, 10).replace(/-/g, '');
    const orderNumber = `ORD-${datePart}-${randomToken(4).toUpperCase().replace(/[^A-Z0-9]/g, 'X').slice(0, 6)}`;

    const initialPaymentStatus: PaymentStatus =
      input.paymentMethod === 'COD' ? 'COD_PENDING_COLLECTION' : 'UNPAID';
    const initialOrderStatus: OrderStatus =
      input.paymentMethod === 'COD' ? 'AWAITING_FULFILLMENT' : 'PENDING_PAYMENT';
    const paymentDueAt =
      input.paymentMethod === 'COD'
        ? null
        : new Date(Date.now() + payCfg.paymentWindowHours * 3600_000);

    const created = await this.prisma.$transaction(async (tx) => {
      // Conditional atomic stock reservation per offer
      for (const grp of resolvedGroups) {
        for (const item of grp.items) {
          const updated = await tx.supplierOffer.updateMany({
            where: { id: item.offerId, active: true, stockQty: { gte: item.quantity } },
            data: { stockQty: { decrement: item.quantity } },
          });
          if (updated.count !== 1) {
            throw new ConflictException(`Stok untuk "${item.name}" baru saja habis. Silakan perbarui keranjang.`);
          }
        }
      }

      const customer = await tx.customer.upsert({
        where: { phone },
        create: {
          name: input.address.recipientName,
          phone,
          email: input.address.email || null,
        },
        update: {
          name: input.address.recipientName,
          ...(input.address.email ? { email: input.address.email } : {}),
        },
      });

      const order = await tx.order.create({
        data: {
          orderNumber,
          guestAccessTokenHash,
          customerId: customer.id,
          recipientName: input.address.recipientName,
          phone,
          email: input.address.email || null,
          addressLine: input.address.addressLine,
          province: input.address.province,
          city: input.address.city,
          district: input.address.district,
          postalCode: input.address.postalCode || null,
          destinationId: input.address.destinationId || null,
          customerNote: input.address.customerNote || null,
          subtotal,
          discountTotal: 0,
          shippingTotal,
          codFee,
          grandTotal,
          paymentMethod: input.paymentMethod,
          paymentStatus: initialPaymentStatus,
          orderStatus: initialOrderStatus,
          paymentDueAt,
          shippingQuoteId: quote.id,
          idempotencyKey: input.idempotencyKey,
          isDemo: e.DEMO_MODE,
          statusHistory: {
            create: [
              { field: 'orderStatus', fromValue: null, toValue: initialOrderStatus, note: 'Pesanan dibuat' },
              { field: 'paymentStatus', fromValue: null, toValue: initialPaymentStatus, note: 'Pesanan dibuat' },
            ],
          },
          payments: {
            create: {
              method: input.paymentMethod,
              provider:
                input.paymentMethod === 'COD'
                  ? 'cod'
                  : input.paymentMethod === 'QRIS_GATEWAY' || input.paymentMethod === 'VIRTUAL_ACCOUNT'
                    ? 'midtrans'
                    : 'manual',
              amount: grandTotal,
              status: initialPaymentStatus,
              expiresAt: paymentDueAt,
            },
          },
        },
      });

      for (const grp of resolvedGroups) {
        const offerSample = await tx.supplierOffer.findUnique({ where: { id: grp.items[0].offerId } });
        const purchaseCostTotal = sumRupiah(grp.items.map((i) => i.costPrice * i.quantity));
        const so = await tx.supplierOrder.create({
          data: {
            orderId: order.id,
            supplierId: grp.supplierId,
            warehouseId: grp.warehouseId,
            routingKey: grp.groupKey,
            sequence: grp.sequence,
            status: 'PENDING',
            integrationMode: offerSample?.integrationMode ?? 'MANUAL',
            purchaseCostTotal,
            itemsSubtotal: grp.itemsSubtotal,
            shippingCost: freeShipping ? 0 : grp.chosenShipping.cost,
            courierCode: grp.chosenShipping.courierCode,
            courierService: grp.chosenShipping.service,
            courierEtd: grp.chosenShipping.etd,
            idempotencyKey: `${order.orderNumber}:${grp.groupKey}`,
          },
        });

        for (const item of grp.items) {
          await tx.orderItem.create({
            data: {
              orderId: order.id,
              supplierOrderId: so.id,
              productId: item.productId,
              variantId: item.variantId,
              offerId: item.offerId,
              productNameSnap: item.name,
              skuSnap: item.sku,
              variantNameSnap: item.variantName,
              imageUrlSnap: item.imageUrl,
              supplierSkuSnap: item.supplierSku,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              costPriceSnap: item.costPrice,
              lineTotal: item.lineTotal,
              weightGramSnap: item.weightGram,
            },
          });

          await tx.inventoryMovement.create({
            data: {
              offerId: item.offerId,
              delta: -item.quantity,
              reason: 'ORDER_RESERVE',
              relatedOrderId: order.id,
              note: `Alokasi pesanan ${order.orderNumber}`,
            },
          });
        }
      }

      return order;
    });

    // Automatically generate printable PDF Resi/Shipping Label for each package and send it + customer personal data to Telegram
    const createdSupplierOrders = await this.prisma.supplierOrder.findMany({
      where: { orderId: created.id },
      orderBy: { sequence: 'asc' },
      select: { id: true },
    });
    for (const so of createdSupplierOrders) {
      await this.generateAndSendPackageResiPdf(so.id, undefined, false).catch(() => undefined);
    }

    await this.audit.log({
      actorLabel: `customer:${phone}`,
      action: 'ORDER_CREATED',
      entityType: 'Order',
      entityId: created.id,
      after: {
        orderNumber: created.orderNumber,
        paymentMethod: created.paymentMethod,
        paymentStatus: created.paymentStatus,
        orderStatus: created.orderStatus,
        grandTotal: created.grandTotal,
        supplierOrderCount: resolvedGroups.length,
      },
    });

    return {
      orderId: created.id,
      orderNumber: created.orderNumber,
      accessKey: guestAccessKey,
      paymentMethod: created.paymentMethod,
      paymentStatus: created.paymentStatus,
      orderStatus: created.orderStatus,
      grandTotal: created.grandTotal,
      trackingPath: `/pesanan/${created.orderNumber}?key=${encodeURIComponent(guestAccessKey)}`,
    };
  }

  /**
   * Generates or updates the printable PDF shipping label/resi for a SupplierOrder, saves it in private storage,
   * and sends the PDF + full customer personal details (data diri pelanggan) as one unified message to Telegram.
   */
  private async generateAndSendPackageResiPdf(
    supplierOrderId: string,
    actorId?: string,
    forceTelegramResend = false,
  ) {
    const so = await this.prisma.supplierOrder.findUnique({
      where: { id: supplierOrderId },
      include: {
        order: { include: { supplierOrders: { select: { id: true } } } },
        warehouse: true,
        supplier: true,
        items: true,
        shipments: { orderBy: { createdAt: 'asc' }, include: { documents: true } },
      },
    });
    if (!so) throw new NotFoundException('Sub-pesanan pemasok tidak ditemukan.');

    const storeCfg = await this.settings.get('store', {
      storeName: 'Pasti Murahnya',
      whatsappNumber: '6282233038659',
    });

    let shipment = so.shipments[0];
    if (!shipment) {
      const codStatus = so.order.paymentMethod === 'COD' ? 'PENDING' : 'NOT_APPLICABLE';
      shipment = await this.prisma.shipment.create({
        data: {
          supplierOrderId: so.id,
          carrier: so.courierCode || 'REGULER',
          carrierService: so.courierService || null,
          trackingNumber: null,
          trackingUrl: null,
          status: 'AWAITING_TRACKING',
          codCollectionStatus: codStatus,
          codAmount: so.order.paymentMethod === 'COD' ? so.itemsSubtotal + so.shippingCost : 0,
          events: {
            create: {
              status: 'AWAITING_TRACKING',
              message: `Label pengiriman paket #${so.sequence} (${so.courierCode || 'REGULER'}) siap dicetak`,
              eventAt: new Date(),
              source: 'SYSTEM',
            },
          },
        },
        include: { documents: true },
      });
    }

    const pdfBuffer = buildShippingLabelPdf({
      storeName: storeCfg.storeName || 'Pasti Murahnya',
      storePhone: storeCfg.whatsappNumber || null,
      orderNumber: so.order.orderNumber,
      createdAt: so.order.createdAt,
      packageSequence: so.sequence,
      totalPackages: Math.max(1, so.order.supplierOrders.length),
      paymentMethod: so.order.paymentMethod,
      paymentStatus: so.order.paymentStatus,
      grandTotal: so.order.grandTotal,
      packageSubtotal: so.itemsSubtotal,
      shippingCost: so.shippingCost,
      codAmount: shipment.codAmount,
      carrier: shipment.carrier,
      carrierService: shipment.carrierService,
      courierEtd: so.courierEtd,
      trackingNumber: shipment.trackingNumber,
      warehouseName: so.warehouse.name,
      warehouseCity: so.warehouse.city,
      warehouseProvince: so.warehouse.province,
      recipient: {
        name: so.order.recipientName,
        phone: so.order.phone,
        email: so.order.email,
        addressLine: so.order.addressLine,
        district: so.order.district,
        city: so.order.city,
        province: so.order.province,
        postalCode: so.order.postalCode,
        customerNote: so.order.customerNote,
      },
      items: so.items.map((it) => ({
        name: it.productNameSnap,
        variantName: it.variantNameSnap,
        sku: it.skuSnap,
        quantity: it.quantity,
        unitPrice: it.unitPrice,
        lineTotal: it.lineTotal,
        weightGram: it.weightGramSnap,
      })),
    });

    const storageKey = this.storage.newKey('shipment-docs', shipment.id, 'pdf');
    await this.storage.putPrivate(storageKey, pdfBuffer, 'application/pdf');
    const originalName = `resi-${so.order.orderNumber}-paket-${so.sequence}.pdf`;

    const existingAutoDoc = shipment.documents.find((d) => d.source === 'SUPPLIER_API');
    const doc = existingAutoDoc
      ? await this.prisma.shipmentDocument.update({
          where: { id: existingAutoDoc.id },
          data: {
            storageKey,
            originalName,
            sizeBytes: pdfBuffer.length,
            sha256: sha256(pdfBuffer),
            customerVisible: true,
            uploadedById: actorId ?? null,
          },
        })
      : await this.prisma.shipmentDocument.create({
          data: {
            shipmentId: shipment.id,
            storageKey,
            docType: 'SHIPPING_LABEL',
            originalName,
            mime: 'application/pdf',
            sizeBytes: pdfBuffer.length,
            sha256: sha256(pdfBuffer),
            source: 'SUPPLIER_API',
            customerVisible: true,
            uploadedById: actorId ?? null,
          },
        });

    const telegramDelivery = await this.telegram.enqueueDocument(doc.id, forceTelegramResend);
    return { shipment, document: doc, telegramDelivery };
  }

  // ─────────────────────── Customer Order View & Proof Upload ───────────────────────

  private async verifyGuestOrderAccess(orderNumberOrId: string, accessKey: string | undefined) {
    if (!accessKey || accessKey.length < 16) {
      throw new ForbiddenException('Tautan akses pesanan tidak lengkap atau tidak sah.');
    }
    const isUuid = /^[0-9a-f-]{36}$/i.test(orderNumberOrId);
    const order = await this.prisma.order.findFirst({
      where: {
        OR: isUuid
          ? [{ orderNumber: orderNumberOrId.toUpperCase() }, { id: orderNumberOrId }]
          : [{ orderNumber: orderNumberOrId.toUpperCase() }],
      },
      include: {
        items: true,
        payments: {
          orderBy: { createdAt: 'desc' },
          include: { proofs: { orderBy: { createdAt: 'desc' } } },
        },
        supplierOrders: {
          orderBy: { sequence: 'asc' },
          include: {
            supplier: true,
            warehouse: true,
            items: true,
            shipments: {
              orderBy: { createdAt: 'asc' },
              include: {
                events: { orderBy: { eventAt: 'desc' } },
                documents: { where: { customerVisible: true }, orderBy: { createdAt: 'desc' } },
              },
            },
          },
        },
        statusHistory: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!order) throw new NotFoundException('Pesanan tidak ditemukan.');
    const candidateHash = sha256(`${accessKey}:${env().AUTH_SECRET}`);
    if (!safeEqual(candidateHash, order.guestAccessTokenHash)) {
      throw new ForbiddenException('Kode akses pesanan tidak cocok.');
    }
    return order;
  }

  @Get('orders/:orderNumber')
  async getCustomerOrder(@Param('orderNumber') orderNumber: string, @Query('key') key?: string) {
    const order = await this.verifyGuestOrderAccess(orderNumber, key);
    const [payCfg, storeCfg] = await Promise.all([
      this.settings.get('payment', DEFAULT_PAYMENT_SETTINGS),
      this.settings.get('store', { whatsappNumber: '6282233038659', storeName: 'Toko' }),
    ]);

    const latestPayment = order.payments[0];
    // Customer-safe view: never expose costPriceSnap, supplier internal notes, or raw storage keys
    return {
      id: order.id,
      orderNumber: order.orderNumber,
      createdAt: order.createdAt,
      paymentDueAt: order.paymentDueAt,
      paymentMethod: order.paymentMethod,
      paymentStatus: order.paymentStatus,
      orderStatus: order.orderStatus,
      cancelReason: order.cancelReason,
      isDemo: order.isDemo,
      recipient: {
        name: order.recipientName,
        phone: order.phone,
        addressLine: order.addressLine,
        district: order.district,
        city: order.city,
        province: order.province,
        postalCode: order.postalCode,
        customerNote: order.customerNote,
      },
      totals: {
        subtotal: order.subtotal,
        discountTotal: order.discountTotal,
        shippingTotal: order.shippingTotal,
        codFee: order.codFee,
        grandTotal: order.grandTotal,
        currency: order.currency,
      },
      paymentInstructions:
        order.paymentMethod === 'BANK_TRANSFER'
          ? {
              bankName: payCfg.bankName,
              bankAccountName: payCfg.bankAccountName,
              bankAccountNumber: payCfg.bankAccountNumber,
              instructions: payCfg.transferInstructions,
              maxProofBytes: payCfg.proofMaxBytes,
            }
          : order.paymentMethod === 'QRIS_STATIC'
            ? {
                qrisImageUrl: payCfg.qrisImageUrl,
                instructions: payCfg.transferInstructions,
                maxProofBytes: payCfg.proofMaxBytes,
              }
            : null,
      payment: latestPayment
        ? {
            id: latestPayment.id,
            status: latestPayment.status,
            amount: latestPayment.amount,
            paidAt: latestPayment.paidAt,
            expiresAt: latestPayment.expiresAt,
            providerPayload: latestPayment.providerPayload,
            proofs: latestPayment.proofs.map((p) => ({
              id: p.id,
              originalName: p.originalName,
              detectedMime: p.detectedMime,
              sizeBytes: p.sizeBytes,
              reviewStatus: p.reviewStatus,
              rejectionReason: p.rejectionReason,
              reviewedAt: p.reviewedAt,
              createdAt: p.createdAt,
            })),
          }
        : null,
      packages: order.supplierOrders.map((so) => ({
        id: so.id,
        sequence: so.sequence,
        status: so.status,
        originLabel: so.supplier.publicLabel || `Gudang ${so.warehouse.city}`,
        warehouseCity: so.warehouse.city,
        courierCode: so.courierCode,
        courierService: so.courierService,
        courierEtd: so.courierEtd,
        shippingCost: so.shippingCost,
        items: so.items.map((it) => ({
          id: it.id,
          productId: it.productId,
          name: it.productNameSnap,
          variantName: it.variantNameSnap,
          sku: it.skuSnap,
          imageUrl: it.imageUrlSnap,
          quantity: it.quantity,
          unitPrice: it.unitPrice,
          lineTotal: it.lineTotal,
        })),
        shipments: so.shipments.map((sh) => ({
          id: sh.id,
          carrier: sh.carrier,
          carrierService: sh.carrierService,
          trackingNumber: sh.trackingNumber,
          trackingUrl: sh.trackingUrl,
          status: sh.status,
          codCollectionStatus: sh.codCollectionStatus,
          shippedAt: sh.shippedAt,
          deliveredAt: sh.deliveredAt,
          events: sh.events.map((ev) => ({
            id: ev.id,
            status: ev.status,
            message: ev.message,
            eventAt: ev.eventAt,
          })),
          documents: sh.documents.map((d) => ({
            id: d.id,
            docType: d.docType,
            originalName: d.originalName,
            mime: d.mime,
            sizeBytes: d.sizeBytes,
            createdAt: d.createdAt,
          })),
        })),
      })),
      statusHistory: order.statusHistory.map((h) => ({
        id: h.id,
        field: h.field,
        fromValue: h.fromValue,
        toValue: h.toValue,
        note: h.note,
        createdAt: h.createdAt,
      })),
      supportWhatsapp: storeCfg.whatsappNumber || null,
    };
  }

  @Post('orders/:orderNumber/payment-proofs')
  @UseInterceptors(FileInterceptor('file'))
  async uploadPaymentProof(
    @Param('orderNumber') orderNumber: string,
    @Query('key') key: string | undefined,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    const order = await this.verifyGuestOrderAccess(orderNumber, key);
    if (order.paymentMethod !== 'BANK_TRANSFER' && order.paymentMethod !== 'QRIS_STATIC') {
      throw new BadRequestException('Unggah bukti pembayaran hanya untuk Transfer Bank atau QRIS manual.');
    }
    if (!['UNPAID', 'PENDING_REVIEW'].includes(order.paymentStatus)) {
      throw new ConflictException('Status pesanan ini tidak lagi menerima bukti pembayaran baru.');
    }

    const payCfg = await this.settings.get('payment', DEFAULT_PAYMENT_SETTINGS);
    const detected = validateUpload(file, {
      allowed: ['image/jpeg', 'image/png', 'application/pdf'],
      maxBytes: payCfg.proofMaxBytes || env().PAYMENT_PROOF_MAX_BYTES,
    });

    const payment = order.payments[0];
    if (!payment) throw new NotFoundException('Data pembayaran tidak ditemukan.');

    const storageKey = this.storage.newKey('payment-proofs', order.id, detected.ext);
    await this.storage.putPrivate(storageKey, file!.buffer, detected.mime);

    const originalName = safeDisplayName(file!.originalname, `bukti-${order.orderNumber}.${detected.ext}`);
    const fileHash = sha256(file!.buffer);

    try {
      const proof = await this.prisma.$transaction(async (tx) => {
        const freshOrder = await tx.order.findUnique({ where: { id: order.id } });
        if (!freshOrder || !['UNPAID', 'PENDING_REVIEW'].includes(freshOrder.paymentStatus)) {
          throw new ConflictException('Status pesanan telah berubah.');
        }

        const createdProof = await tx.paymentProof.create({
          data: {
            paymentId: payment.id,
            storageKey,
            originalName,
            detectedMime: detected.mime,
            sizeBytes: file!.buffer.length,
            sha256: fileHash,
            reviewStatus: 'PENDING_REVIEW',
          },
        });

        // Uploading proof sets status to PENDING_REVIEW — NEVER PAID automatically
        if (freshOrder.paymentStatus !== 'PENDING_REVIEW') {
          await tx.order.update({
            where: { id: order.id },
            data: { paymentStatus: 'PENDING_REVIEW' },
          });
          await tx.payment.update({
            where: { id: payment.id },
            data: { status: 'PENDING_REVIEW' },
          });
          await tx.orderStatusHistory.create({
            data: {
              orderId: order.id,
              field: 'paymentStatus',
              fromValue: freshOrder.paymentStatus,
              toValue: 'PENDING_REVIEW',
              note: 'Pelanggan mengunggah bukti pembayaran (menunggu verifikasi admin)',
            },
          });
        }
        return createdProof;
      });

      await this.audit.log({
        actorLabel: `customer:${order.phone}`,
        action: 'PAYMENT_PROOF_UPLOADED',
        entityType: 'PaymentProof',
        entityId: proof.id,
        after: {
          orderNumber: order.orderNumber,
          mime: proof.detectedMime,
          sizeBytes: proof.sizeBytes,
          reviewStatus: proof.reviewStatus,
        },
      });

      return {
        ok: true,
        paymentStatus: 'PENDING_REVIEW',
        proof: {
          id: proof.id,
          originalName: proof.originalName,
          detectedMime: proof.detectedMime,
          sizeBytes: proof.sizeBytes,
          reviewStatus: proof.reviewStatus,
          createdAt: proof.createdAt,
        },
        message: 'Bukti pembayaran berhasil diunggah dan sedang menunggu verifikasi admin.',
      };
    } catch (err) {
      await this.storage.deletePrivate(storageKey);
      throw err;
    }
  }

  @Get('orders/:orderNumber/payment-proofs/:proofId/file')
  async customerDownloadOwnProof(
    @Param('orderNumber') orderNumber: string,
    @Param('proofId') proofId: string,
    @Query('key') key: string | undefined,
    @Res() res: Response,
  ) {
    const order = await this.verifyGuestOrderAccess(orderNumber, key);
    const proof = await this.prisma.paymentProof.findFirst({
      where: { id: proofId, payment: { orderId: order.id } },
    });
    if (!proof) throw new NotFoundException('Bukti pembayaran tidak ditemukan.');
    const signed = await this.storage.signedUrl(proof.storageKey, proof.originalName);
    if (signed) return res.redirect(signed);
    const bytes = await this.storage.readPrivate(proof.storageKey);
    res.setHeader('Content-Type', proof.detectedMime);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Content-Disposition', `inline; filename="${proof.originalName.replace(/"/g, '')}"`);
    return res.send(bytes);
  }

  @Get('orders/:orderNumber/documents/:docId/file')
  async customerDownloadShipmentDoc(
    @Param('orderNumber') orderNumber: string,
    @Param('docId') docId: string,
    @Query('key') key: string | undefined,
    @Res() res: Response,
  ) {
    const order = await this.verifyGuestOrderAccess(orderNumber, key);
    const doc = await this.prisma.shipmentDocument.findFirst({
      where: {
        id: docId,
        customerVisible: true,
        shipment: { supplierOrder: { orderId: order.id } },
      },
    });
    if (!doc) throw new NotFoundException('Dokumen pengiriman tidak ditemukan.');
    const signed = await this.storage.signedUrl(doc.storageKey, doc.originalName);
    if (signed) return res.redirect(signed);
    const bytes = await this.storage.readPrivate(doc.storageKey);
    res.setHeader('Content-Type', doc.mime);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Content-Disposition', `inline; filename="${doc.originalName.replace(/"/g, '')}"`);
    return res.send(bytes);
  }

  // ─────────────────────── Admin Orders, Payments, COD, Shipments ───────────────────────

  @UseGuards(AdminGuard)
  @Get('admin/orders')
  async adminListOrders(
    @Query('q') q?: string,
    @Query('orderStatus') orderStatus?: string,
    @Query('paymentStatus') paymentStatus?: string,
    @Query('paymentMethod') paymentMethod?: string,
    @Query('page') pageRaw?: string,
    @Query('pageSize') pageSizeRaw?: string,
  ) {
    const page = Math.max(1, Number(pageRaw) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(pageSizeRaw) || 20));
    const where: Prisma.OrderWhereInput = {};
    if (q) {
      where.OR = [
        { orderNumber: { contains: q, mode: 'insensitive' } },
        { recipientName: { contains: q, mode: 'insensitive' } },
        { phone: { contains: q } },
      ];
    }
    if (orderStatus) where.orderStatus = orderStatus as OrderStatus;
    if (paymentStatus) where.paymentStatus = paymentStatus as PaymentStatus;
    if (paymentMethod) where.paymentMethod = paymentMethod as PaymentMethod;

    const [total, items, pendingProofCount, codPendingCount] = await Promise.all([
      this.prisma.order.count({ where }),
      this.prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          items: true,
          payments: { include: { proofs: { orderBy: { createdAt: 'desc' }, take: 1 } } },
          supplierOrders: {
            orderBy: { sequence: 'asc' },
            include: { supplier: true, warehouse: true, shipments: true },
          },
        },
      }),
      this.prisma.order.count({ where: { paymentStatus: 'PENDING_REVIEW' } }),
      this.prisma.order.count({ where: { paymentStatus: 'COD_PENDING_COLLECTION' } }),
    ]);

    return {
      items,
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      metrics: { pendingProofCount, codPendingCount },
    };
  }

  @UseGuards(AdminGuard)
  @Get('admin/orders/:id')
  async adminGetOrder(@Param('id') id: string) {
    const order = await this.prisma.order.findFirst({
      where: { OR: [{ id }, { orderNumber: id.toUpperCase() }] },
      include: {
        customer: true,
        items: true,
        payments: {
          orderBy: { createdAt: 'desc' },
          include: { proofs: { orderBy: { createdAt: 'desc' } } },
        },
        supplierOrders: {
          orderBy: { sequence: 'asc' },
          include: {
            supplier: true,
            warehouse: true,
            items: true,
            shipments: {
              orderBy: { createdAt: 'asc' },
              include: {
                events: { orderBy: { eventAt: 'desc' } },
                documents: {
                  orderBy: { createdAt: 'desc' },
                  include: { telegramDeliveries: { orderBy: { createdAt: 'desc' } } },
                },
              },
            },
          },
        },
        statusHistory: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!order) throw new NotFoundException('Pesanan tidak ditemukan');
    return order;
  }

  @UseGuards(AdminGuard)
  @Get('admin/payment-proofs/:proofId/file')
  async adminViewProof(@Param('proofId') proofId: string, @Res() res: Response) {
    const proof = await this.prisma.paymentProof.findUnique({ where: { id: proofId } });
    if (!proof) throw new NotFoundException('Bukti pembayaran tidak ditemukan');
    const signed = await this.storage.signedUrl(proof.storageKey, proof.originalName);
    if (signed) return res.redirect(signed);
    const bytes = await this.storage.readPrivate(proof.storageKey);
    res.setHeader('Content-Type', proof.detectedMime);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Content-Disposition', `inline; filename="${proof.originalName.replace(/"/g, '')}"`);
    return res.send(bytes);
  }

  @UseGuards(AdminGuard)
  @Post('admin/payment-proofs/:proofId/approve')
  async approveProof(
    @Param('proofId') proofId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthedUser,
  ) {
    const input = parseOrThrow(proofApproveSchema, body);
    const proof = await this.prisma.paymentProof.findUnique({
      where: { id: proofId },
      include: { payment: { include: { order: true } } },
    });
    if (!proof) throw new NotFoundException('Bukti pembayaran tidak ditemukan.');
    const order = proof.payment.order;
    if (input.reviewedAmount !== order.grandTotal) {
      throw new BadRequestException(
        `Nominal verifikasi (Rp ${input.reviewedAmount.toLocaleString('id-ID')}) harus sama dengan total pesanan (Rp ${order.grandTotal.toLocaleString('id-ID')}).`,
      );
    }
    if (!canTransitionPayment(order.paymentStatus as PaymentStatus, 'PAID')) {
      throw new ConflictException(`Status pembayaran ${order.paymentStatus} tidak dapat diubah menjadi PAID.`);
    }

    const now = new Date();
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.paymentProof.update({
        where: { id: proof.id },
        data: {
          reviewStatus: 'APPROVED',
          reviewedById: user.id,
          reviewedAt: now,
          reviewedAmount: input.reviewedAmount,
          reviewNote: input.note ?? null,
          rejectionReason: null,
        },
      });
      await tx.payment.update({
        where: { id: proof.paymentId },
        data: {
          status: 'PAID',
          paidAt: now,
          verifiedById: user.id,
          verifiedNote: input.note ?? null,
        },
      });
      const nextOrderStatus: OrderStatus =
        order.orderStatus === 'PENDING_PAYMENT' ? 'AWAITING_FULFILLMENT' : (order.orderStatus as OrderStatus);
      const ord = await tx.order.update({
        where: { id: order.id },
        data: {
          paymentStatus: 'PAID',
          orderStatus: nextOrderStatus,
        },
      });
      await tx.orderStatusHistory.createMany({
        data: [
          {
            orderId: order.id,
            field: 'paymentStatus',
            fromValue: order.paymentStatus,
            toValue: 'PAID',
            note: input.note ?? 'Bukti transfer disetujui admin',
            actorId: user.id,
          },
          ...(nextOrderStatus !== order.orderStatus
            ? [
                {
                  orderId: order.id,
                  field: 'orderStatus',
                  fromValue: order.orderStatus,
                  toValue: nextOrderStatus,
                  note: 'Pembayaran lunas, siap diproses ke pemasok',
                  actorId: user.id,
                },
              ]
            : []),
        ],
      });
      return ord;
    });

    await this.audit.log({
      actorId: user.id,
      actorLabel: user.email,
      action: 'PAYMENT_PROOF_APPROVED',
      entityType: 'Order',
      entityId: order.id,
      before: { paymentStatus: order.paymentStatus, orderStatus: order.orderStatus },
      after: {
        paymentStatus: updated.paymentStatus,
        orderStatus: updated.orderStatus,
        reviewedAmount: input.reviewedAmount,
        note: input.note,
      },
    });
    return updated;
  }

  @UseGuards(AdminGuard)
  @Post('admin/payment-proofs/:proofId/reject')
  async rejectProof(
    @Param('proofId') proofId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthedUser,
  ) {
    const input = parseOrThrow(proofRejectSchema, body);
    const proof = await this.prisma.paymentProof.findUnique({
      where: { id: proofId },
      include: { payment: { include: { order: true } } },
    });
    if (!proof) throw new NotFoundException('Bukti pembayaran tidak ditemukan.');
    const order = proof.payment.order;
    if (order.paymentStatus === 'PAID') {
      throw new ConflictException('Pesanan sudah lunas dan tidak dapat ditolak buktinya.');
    }

    const now = new Date();
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.paymentProof.update({
        where: { id: proof.id },
        data: {
          reviewStatus: 'REJECTED',
          reviewedById: user.id,
          reviewedAt: now,
          rejectionReason: input.reason,
        },
      });
      await tx.payment.update({
        where: { id: proof.paymentId },
        data: { status: 'UNPAID' },
      });
      const ord = await tx.order.update({
        where: { id: order.id },
        data: { paymentStatus: 'UNPAID' },
      });
      await tx.orderStatusHistory.create({
        data: {
          orderId: order.id,
          field: 'paymentStatus',
          fromValue: order.paymentStatus,
          toValue: 'UNPAID',
          note: `Bukti ditolak: ${input.reason}`,
          actorId: user.id,
        },
      });
      return ord;
    });

    await this.audit.log({
      actorId: user.id,
      actorLabel: user.email,
      action: 'PAYMENT_PROOF_REJECTED',
      entityType: 'Order',
      entityId: order.id,
      before: { paymentStatus: order.paymentStatus },
      after: { paymentStatus: updated.paymentStatus, reason: input.reason },
    });
    return updated;
  }

  @UseGuards(AdminGuard)
  @Post('admin/orders/:id/reconcile-cod')
  async reconcileCod(
    @Param('id') orderId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthedUser,
  ) {
    const input = parseOrThrow(codReconcileSchema, body);
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { payments: true, supplierOrders: { include: { shipments: true } } },
    });
    if (!order) throw new NotFoundException('Pesanan tidak ditemukan.');
    if (order.paymentMethod !== 'COD') {
      throw new BadRequestException('Rekonsiliasi COD hanya untuk pesanan dengan metode COD.');
    }

    const targetPaymentStatus: PaymentStatus =
      input.outcome === 'COLLECTED' ? 'COD_COLLECTED' : 'COD_FAILED';
    if (!canTransitionPayment(order.paymentStatus as PaymentStatus, targetPaymentStatus)) {
      throw new ConflictException(`Status pembayaran ${order.paymentStatus} tidak dapat diubah ke ${targetPaymentStatus}.`);
    }

    const now = new Date();
    const updated = await this.prisma.$transaction(async (tx) => {
      for (const p of order.payments) {
        await tx.payment.update({
          where: { id: p.id },
          data: {
            status: targetPaymentStatus,
            paidAt: input.outcome === 'COLLECTED' ? now : null,
            verifiedById: user.id,
            verifiedNote: input.evidence,
          },
        });
      }
      for (const so of order.supplierOrders) {
        for (const sh of so.shipments) {
          await tx.shipment.update({
            where: { id: sh.id },
            data: {
              codCollectionStatus: input.outcome === 'COLLECTED' ? 'COLLECTED' : 'FAILED',
              codCollectedAt: input.outcome === 'COLLECTED' ? now : null,
            },
          });
        }
      }
      const nextOrderStatus: OrderStatus =
        input.outcome === 'COLLECTED'
          ? 'COMPLETED'
          : order.orderStatus === 'DELIVERED'
            ? (order.orderStatus as OrderStatus)
            : 'DELIVERY_FAILED';

      const ord = await tx.order.update({
        where: { id: order.id },
        data: {
          paymentStatus: targetPaymentStatus,
          orderStatus: nextOrderStatus,
        },
      });
      await tx.orderStatusHistory.createMany({
        data: [
          {
            orderId: order.id,
            field: 'paymentStatus',
            fromValue: order.paymentStatus,
            toValue: targetPaymentStatus,
            note: `Rekonsiliasi COD: ${input.evidence}`,
            actorId: user.id,
          },
          ...(nextOrderStatus !== order.orderStatus
            ? [
                {
                  orderId: order.id,
                  field: 'orderStatus',
                  fromValue: order.orderStatus,
                  toValue: nextOrderStatus,
                  note: `Rekonsiliasi COD (${input.outcome})`,
                  actorId: user.id,
                },
              ]
            : []),
        ],
      });
      return ord;
    });

    await this.audit.log({
      actorId: user.id,
      actorLabel: user.email,
      action: `COD_RECONCILED_${input.outcome}`,
      entityType: 'Order',
      entityId: order.id,
      before: { paymentStatus: order.paymentStatus, orderStatus: order.orderStatus },
      after: {
        paymentStatus: updated.paymentStatus,
        orderStatus: updated.orderStatus,
        evidence: input.evidence,
      },
    });
    return updated;
  }

  @UseGuards(AdminGuard)
  @Roles('OWNER', 'ADMIN')
  @Post('admin/orders/:id/cancel')
  async cancelOrder(
    @Param('id') orderId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthedUser,
  ) {
    const input = parseOrThrow(cancelOrderSchema, body);
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true, payments: true, supplierOrders: { include: { shipments: true } } },
    });
    if (!order) throw new NotFoundException('Pesanan tidak ditemukan.');
    if (['SHIPPED', 'PARTIALLY_SHIPPED', 'DELIVERED', 'COMPLETED', 'CANCELLED'].includes(order.orderStatus)) {
      throw new ConflictException(`Pesanan berstatus ${order.orderStatus} tidak dapat dibatalkan.`);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      // Return reserved stock
      for (const item of order.items) {
        await tx.supplierOffer.update({
          where: { id: item.offerId },
          data: { stockQty: { increment: item.quantity } },
        });
        await tx.inventoryMovement.create({
          data: {
            offerId: item.offerId,
            delta: item.quantity,
            reason: 'ORDER_CANCEL_RELEASE',
            relatedOrderId: order.id,
            actorId: user.id,
            note: `Pembatalan pesanan: ${input.reason}`,
          },
        });
      }
      await tx.supplierOrder.updateMany({
        where: { orderId: order.id },
        data: { status: 'CANCELLED' },
      });
      const nextPayStatus: PaymentStatus =
        order.paymentStatus === 'PAID' ? 'REFUNDED' : 'CANCELLED';
      await tx.payment.updateMany({
        where: { orderId: order.id },
        data: { status: nextPayStatus },
      });
      const ord = await tx.order.update({
        where: { id: order.id },
        data: {
          orderStatus: 'CANCELLED',
          paymentStatus: nextPayStatus,
          cancelReason: input.reason,
        },
      });
      await tx.orderStatusHistory.create({
        data: {
          orderId: order.id,
          field: 'orderStatus',
          fromValue: order.orderStatus,
          toValue: 'CANCELLED',
          note: input.reason,
          actorId: user.id,
        },
      });
      return ord;
    });

    await this.audit.log({
      actorId: user.id,
      actorLabel: user.email,
      action: 'ORDER_CANCELLED',
      entityType: 'Order',
      entityId: order.id,
      before: { orderStatus: order.orderStatus, paymentStatus: order.paymentStatus },
      after: { orderStatus: updated.orderStatus, paymentStatus: updated.paymentStatus, reason: input.reason },
    });
    return updated;
  }

  // ── Supplier Order actions
  @UseGuards(AdminGuard)
  @Post('admin/supplier-orders/:id/status')
  async updateSupplierOrderStatus(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthedUser,
  ) {
    const input = parseOrThrow(supplierOrderStatusSchema, body);
    const so = await this.prisma.supplierOrder.findUnique({ where: { id } });
    if (!so) throw new NotFoundException('Sub-pesanan pemasok tidak ditemukan.');
    if (so.status !== input.status && !canTransitionSupplierOrder(so.status, input.status)) {
      throw new ConflictException(`Transisi status pemasok dari ${so.status} ke ${input.status} tidak diizinkan.`);
    }
    const now = new Date();
    const updated = await this.prisma.$transaction(async (tx) => {
      const next = await tx.supplierOrder.update({
        where: { id },
        data: {
          status: input.status,
          externalOrderRef: input.externalOrderRef !== undefined ? input.externalOrderRef : so.externalOrderRef,
          internalNotes: input.note ? `${so.internalNotes ? so.internalNotes + '\n' : ''}${input.note}` : so.internalNotes,
          submittedAt: input.status === 'SUBMITTED' && !so.submittedAt ? now : so.submittedAt,
          confirmedAt: input.status === 'CONFIRMED' && !so.confirmedAt ? now : so.confirmedAt,
        },
      });
      await this.recalculateParentStatus(so.orderId, tx);
      return next;
    });

    await this.audit.log({
      actorId: user.id,
      actorLabel: user.email,
      action: 'SUPPLIER_ORDER_STATUS_UPDATED',
      entityType: 'SupplierOrder',
      entityId: id,
      before: { status: so.status, externalOrderRef: so.externalOrderRef },
      after: { status: updated.status, externalOrderRef: updated.externalOrderRef, note: input.note },
    });
    return updated;
  }

  // ── Shipments & Resi & PDF Documents
  @UseGuards(AdminGuard)
  @Post('admin/shipments')
  async createShipment(@Body() body: unknown, @CurrentUser() user: AuthedUser) {
    const input = parseOrThrow(shipmentCreateSchema, body);
    const so = await this.prisma.supplierOrder.findUnique({
      where: { id: input.supplierOrderId },
      include: { order: true },
    });
    if (!so) throw new NotFoundException('Sub-pesanan pemasok tidak ditemukan.');

    // Tracking number stays null until genuinely issued; never invent dummy tracking numbers
    const trackingNumber = input.trackingNumber ? input.trackingNumber.trim() : null;
    const status = trackingNumber ? 'TRACKING_AVAILABLE' : 'AWAITING_TRACKING';
    const codStatus = so.order.paymentMethod === 'COD' ? 'PENDING' : 'NOT_APPLICABLE';

    const created = await this.prisma.$transaction(async (tx) => {
      const sh = await tx.shipment.create({
        data: {
          supplierOrderId: so.id,
          carrier: input.carrier,
          carrierService: input.carrierService || null,
          trackingNumber,
          trackingUrl: input.trackingUrl || null,
          status,
          codCollectionStatus: codStatus,
          codAmount: so.order.paymentMethod === 'COD' ? so.itemsSubtotal + so.shippingCost : 0,
          shippedAt: trackingNumber ? new Date() : null,
          events: {
            create: {
              status,
              message: trackingNumber
                ? `Nomor resi ${trackingNumber} (${input.carrier}) diterbitkan`
                : `Pengiriman ${input.carrier} dibuat, menunggu nomor resi dari pemasok/kurir`,
              eventAt: new Date(),
              source: 'ADMIN',
            },
          },
        },
        include: { events: true, documents: true },
      });

      if (trackingNumber && ['PENDING', 'SUBMITTED', 'CONFIRMED', 'PACKED'].includes(so.status)) {
        await tx.supplierOrder.update({ where: { id: so.id }, data: { status: 'SHIPPED' } });
      }
      await this.recalculateParentStatus(so.orderId, tx);
      return sh;
    });

    await this.audit.log({
      actorId: user.id,
      actorLabel: user.email,
      action: 'SHIPMENT_CREATED',
      entityType: 'Shipment',
      entityId: created.id,
      after: {
        supplierOrderId: so.id,
        carrier: created.carrier,
        trackingNumber: created.trackingNumber,
        status: created.status,
      },
    });
    await this.generateAndSendPackageResiPdf(so.id, user.id, true).catch(() => undefined);
    return created;
  }

  @UseGuards(AdminGuard)
  @Patch('admin/shipments/:id')
  async updateShipment(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthedUser,
  ) {
    const input = parseOrThrow(shipmentUpdateSchema, body);
    const sh = await this.prisma.shipment.findUnique({
      where: { id },
      include: { supplierOrder: true },
    });
    if (!sh) throw new NotFoundException('Data pengiriman tidak ditemukan.');

    const nextTracking =
      input.trackingNumber !== undefined ? (input.trackingNumber ? input.trackingNumber.trim() : null) : sh.trackingNumber;
    let nextStatus = input.status ?? sh.status;
    if (!input.status && nextTracking && sh.status === 'AWAITING_TRACKING') {
      nextStatus = 'TRACKING_AVAILABLE';
    }
    if (!canTransitionShipment(sh.status, nextStatus)) {
      throw new ConflictException(`Transisi status pengiriman dari ${sh.status} ke ${nextStatus} tidak diizinkan.`);
    }

    const now = new Date();
    const updated = await this.prisma.$transaction(async (tx) => {
      const next = await tx.shipment.update({
        where: { id },
        data: {
          carrier: input.carrier ?? sh.carrier,
          carrierService: input.carrierService !== undefined ? input.carrierService : sh.carrierService,
          trackingNumber: nextTracking,
          trackingUrl: input.trackingUrl !== undefined ? input.trackingUrl || null : sh.trackingUrl,
          status: nextStatus,
          trackingError: input.trackingError !== undefined ? input.trackingError : sh.trackingError,
          shippedAt:
            !sh.shippedAt && ['TRACKING_AVAILABLE', 'IN_TRANSIT', 'DELIVERED'].includes(nextStatus)
              ? now
              : sh.shippedAt,
          deliveredAt: nextStatus === 'DELIVERED' && !sh.deliveredAt ? now : sh.deliveredAt,
        },
      });

      if (input.eventMessage || nextStatus !== sh.status || nextTracking !== sh.trackingNumber) {
        await tx.trackingEvent.create({
          data: {
            shipmentId: id,
            status: nextStatus,
            message:
              input.eventMessage ||
              (nextTracking && nextTracking !== sh.trackingNumber
                ? `Nomor resi diperbarui: ${nextTracking}`
                : `Status pengiriman: ${nextStatus}`),
            eventAt: now,
            source: 'ADMIN',
          },
        });
      }

      if (nextStatus === 'DELIVERED') {
        await tx.supplierOrder.update({
          where: { id: sh.supplierOrderId },
          data: { status: 'DELIVERED' },
        });
      } else if (['TRACKING_AVAILABLE', 'IN_TRANSIT'].includes(nextStatus)) {
        await tx.supplierOrder.update({
          where: { id: sh.supplierOrderId },
          data: { status: 'SHIPPED' },
        });
      }
      await this.recalculateParentStatus(sh.supplierOrder.orderId, tx);
      return next;
    });

    await this.audit.log({
      actorId: user.id,
      actorLabel: user.email,
      action: 'SHIPMENT_UPDATED',
      entityType: 'Shipment',
      entityId: id,
      before: { trackingNumber: sh.trackingNumber, status: sh.status },
      after: { trackingNumber: updated.trackingNumber, status: updated.status },
    });
    if (nextTracking !== sh.trackingNumber) {
      await this.generateAndSendPackageResiPdf(sh.supplierOrderId, user.id, true).catch(() => undefined);
    }
    return updated;
  }

  @UseGuards(AdminGuard)
  @Post('admin/supplier-orders/:id/generate-resi-pdf')
  async adminGenerateResiPdf(@Param('id') supplierOrderId: string, @CurrentUser() user: AuthedUser) {
    const res = await this.generateAndSendPackageResiPdf(supplierOrderId, user.id, true);
    await this.audit.log({
      actorId: user.id,
      actorLabel: user.email,
      action: 'SHIPMENT_PDF_GENERATED_AND_SENT',
      entityType: 'ShipmentDocument',
      entityId: res.document.id,
      after: {
        supplierOrderId,
        originalName: res.document.originalName,
        telegramStatus: res.telegramDelivery?.status,
      },
    });
    return res;
  }

  @UseGuards(AdminGuard)
  @Post('admin/shipments/:id/cod-status')
  async updateShipmentCod(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthedUser,
  ) {
    const input = parseOrThrow(shipmentCodSchema, body);
    const sh = await this.prisma.shipment.findUnique({ where: { id } });
    if (!sh) throw new NotFoundException();
    const updated = await this.prisma.shipment.update({
      where: { id },
      data: {
        codCollectionStatus: input.status,
        codCollectedAt: input.status === 'COLLECTED' ? new Date() : null,
      },
    });
    await this.audit.log({
      actorId: user.id,
      actorLabel: user.email,
      action: 'SHIPMENT_COD_STATUS_UPDATED',
      entityType: 'Shipment',
      entityId: id,
      before: { codCollectionStatus: sh.codCollectionStatus },
      after: { codCollectionStatus: updated.codCollectionStatus, evidence: input.evidence },
    });
    return updated;
  }

  @UseGuards(AdminGuard)
  @Post('admin/shipments/:id/documents')
  @UseInterceptors(FileInterceptor('file'))
  async uploadShipmentDocument(
    @Param('id') shipmentId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() user: AuthedUser,
  ) {
    const sh = await this.prisma.shipment.findUnique({
      where: { id: shipmentId },
      include: { supplierOrder: true },
    });
    if (!sh) throw new NotFoundException('Pengiriman tidak ditemukan.');

    // Shipping labels/resi for Telegram must be valid PDFs
    const detected = validateUpload(file, {
      allowed: ['application/pdf'],
      maxBytes: env().SHIPPING_DOC_MAX_BYTES,
    });

    const storageKey = this.storage.newKey('shipment-docs', sh.id, detected.ext);
    await this.storage.putPrivate(storageKey, file!.buffer, detected.mime);

    const originalName = safeDisplayName(file!.originalname, `label-${sh.trackingNumber || sh.id.slice(0, 8)}.pdf`);
    const doc = await this.prisma.shipmentDocument.create({
      data: {
        shipmentId: sh.id,
        storageKey,
        docType: 'SHIPPING_LABEL',
        originalName,
        mime: detected.mime,
        sizeBytes: file!.buffer.length,
        sha256: sha256(file!.buffer),
        source: 'ADMIN_UPLOAD',
        customerVisible: true,
        uploadedById: user.id,
      },
    });

    // Automatically enqueue Telegram sendDocument (records status and retries on transient error)
    const telegramDelivery = await this.telegram.enqueueDocument(doc.id);

    await this.audit.log({
      actorId: user.id,
      actorLabel: user.email,
      action: 'SHIPMENT_PDF_UPLOADED',
      entityType: 'ShipmentDocument',
      entityId: doc.id,
      after: {
        shipmentId: sh.id,
        originalName: doc.originalName,
        sizeBytes: doc.sizeBytes,
        telegramStatus: telegramDelivery?.status,
      },
    });

    return { document: doc, telegramDelivery };
  }

  @UseGuards(AdminGuard)
  @Get('admin/shipment-documents/:docId/file')
  async adminDownloadShipmentDoc(@Param('docId') docId: string, @Res() res: Response) {
    const doc = await this.prisma.shipmentDocument.findUnique({ where: { id: docId } });
    if (!doc) throw new NotFoundException('Dokumen tidak ditemukan.');
    const signed = await this.storage.signedUrl(doc.storageKey, doc.originalName);
    if (signed) return res.redirect(signed);
    const bytes = await this.storage.readPrivate(doc.storageKey);
    res.setHeader('Content-Type', doc.mime);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Content-Disposition', `inline; filename="${doc.originalName.replace(/"/g, '')}"`);
    return res.send(bytes);
  }

  // ─────────────────────── Admin Customers & Audit Logs ───────────────────────

  @UseGuards(AdminGuard)
  @Get('admin/customers')
  async listCustomers(@Query('q') q?: string) {
    return this.prisma.customer.findMany({
      where: q
        ? {
            OR: [
              { name: { contains: q, mode: 'insensitive' } },
              { phone: { contains: q } },
              { email: { contains: q, mode: 'insensitive' } },
            ],
          }
        : undefined,
      orderBy: { updatedAt: 'desc' },
      take: 100,
      include: {
        orders: {
          orderBy: { createdAt: 'desc' },
          take: 5,
          select: {
            id: true,
            orderNumber: true,
            grandTotal: true,
            paymentMethod: true,
            paymentStatus: true,
            orderStatus: true,
            createdAt: true,
          },
        },
        _count: { select: { orders: true } },
      },
    });
  }

  @UseGuards(AdminGuard)
  @Get('admin/audit-logs')
  async listAuditLogs(@Query('entityType') entityType?: string, @Query('limit') limitRaw?: string) {
    const take = Math.min(200, Math.max(10, Number(limitRaw) || 100));
    return this.prisma.auditLog.findMany({
      where: entityType ? { entityType } : undefined,
      orderBy: { createdAt: 'desc' },
      take,
      include: { actor: { select: { id: true, email: true, name: true, role: true } } },
    });
  }

  // ─────────────────────── Payment Gateway Webhook (Midtrans Adapter) ───────────────────────

  @Post('webhooks/payments/midtrans')
  async midtransWebhook(
    @Body() payload: Record<string, unknown>,
    @Headers('x-callback-token') _callbackToken?: string,
  ) {
    const e = env();
    if (e.PAYMENT_PROVIDER !== 'midtrans' || !e.MIDTRANS_SERVER_KEY) {
      throw new BadRequestException('Payment gateway Midtrans tidak aktif.');
    }

    const orderId = String(payload.order_id ?? '');
    const statusCode = String(payload.status_code ?? '');
    const grossAmount = String(payload.gross_amount ?? '');
    const signatureKey = String(payload.signature_key ?? '');
    const transactionStatus = String(payload.transaction_status ?? '');
    const fraudStatus = String(payload.fraud_status ?? 'accept');
    const transactionId = String(payload.transaction_id ?? `${orderId}:${transactionStatus}`);

    if (!orderId || !statusCode || !grossAmount || !signatureKey) {
      throw new BadRequestException('Payload webhook tidak lengkap.');
    }

    // Midtrans signature formula: SHA512(order_id + status_code + gross_amount + ServerKey)
    const { createHash } = await import('node:crypto');
    const expectedSig = createHash('sha512')
      .update(`${orderId}${statusCode}${grossAmount}${e.MIDTRANS_SERVER_KEY}`)
      .digest('hex');
    const signatureValid = safeEqual(signatureKey.toLowerCase(), expectedSig.toLowerCase());

    const externalEventId = `${transactionId}:${transactionStatus}:${statusCode}`;
    const payloadHash = sha256(JSON.stringify(payload));

    // Idempotent check
    const existingEvent = await this.prisma.webhookEvent.findUnique({
      where: { provider_externalEventId: { provider: 'midtrans', externalEventId } },
    });
    if (existingEvent && existingEvent.processingStatus === 'PROCESSED') {
      return { ok: true, idempotent: true };
    }

    const eventRecord =
      existingEvent ??
      (await this.prisma.webhookEvent.create({
        data: {
          provider: 'midtrans',
          externalEventId,
          signatureVerified: signatureValid,
          payloadHash,
          redactedPayload: redact(payload) as Prisma.InputJsonValue,
          processingStatus: signatureValid ? 'RECEIVED' : 'REJECTED',
          error: signatureValid ? null : 'Signature tidak valid',
        },
      }));

    if (!signatureValid) {
      throw new ForbiddenException('Tanda tangan webhook tidak sah.');
    }

    const order = await this.prisma.order.findUnique({
      where: { orderNumber: orderId },
      include: { payments: true },
    });
    if (!order) {
      await this.prisma.webhookEvent.update({
        where: { id: eventRecord.id },
        data: { processingStatus: 'REJECTED', error: 'Order tidak ditemukan' },
      });
      throw new NotFoundException('Order tidak ditemukan.');
    }

    const numericGross = Math.trunc(Number(grossAmount));
    if (numericGross !== order.grandTotal) {
      await this.prisma.webhookEvent.update({
        where: { id: eventRecord.id },
        data: { processingStatus: 'REJECTED', error: `Gross amount ${numericGross} != ${order.grandTotal}` },
      });
      throw new BadRequestException('Nominal pembayaran webhook tidak sesuai dengan total pesanan.');
    }

    let nextPayStatus: PaymentStatus | null = null;
    if (
      (transactionStatus === 'capture' && fraudStatus === 'accept') ||
      transactionStatus === 'settlement'
    ) {
      nextPayStatus = 'PAID';
    } else if (transactionStatus === 'expire') {
      nextPayStatus = 'EXPIRED';
    } else if (transactionStatus === 'cancel' || transactionStatus === 'deny') {
      nextPayStatus = 'CANCELLED';
    }

    if (nextPayStatus && nextPayStatus !== order.paymentStatus) {
      await this.prisma.$transaction(async (tx) => {
        await tx.order.update({
          where: { id: order.id },
          data: {
            paymentStatus: nextPayStatus!,
            orderStatus:
              nextPayStatus === 'PAID' && order.orderStatus === 'PENDING_PAYMENT'
                ? 'AWAITING_FULFILLMENT'
                : order.orderStatus,
          },
        });
        await tx.payment.updateMany({
          where: { orderId: order.id },
          data: {
            status: nextPayStatus!,
            providerTransactionId: transactionId,
            paidAt: nextPayStatus === 'PAID' ? new Date() : undefined,
          },
        });
        await tx.orderStatusHistory.create({
          data: {
            orderId: order.id,
            field: 'paymentStatus',
            fromValue: order.paymentStatus,
            toValue: nextPayStatus!,
            note: `Webhook Midtrans terverifikasi (${transactionStatus})`,
          },
        });
      });
    }

    await this.prisma.webhookEvent.update({
      where: { id: eventRecord.id },
      data: { processingStatus: 'PROCESSED', processedAt: new Date() },
    });

    await this.audit.log({
      actorLabel: 'webhook:midtrans',
      action: `WEBHOOK_MIDTRANS_${transactionStatus.toUpperCase()}`,
      entityType: 'Order',
      entityId: order.id,
      after: { externalEventId, nextPayStatus },
    });

    return { ok: true, status: nextPayStatus ?? order.paymentStatus };
  }
}

