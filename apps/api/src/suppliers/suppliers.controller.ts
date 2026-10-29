import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { offerSchema, stockAdjustSchema, supplierSchema, warehouseSchema } from '@store/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AdminGuard, AuthedUser, CurrentUser, Roles } from '../auth/auth.module';
import { parseOrThrow } from '../common/zod.pipe';

@UseGuards(AdminGuard)
@Controller('api/admin')
export class SuppliersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ── Suppliers
  @Get('suppliers')
  async listSuppliers() {
    return this.prisma.supplier.findMany({
      orderBy: { name: 'asc' },
      include: {
        warehouses: { orderBy: { name: 'asc' } },
        _count: { select: { offers: true, supplierOrders: true } },
      },
    });
  }

  @Roles('OWNER', 'ADMIN')
  @Post('suppliers')
  async createSupplier(@Body() body: unknown, @CurrentUser() user: AuthedUser) {
    const data = parseOrThrow(supplierSchema, body);
    const dup = await this.prisma.supplier.findUnique({ where: { name: data.name } });
    if (dup) throw new ConflictException('Nama pemasok sudah terdaftar.');
    const created = await this.prisma.supplier.create({
      data: {
        ...data,
        contactEmail: data.contactEmail || null,
        portalUrl: data.portalUrl || null,
      },
    });
    await this.audit.log({
      actorId: user.id,
      actorLabel: user.email,
      action: 'SUPPLIER_CREATED',
      entityType: 'Supplier',
      entityId: created.id,
      after: created,
    });
    return created;
  }

  @Roles('OWNER', 'ADMIN')
  @Patch('suppliers/:id')
  async updateSupplier(@Param('id') id: string, @Body() body: unknown, @CurrentUser() user: AuthedUser) {
    const before = await this.prisma.supplier.findUnique({ where: { id } });
    if (!before) throw new NotFoundException();
    const data = parseOrThrow(supplierSchema.partial(), body);
    const updated = await this.prisma.supplier.update({
      where: { id },
      data: {
        ...data,
        contactEmail: data.contactEmail === '' ? null : data.contactEmail,
        portalUrl: data.portalUrl === '' ? null : data.portalUrl,
      },
    });
    await this.audit.log({
      actorId: user.id,
      actorLabel: user.email,
      action: 'SUPPLIER_UPDATED',
      entityType: 'Supplier',
      entityId: id,
      before,
      after: updated,
    });
    return updated;
  }

  // ── Warehouses
  @Get('warehouses')
  async listWarehouses() {
    return this.prisma.warehouse.findMany({
      orderBy: [{ city: 'asc' }, { name: 'asc' }],
      include: { supplier: true },
    });
  }

  @Roles('OWNER', 'ADMIN')
  @Post('warehouses')
  async createWarehouse(@Body() body: unknown, @CurrentUser() user: AuthedUser) {
    const data = parseOrThrow(warehouseSchema, body);
    const created = await this.prisma.warehouse.create({
      data,
      include: { supplier: true },
    });
    await this.audit.log({
      actorId: user.id,
      actorLabel: user.email,
      action: 'WAREHOUSE_CREATED',
      entityType: 'Warehouse',
      entityId: created.id,
      after: created,
    });
    return created;
  }

  @Roles('OWNER', 'ADMIN')
  @Patch('warehouses/:id')
  async updateWarehouse(@Param('id') id: string, @Body() body: unknown, @CurrentUser() user: AuthedUser) {
    const before = await this.prisma.warehouse.findUnique({ where: { id } });
    if (!before) throw new NotFoundException();
    const data = parseOrThrow(warehouseSchema.partial(), body);
    const updated = await this.prisma.warehouse.update({
      where: { id },
      data,
      include: { supplier: true },
    });
    await this.audit.log({
      actorId: user.id,
      actorLabel: user.email,
      action: 'WAREHOUSE_UPDATED',
      entityType: 'Warehouse',
      entityId: id,
      before,
      after: updated,
    });
    return updated;
  }

  // ── Supplier Offers
  @Get('supplier-offers')
  async listOffers(@Query('productId') productId?: string, @Query('supplierId') supplierId?: string) {
    return this.prisma.supplierOffer.findMany({
      where: {
        ...(productId ? { productId } : {}),
        ...(supplierId ? { supplierId } : {}),
      },
      orderBy: [{ fulfillmentPriority: 'asc' }, { updatedAt: 'desc' }],
      include: {
        product: { select: { id: true, sku: true, name: true, salePrice: true, status: true } },
        variant: { select: { id: true, sku: true, name: true } },
        supplier: true,
        warehouse: true,
      },
    });
  }

  @Roles('OWNER', 'ADMIN')
  @Post('supplier-offers')
  async createOffer(@Body() body: unknown, @CurrentUser() user: AuthedUser) {
    const data = parseOrThrow(offerSchema, body);
    const wh = await this.prisma.warehouse.findUnique({ where: { id: data.warehouseId } });
    if (!wh || wh.supplierId !== data.supplierId) {
      throw new BadRequestException('Gudang tidak sesuai dengan pemasok yang dipilih.');
    }
    const created = await this.prisma.$transaction(async (tx) => {
      const offer = await tx.supplierOffer.create({
        data: {
          ...data,
          variantId: data.variantId ?? null,
          supplierProductUrl: data.supplierProductUrl || null,
        },
        include: { supplier: true, warehouse: true, product: true },
      });
      if (data.stockQty > 0) {
        await tx.inventoryMovement.create({
          data: {
            offerId: offer.id,
            delta: data.stockQty,
            reason: 'INITIAL_STOCK',
            actorId: user.id,
            note: 'Stok awal saat membuat penawaran pemasok',
          },
        });
      }
      return offer;
    });
    await this.audit.log({
      actorId: user.id,
      actorLabel: user.email,
      action: 'SUPPLIER_OFFER_CREATED',
      entityType: 'SupplierOffer',
      entityId: created.id,
      after: {
        productId: created.productId,
        supplierId: created.supplierId,
        warehouseId: created.warehouseId,
        supplierSku: created.supplierSku,
        costPrice: created.costPrice,
        stockQty: created.stockQty,
      },
    });
    return created;
  }

  @Roles('OWNER', 'ADMIN')
  @Patch('supplier-offers/:id')
  async updateOffer(@Param('id') id: string, @Body() body: unknown, @CurrentUser() user: AuthedUser) {
    const before = await this.prisma.supplierOffer.findUnique({ where: { id } });
    if (!before) throw new NotFoundException();
    const data = parseOrThrow(offerSchema.partial(), body);
    const updated = await this.prisma.$transaction(async (tx) => {
      if (typeof data.stockQty === 'number' && data.stockQty !== before.stockQty) {
        await tx.inventoryMovement.create({
          data: {
            offerId: id,
            delta: data.stockQty - before.stockQty,
            reason: 'ADMIN_OFFER_EDIT',
            actorId: user.id,
          },
        });
      }
      return tx.supplierOffer.update({
        where: { id },
        data: {
          ...data,
          supplierProductUrl: data.supplierProductUrl === '' ? null : data.supplierProductUrl,
        },
        include: { supplier: true, warehouse: true, product: true },
      });
    });
    await this.audit.log({
      actorId: user.id,
      actorLabel: user.email,
      action: 'SUPPLIER_OFFER_UPDATED',
      entityType: 'SupplierOffer',
      entityId: id,
      before: { costPrice: before.costPrice, stockQty: before.stockQty, active: before.active },
      after: { costPrice: updated.costPrice, stockQty: updated.stockQty, active: updated.active },
    });
    return updated;
  }

  @Post('supplier-offers/:id/adjust-stock')
  async adjustStock(@Param('id') id: string, @Body() body: unknown, @CurrentUser() user: AuthedUser) {
    const data = parseOrThrow(stockAdjustSchema, body);
    const before = await this.prisma.supplierOffer.findUnique({ where: { id } });
    if (!before) throw new NotFoundException();
    const nextQty = before.stockQty + data.delta;
    if (nextQty < 0) throw new BadRequestException('Stok tidak boleh menjadi negatif.');

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.inventoryMovement.create({
        data: {
          offerId: id,
          delta: data.delta,
          reason: 'MANUAL_ADJUST',
          actorId: user.id,
          note: data.reason,
        },
      });
      return tx.supplierOffer.update({
        where: { id },
        data: { stockQty: nextQty },
        include: { supplier: true, warehouse: true, product: true },
      });
    });

    await this.audit.log({
      actorId: user.id,
      actorLabel: user.email,
      action: 'STOCK_ADJUSTED',
      entityType: 'SupplierOffer',
      entityId: id,
      before: { stockQty: before.stockQty },
      after: { stockQty: updated.stockQty, delta: data.delta, reason: data.reason },
    });
    return updated;
  }

  @Roles('OWNER', 'ADMIN')
  @Delete('supplier-offers/:id')
  async deleteOffer(@Param('id') id: string, @CurrentUser() user: AuthedUser) {
    const before = await this.prisma.supplierOffer.findUnique({ where: { id } });
    if (!before) throw new NotFoundException();
    const updated = await this.prisma.supplierOffer.update({ where: { id }, data: { active: false } });
    await this.audit.log({
      actorId: user.id,
      actorLabel: user.email,
      action: 'SUPPLIER_OFFER_DEACTIVATED',
      entityType: 'SupplierOffer',
      entityId: id,
      before: { active: before.active },
      after: { active: updated.active },
    });
    return updated;
  }
}

