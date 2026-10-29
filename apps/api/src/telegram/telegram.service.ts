import {
  BadRequestException,
  Body,
  Controller,
  Injectable,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { telegramTestSchema } from '@store/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { StorageService } from '../storage/storage.service';
import { AdminGuard, AuthedUser, CurrentUser, Roles } from '../auth/auth.module';
import { env } from '../config/env';
import { maskChatId, sanitizeError } from '../common/crypto';
import { parseOrThrow } from '../common/zod.pipe';

@Injectable()
export class TelegramService implements OnModuleInit, OnModuleDestroy {
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
  ) {}

  onModuleInit() {
    if (env().JOB_WORKER_ENABLED && env().NODE_ENV !== 'test') {
      this.timer = setInterval(() => {
        void this.processPendingDeliveries().catch((e) =>
          console.warn('Telegram worker error:', sanitizeError(e)),
        );
      }, 10_000);
    }
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  isConfigured() {
    const e = env();
    return {
      enabled: e.TELEGRAM_SEND_ENABLED,
      hasCredentials: Boolean(e.TELEGRAM_BOT_TOKEN && e.TELEGRAM_CHAT_ID),
      chatIdMasked: e.TELEGRAM_CHAT_ID ? maskChatId(e.TELEGRAM_CHAT_ID) : null,
    };
  }

  /** Queue or reuse an idempotent TelegramDelivery record for a validated PDF ShipmentDocument. */
  async enqueueDocument(shipmentDocumentId: string, forceResend = false) {
    const doc = await this.prisma.shipmentDocument.findUnique({
      where: { id: shipmentDocumentId },
      include: {
        shipment: {
          include: {
            supplierOrder: {
              include: { order: true, supplier: true, warehouse: true, items: true },
            },
          },
        },
      },
    });
    if (!doc) throw new NotFoundException('Dokumen resi tidak ditemukan.');
    if (doc.mime !== 'application/pdf') {
      throw new BadRequestException('Hanya dokumen berformat PDF yang dikirim ke Telegram.');
    }

    const e = env();
    const targetChat = e.TELEGRAM_CHAT_ID || 'UNCONFIGURED';
    const dedupeKey = forceResend
      ? `doc:${doc.id}:chat:${targetChat}:resend:${Date.now()}`
      : `doc:${doc.id}:chat:${targetChat}`;

    const existing = await this.prisma.telegramDelivery.findUnique({ where: { dedupeKey } });
    if (existing && existing.status === 'SENT' && !forceResend) {
      return existing;
    }

    const delivery = existing
      ? await this.prisma.telegramDelivery.update({
          where: { id: existing.id },
          data: { status: 'PENDING', lastError: null },
        })
      : await this.prisma.telegramDelivery.create({
          data: {
            shipmentDocumentId: doc.id,
            kind: 'DOCUMENT',
            chatId: maskChatId(targetChat),
            dedupeKey,
            status: 'PENDING',
          },
        });

    await this.attemptSend(delivery.id);
    return this.prisma.telegramDelivery.findUnique({ where: { id: delivery.id } });
  }

  async attemptSend(deliveryId: string) {
    const delivery = await this.prisma.telegramDelivery.findUnique({
      where: { id: deliveryId },
      include: {
        shipmentDocument: {
          include: {
            shipment: {
              include: {
                supplierOrder: {
                  include: { order: true, supplier: true, warehouse: true, items: true },
                },
              },
            },
          },
        },
      },
    });
    if (!delivery || delivery.status === 'SENT') return delivery;

    const e = env();
    if (!e.TELEGRAM_SEND_ENABLED || !e.TELEGRAM_BOT_TOKEN || !e.TELEGRAM_CHAT_ID) {
      return this.prisma.telegramDelivery.update({
        where: { id: delivery.id },
        data: {
          status: 'FAILED',
          attemptCount: { increment: 1 },
          lastError: 'Telegram belum diaktifkan atau TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID belum dikonfigurasi.',
        },
      });
    }

    const doc = delivery.shipmentDocument;
    if (!doc) {
      return this.prisma.telegramDelivery.update({
        where: { id: delivery.id },
        data: { status: 'DEAD', lastError: 'Dokumen pengiriman tidak lagi tersedia.' },
      });
    }

    try {
      const pdfBytes = await this.storage.readPrivate(doc.storageKey);
      if (pdfBytes.length < 5 || pdfBytes.toString('ascii', 0, 5) !== '%PDF-') {
        throw new Error('File bukan PDF yang valid.');
      }

      const so = doc.shipment.supplierOrder;
      const ord = so.order;
      const itemLines = so.items
        .slice(0, 6)
        .map(
          (it) =>
            `• ${it.productNameSnap}${it.variantNameSnap ? ' (' + it.variantNameSnap + ')' : ''} [${it.skuSnap}] x${it.quantity}`,
        )
        .join('\n');
      const rawCaption = [
        `🛒 PESANAN MASUK & LABEL RESI PDF`,
        `No. Pesanan: ${ord.orderNumber} (Paket #${so.sequence})`,
        `Metode Bayar: ${ord.paymentMethod} (${ord.paymentStatus})`,
        `Total Tagihan: Rp ${ord.grandTotal.toLocaleString('id-ID')}`,
        ``,
        `👤 DATA DIRI PELANGGAN (PENERIMA):`,
        `Nama: ${ord.recipientName}`,
        `No. HP/WA: ${ord.phone}`,
        ...(ord.email ? [`Email: ${ord.email}`] : []),
        `Alamat: ${ord.addressLine}, Kec. ${ord.district}, ${ord.city}, ${ord.province}${ord.postalCode ? ' ' + ord.postalCode : ''}`,
        ...(ord.customerNote ? [`Catatan: ${ord.customerNote}`] : []),
        ``,
        `🚚 PENGIRIMAN:`,
        `Gudang Asal: ${so.warehouse.name} (${so.warehouse.city})`,
        `Kurir: ${doc.shipment.carrier}${doc.shipment.carrierService ? ' ' + doc.shipment.carrierService : ''}`,
        `No. Resi: ${doc.shipment.trackingNumber ?? 'Menunggu nomor resi kurir'}`,
        ``,
        `📦 ITEM PAKET:`,
        itemLines,
      ].join('\n');
      const caption = rawCaption.length > 1020 ? rawCaption.slice(0, 1017) + '...' : rawCaption;

      const form = new FormData();
      // Always use the server-configured chat_id allowlist, never arbitrary user input
      form.append('chat_id', e.TELEGRAM_CHAT_ID);
      form.append('caption', caption);
      form.append('document', new Blob([new Uint8Array(pdfBytes)], { type: 'application/pdf' }), doc.originalName || 'label-resi.pdf');

      const url = `${e.TELEGRAM_API_BASE.replace(/\/$/, '')}/bot${e.TELEGRAM_BOT_TOKEN}/sendDocument`;
      const res = await fetch(url, { method: 'POST', body: form, signal: AbortSignal.timeout(15_000) });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        description?: string;
        result?: { message_id?: number };
      };
      if (!res.ok || !json.ok) {
        throw new Error(json.description || `HTTP ${res.status} dari Telegram API`);
      }

      return await this.prisma.telegramDelivery.update({
        where: { id: delivery.id },
        data: {
          status: 'SENT',
          attemptCount: { increment: 1 },
          lastError: null,
          telegramMessageId: json.result?.message_id ? String(json.result.message_id) : null,
          sentAt: new Date(),
        },
      });
    } catch (err) {
      const nextAttempt = delivery.attemptCount + 1;
      const sanitized = sanitizeError(err);
      return this.prisma.telegramDelivery.update({
        where: { id: delivery.id },
        data: {
          status: nextAttempt >= 5 ? 'DEAD' : 'FAILED',
          attemptCount: nextAttempt,
          lastError: sanitized,
        },
      });
    }
  }

  async processPendingDeliveries() {
    const items = await this.prisma.telegramDelivery.findMany({
      where: { status: { in: ['PENDING', 'FAILED'] }, attemptCount: { lt: 5 } },
      take: 5,
      orderBy: { updatedAt: 'asc' },
    });
    for (const item of items) {
      // Exponential backoff: 2^attempt * 15s
      const waitMs = Math.pow(2, item.attemptCount) * 15_000;
      if (Date.now() - item.updatedAt.getTime() >= waitMs || item.attemptCount === 0) {
        await this.attemptSend(item.id);
      }
    }
  }

  async sendTest(dryRun: boolean, actor: AuthedUser) {
    const e = env();
    const masked = e.TELEGRAM_CHAT_ID ? maskChatId(e.TELEGRAM_CHAT_ID) : null;
    if (dryRun) {
      await this.audit.log({
        actorId: actor.id,
        actorLabel: actor.email,
        action: 'TELEGRAM_TEST_DRY_RUN',
        entityType: 'TelegramDelivery',
        after: { enabled: e.TELEGRAM_SEND_ENABLED, configured: Boolean(e.TELEGRAM_BOT_TOKEN && e.TELEGRAM_CHAT_ID), chatId: masked },
      });
      return {
        ok: true,
        dryRun: true,
        enabled: e.TELEGRAM_SEND_ENABLED,
        configured: Boolean(e.TELEGRAM_BOT_TOKEN && e.TELEGRAM_CHAT_ID),
        chatIdMasked: masked,
        message:
          e.TELEGRAM_BOT_TOKEN && e.TELEGRAM_CHAT_ID
            ? `Dry-run berhasil: konfigurasi siap mengirim ke chat ${masked}. Tidak ada pesan keluar yang dikirim.`
            : 'Dry-run: TELEGRAM_BOT_TOKEN atau TELEGRAM_CHAT_ID belum diisi di environment.',
      };
    }

    if (!e.TELEGRAM_SEND_ENABLED || !e.TELEGRAM_BOT_TOKEN || !e.TELEGRAM_CHAT_ID) {
      throw new BadRequestException(
        'Telegram belum aktif atau TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID belum dikonfigurasi.',
      );
    }

    try {
      const url = `${e.TELEGRAM_API_BASE.replace(/\/$/, '')}/bot${e.TELEGRAM_BOT_TOKEN}/sendMessage`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: e.TELEGRAM_CHAT_ID,
          text: `✅ Tes koneksi Telegram Toko berhasil (${new Date().toISOString()}).`,
        }),
        signal: AbortSignal.timeout(10_000),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        description?: string;
        result?: { message_id?: number };
      };
      if (!res.ok || !json.ok) {
        throw new Error(json.description || `HTTP ${res.status}`);
      }
      const log = await this.prisma.telegramDelivery.create({
        data: {
          kind: 'TEST',
          chatId: masked ?? '****',
          dedupeKey: `test:${Date.now()}`,
          status: 'SENT',
          attemptCount: 1,
          telegramMessageId: json.result?.message_id ? String(json.result.message_id) : null,
          sentAt: new Date(),
        },
      });
      await this.audit.log({
        actorId: actor.id,
        actorLabel: actor.email,
        action: 'TELEGRAM_TEST_SENT',
        entityType: 'TelegramDelivery',
        entityId: log.id,
        after: { chatId: masked, messageId: log.telegramMessageId },
      });
      return {
        ok: true,
        dryRun: false,
        chatIdMasked: masked,
        telegramMessageId: log.telegramMessageId,
        message: `Pesan uji berhasil dikirim ke chat ${masked}.`,
      };
    } catch (err) {
      const sanitized = sanitizeError(err);
      await this.audit.log({
        actorId: actor.id,
        actorLabel: actor.email,
        action: 'TELEGRAM_TEST_FAILED',
        entityType: 'TelegramDelivery',
        after: { chatId: masked, error: sanitized },
      });
      throw new BadRequestException(`Gagal mengirim pesan uji Telegram: ${sanitized}`);
    }
  }
}

@UseGuards(AdminGuard)
@Controller('api/admin')
export class TelegramController {
  constructor(
    private readonly telegram: TelegramService,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Roles('OWNER', 'ADMIN')
  @Post('telegram/test')
  async testNotification(@Body() body: unknown, @CurrentUser() user: AuthedUser) {
    const input = parseOrThrow(telegramTestSchema, body ?? {});
    return this.telegram.sendTest(Boolean(input.dryRun), user);
  }

  @Post('shipments/:id/retry-telegram')
  async retryShipmentDocs(@Param('id') shipmentId: string, @CurrentUser() user: AuthedUser) {
    const docs = await this.prisma.shipmentDocument.findMany({
      where: { shipmentId, mime: 'application/pdf' },
    });
    if (!docs.length) throw new BadRequestException('Belum ada dokumen PDF pada pengiriman ini.');
    const results = [];
    for (const d of docs) {
      results.push(await this.telegram.enqueueDocument(d.id, true));
    }
    await this.audit.log({
      actorId: user.id,
      actorLabel: user.email,
      action: 'TELEGRAM_DELIVERY_RETRIED',
      entityType: 'Shipment',
      entityId: shipmentId,
      after: { count: results.length },
    });
    return { results };
  }
}
