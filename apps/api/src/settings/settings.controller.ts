import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Put,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { Prisma } from '@prisma/client';
import {
  codSettingsSchema,
  legalPagesSchema,
  paymentSettingsSchema,
  sectionContentSchemas,
  shippingSettingsSchema,
  storeSettingsSchema,
  type HomepageSectionType,
} from '@store/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AdminGuard, AuthedUser, CurrentUser, Roles } from '../auth/auth.module';
import { parseOrThrow } from '../common/zod.pipe';
import { env } from '../config/env';
import { maskChatId } from '../common/crypto';
import { StorageService } from '../storage/storage.service';
import { validateUpload } from '../common/file-validation';

export const DEFAULT_STORE_SETTINGS = {
  storeName: 'Pasti Murahnya',
  tagline: 'Pasti Murah, Pasti Puas! • Belanja Hemat, Tanpa Ragu.',
  logoUrl: '/demo/logo-pasti-murahnya.jpg',
  announcement:
    'Pasti Murah, Pasti Puas! • Harga Bersahabat, Dompet Selamat • Cari Murah? Pasti di Sini • Murahnya Pasti, Kualitasnya Oke',
  supportEmail: 'halo@pastimurahnya.id',
  whatsappNumber: '6282233038659',
  serviceHours: 'Senin–Sabtu, 09.00–18.00 WIB',
  address: 'Jakarta Selatan, DKI Jakarta, Indonesia',
  instagramUrl: '',
  tiktokUrl: '',
  footerAbout:
    'Pastimurah menyediakan berbagai kebutuhan dengan harga terjangkau tanpa mengorbankan kualitas. Belanja mudah, pelayanan ramah, dan harganya pasti murah. Males bandingin harga? Di Pastimurah semuanya udah dibikin murah dari awal. Tinggal pilih, checkout, hemat!',
};

export const DEFAULT_PAYMENT_SETTINGS = {
  bankTransferEnabled: true,
  bankName: 'Bank Jago',
  bankAccountName: 'Rekening Resmi Toko (Ubah di Pengaturan)',
  bankAccountNumber: '108993773895',
  transferInstructions:
    'Transfer sesuai nominal total pesanan (hingga digit terakhir), lalu unggah foto/PDF bukti transfer di halaman pesanan Anda. Pesanan diproses setelah tim admin memverifikasi mutasi masuk.',
  qrisStaticEnabled: true,
  qrisImageUrl: '/demo/qris-store.jpg',
  paymentWindowHours: 24,
  proofMaxBytes: 5 * 1024 * 1024,
};

export const DEFAULT_COD_SETTINGS = {
  codEnabled: true,
  codFeeFlat: 5000,
  codFeePercentBps: 0,
  codMaxOrderTotal: 3_000_000,
  codBlockedProvinces: [] as string[],
  codNotes:
    'Bayar tunai langsung ke kurir saat paket tiba. Hanya tersedia untuk produk dan gudang yang mendukung COD.',
};

export const DEFAULT_SHIPPING_SETTINGS = {
  provider: 'rajaongkir' as 'rajaongkir' | 'flat',
  couriers: ['jne', 'sicepat', 'jnt'],
  flatRatePerGroup: 18000,
  flatRateLabel: 'Reguler Nasional (2–4 hari)',
  freeShippingMinSubtotal: 0,
};

export const DEFAULT_LEGAL_PAGES = {
  pages: [
    {
      slug: 'syarat-ketentuan' as const,
      title: 'Syarat & Ketentuan Penggunaan',
      body: '[DRAFT — Tinjau bersama pemilik toko sebelum produksi]\n\n1. Harga tertera dalam Rupiah (IDR) dan dihitung ulang di server saat checkout.\n2. Pesanan dari beberapa pemasok/gudang dapat dikirim dalam beberapa paket terpisah dengan nomor resi masing-masing.\n3. Pembayaran transfer bank/QRIS manual baru dinyatakan lunas setelah diverifikasi oleh admin terhadap mutasi rekening.',
      ownerReviewed: false,
    },
    {
      slug: 'kebijakan-privasi' as const,
      title: 'Kebijakan Privasi',
      body: '[DRAFT — Tinjau bersama pemilik toko sebelum produksi]\n\nData nama penerima, nomor telepon/WhatsApp, dan alamat pengiriman digunakan semata-mata untuk pemenuhan pesanan, pengiriman kurir, dan dukungan pelanggan. Bukti pembayaran disimpan pada penyimpanan privat terbatas.',
      ownerReviewed: false,
    },
    {
      slug: 'pengembalian' as const,
      title: 'Kebijakan Pengembalian & Retur',
      body: '[DRAFT — Tinjau bersama pemilik toko sebelum produksi]\n\nPermohonan retur karena barang rusak atau tidak sesuai dapat diajukan maksimal 2x24 jam sejak status paket diterima dengan menyertakan video unboxing utuh dan nomor pesanan.',
      ownerReviewed: false,
    },
    {
      slug: 'pengiriman' as const,
      title: 'Informasi Pengiriman Multi-Gudang',
      body: 'Produk dikirim langsung dari gudang mitra pemasok terkait. Apabila pesanan Anda terdiri dari barang yang berada di gudang berbeda, sistem secara otomatis membagi pengiriman agar tiap paket dikirim dari lokasi terdekat dan setiap paket memiliki nomor resi tersendiri.',
      ownerReviewed: true,
    },
    {
      slug: 'bantuan' as const,
      title: 'Pusat Bantuan & FAQ',
      body: '• Bagaimana cara melacak pesanan? Buka menu Lacak Pesanan dan gunakan tautan aman yang diberikan saat checkout.\n• Mengapa pesanan saya memiliki lebih dari satu resi? Karena item berasal dari gudang mitra yang berbeda.\n• Kapan pembayaran transfer diverifikasi? Pada jam layanan toko setelah bukti diunggah.',
      ownerReviewed: true,
    },
  ],
};

@Controller()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async get<T>(key: string, fallback: T): Promise<T> {
    const row = await this.prisma.storeSetting.findUnique({ where: { key } });
    if (!row) return fallback;
    return { ...fallback, ...(row.value as object) } as T;
  }

  async set(key: string, value: unknown, actor: AuthedUser) {
    const prev = await this.prisma.storeSetting.findUnique({ where: { key } });
    const saved = await this.prisma.storeSetting.upsert({
      where: { key },
      create: { key, value: value as Prisma.InputJsonValue, updatedBy: actor.id },
      update: { value: value as Prisma.InputJsonValue, updatedBy: actor.id },
    });
    await this.audit.log({
      actorId: actor.id,
      actorLabel: actor.email,
      action: `SETTING_UPDATED:${key.toUpperCase()}`,
      entityType: 'StoreSetting',
      entityId: key,
      before: prev?.value ?? null,
      after: saved.value,
    });
    return saved.value;
  }

  async getAllPublic() {
    const [store, payment, cod, shipping, legal, sections] = await Promise.all([
      this.get('store', DEFAULT_STORE_SETTINGS),
      this.get('payment', DEFAULT_PAYMENT_SETTINGS),
      this.get('cod', DEFAULT_COD_SETTINGS),
      this.get('shipping', DEFAULT_SHIPPING_SETTINGS),
      this.get('legal', DEFAULT_LEGAL_PAGES),
      this.prisma.homepageSection.findMany({
        where: { status: 'ENABLED' },
        orderBy: { sortOrder: 'asc' },
      }),
    ]);
    const e = env();
    const gatewayActive = e.PAYMENT_PROVIDER === 'midtrans' && Boolean(e.MIDTRANS_SERVER_KEY);
    return {
      store,
      demoMode: e.DEMO_MODE,
      payment: {
        bankTransferEnabled: payment.bankTransferEnabled && Boolean(payment.bankAccountNumber),
        bankName: payment.bankName,
        bankAccountName: payment.bankAccountName,
        bankAccountNumber: payment.bankAccountNumber,
        transferInstructions: payment.transferInstructions,
        qrisStaticEnabled: payment.qrisStaticEnabled && Boolean(payment.qrisImageUrl),
        qrisImageUrl: payment.qrisImageUrl,
        qrisGatewayEnabled: gatewayActive && e.ENABLE_QRIS,
        virtualAccountEnabled: gatewayActive && e.ENABLE_VIRTUAL_ACCOUNT,
        vaBanks: gatewayActive && e.ENABLE_VIRTUAL_ACCOUNT ? e.VA_BANKS.split(',').map((b) => b.trim()) : [],
        paymentWindowHours: payment.paymentWindowHours,
        proofMaxBytes: payment.proofMaxBytes,
      },
      cod: {
        codEnabled: cod.codEnabled,
        codFeeFlat: cod.codFeeFlat,
        codFeePercentBps: cod.codFeePercentBps,
        codMaxOrderTotal: cod.codMaxOrderTotal,
        codBlockedProvinces: cod.codBlockedProvinces,
        codNotes: cod.codNotes,
      },
      shipping: {
        provider: e.SHIPPING_PROVIDER === 'rajaongkir' && e.RAJAONGKIR_API_KEY ? shipping.provider : 'flat',
        freeShippingMinSubtotal: shipping.freeShippingMinSubtotal,
      },
      legal: legal.pages,
      homepage: sections.map((s) => ({
        id: s.id,
        type: s.type,
        sortOrder: s.sortOrder,
        content: s.publishedContent ?? s.draftContent,
      })),
    };
  }

  integrationsStatus() {
    const e = env();
    return {
      paymentGateway: {
        provider: e.PAYMENT_PROVIDER,
        configured: e.PAYMENT_PROVIDER === 'midtrans' && Boolean(e.MIDTRANS_SERVER_KEY),
        isProduction: e.MIDTRANS_IS_PRODUCTION,
        qrisEnabled: e.ENABLE_QRIS,
        vaEnabled: e.ENABLE_VIRTUAL_ACCOUNT,
      },
      shipping: {
        provider: e.SHIPPING_PROVIDER,
        rajaOngkirConfigured: Boolean(e.RAJAONGKIR_API_KEY),
        baseUrl: e.RAJAONGKIR_BASE_URL,
      },
      telegram: {
        enabled: e.TELEGRAM_SEND_ENABLED,
        botTokenConfigured: Boolean(e.TELEGRAM_BOT_TOKEN),
        chatIdMasked: e.TELEGRAM_CHAT_ID ? maskChatId(e.TELEGRAM_CHAT_ID) : null,
      },
      storage: {
        provider: e.STORAGE_PROVIDER,
        s3Configured: e.STORAGE_PROVIDER === 's3' && Boolean(e.S3_BUCKET_PRIVATE && e.S3_ACCESS_KEY_ID),
      },
      whatsapp: {
        businessApiEnabled: false,
        mode: 'click_to_chat_wa_me',
      },
    };
  }
}

@Controller('api')
export class SettingsController {
  constructor(
    private readonly settings: SettingsService,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
  ) {}

  @Get('health')
  async health() {
    await this.prisma.$queryRaw`SELECT 1`;
    return { ok: true, status: 'healthy', timestamp: new Date().toISOString(), demoMode: env().DEMO_MODE };
  }

  @Get('store-config')
  async publicConfig() {
    return this.settings.getAllPublic();
  }

  @Get('media/:file')
  async servePublicMedia(@Param('file') file: string, @Res() res: Response) {
    const p = this.storage.publicPath(file);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.sendFile(p);
  }

  // ── Admin settings
  @UseGuards(AdminGuard)
  @Get('admin/settings')
  async adminGetAll() {
    const [store, payment, cod, shipping, legal] = await Promise.all([
      this.settings.get('store', DEFAULT_STORE_SETTINGS),
      this.settings.get('payment', DEFAULT_PAYMENT_SETTINGS),
      this.settings.get('cod', DEFAULT_COD_SETTINGS),
      this.settings.get('shipping', DEFAULT_SHIPPING_SETTINGS),
      this.settings.get('legal', DEFAULT_LEGAL_PAGES),
    ]);
    return {
      store,
      payment,
      cod,
      shipping,
      legal,
      integrations: this.settings.integrationsStatus(),
    };
  }

  @UseGuards(AdminGuard)
  @Roles('OWNER', 'ADMIN')
  @Put('admin/settings/store')
  async updateStore(@Body() body: unknown, @CurrentUser() user: AuthedUser) {
    const data = parseOrThrow(storeSettingsSchema, body);
    return this.settings.set('store', data, user);
  }

  @UseGuards(AdminGuard)
  @Roles('OWNER', 'ADMIN')
  @Put('admin/settings/payment')
  async updatePayment(@Body() body: unknown, @CurrentUser() user: AuthedUser) {
    const data = parseOrThrow(paymentSettingsSchema, body);
    return this.settings.set('payment', data, user);
  }

  @UseGuards(AdminGuard)
  @Roles('OWNER', 'ADMIN')
  @Put('admin/settings/cod')
  async updateCod(@Body() body: unknown, @CurrentUser() user: AuthedUser) {
    const data = parseOrThrow(codSettingsSchema, body);
    return this.settings.set('cod', data, user);
  }

  @UseGuards(AdminGuard)
  @Roles('OWNER', 'ADMIN')
  @Put('admin/settings/shipping')
  async updateShipping(@Body() body: unknown, @CurrentUser() user: AuthedUser) {
    const data = parseOrThrow(shippingSettingsSchema, body);
    return this.settings.set('shipping', data, user);
  }

  @UseGuards(AdminGuard)
  @Roles('OWNER', 'ADMIN')
  @Put('admin/settings/legal')
  async updateLegal(@Body() body: unknown, @CurrentUser() user: AuthedUser) {
    const data = parseOrThrow(legalPagesSchema, body);
    return this.settings.set('legal', data, user);
  }

  @UseGuards(AdminGuard)
  @Roles('OWNER', 'ADMIN')
  @Post('admin/media')
  @UseInterceptors(FileInterceptor('file'))
  async uploadPublicImage(
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() user: AuthedUser,
  ) {
    const detected = validateUpload(file, {
      allowed: ['image/jpeg', 'image/png', 'image/webp'],
      maxBytes: 5 * 1024 * 1024,
    });
    const savedName = await this.storage.putPublic(file!.buffer, detected.ext as 'jpg' | 'png' | 'webp');
    const url = `/media/${savedName}`;
    await this.audit.log({
      actorId: user.id,
      actorLabel: user.email,
      action: 'PUBLIC_MEDIA_UPLOADED',
      entityType: 'Media',
      entityId: savedName,
      after: { url, size: file!.size, mime: detected.mime },
    });
    return { url };
  }

  // ── Homepage CMS (draft / preview / reorder / publish)
  @UseGuards(AdminGuard)
  @Get('admin/cms/sections')
  async listCmsSections() {
    return this.prisma.homepageSection.findMany({ orderBy: { draftSortOrder: 'asc' } });
  }

  @UseGuards(AdminGuard)
  @Roles('OWNER', 'ADMIN')
  @Post('admin/cms/sections')
  async createSection(@Body() body: { type?: HomepageSectionType; content?: unknown }, @CurrentUser() user: AuthedUser) {
    const type = body?.type ?? 'PROMO_BANNER';
    const schema = sectionContentSchemas[type];
    if (!schema) throw new NotFoundException('Tipe seksi tidak dikenal');
    const content = parseOrThrow<unknown>(schema, body.content);
    const count = await this.prisma.homepageSection.count();
    const created = await this.prisma.homepageSection.create({
      data: {
        type,
        sortOrder: count,
        draftSortOrder: count,
        status: 'ENABLED',
        draftStatus: 'ENABLED',
        draftContent: content as Prisma.InputJsonValue,
        publishedContent: content as Prisma.InputJsonValue,
        publishedAt: new Date(),
      },
    });
    await this.audit.log({
      actorId: user.id,
      actorLabel: user.email,
      action: 'CMS_SECTION_CREATED',
      entityType: 'HomepageSection',
      entityId: created.id,
      after: created,
    });
    return created;
  }

  @UseGuards(AdminGuard)
  @Roles('OWNER', 'ADMIN')
  @Patch('admin/cms/sections/:id')
  async updateSectionDraft(
    @Param('id') id: string,
    @Body() body: { draftContent?: unknown; draftStatus?: 'ENABLED' | 'DISABLED'; draftSortOrder?: number },
    @CurrentUser() user: AuthedUser,
  ) {
    const existing = await this.prisma.homepageSection.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Seksi tidak ditemukan');
    const schema = sectionContentSchemas[existing.type as HomepageSectionType];
    const nextContent =
      body.draftContent !== undefined ? parseOrThrow<unknown>(schema, body.draftContent) : existing.draftContent;
    const updated = await this.prisma.homepageSection.update({
      where: { id },
      data: {
        draftContent: nextContent as Prisma.InputJsonValue,
        draftStatus: body.draftStatus ?? existing.draftStatus,
        draftSortOrder: typeof body.draftSortOrder === 'number' ? body.draftSortOrder : existing.draftSortOrder,
      },
    });
    await this.audit.log({
      actorId: user.id,
      actorLabel: user.email,
      action: 'CMS_SECTION_DRAFT_SAVED',
      entityType: 'HomepageSection',
      entityId: id,
      before: existing.draftContent,
      after: updated.draftContent,
    });
    return updated;
  }

  @UseGuards(AdminGuard)
  @Roles('OWNER', 'ADMIN')
  @Post('admin/cms/reorder')
  async reorderSections(@Body() body: { ids?: string[] }, @CurrentUser() user: AuthedUser) {
    const ids = Array.isArray(body?.ids) ? body.ids : [];
    await this.prisma.$transaction(
      ids.map((id, idx) =>
        this.prisma.homepageSection.update({ where: { id }, data: { draftSortOrder: idx } }),
      ),
    );
    await this.audit.log({
      actorId: user.id,
      actorLabel: user.email,
      action: 'CMS_SECTIONS_REORDERED',
      entityType: 'HomepageSection',
      after: { ids },
    });
    return this.prisma.homepageSection.findMany({ orderBy: { draftSortOrder: 'asc' } });
  }

  @UseGuards(AdminGuard)
  @Roles('OWNER', 'ADMIN')
  @Post('admin/cms/publish')
  async publishHomepage(@CurrentUser() user: AuthedUser) {
    const all = await this.prisma.homepageSection.findMany();
    const now = new Date();
    await this.prisma.$transaction(
      all.map((s) =>
        this.prisma.homepageSection.update({
          where: { id: s.id },
          data: {
            sortOrder: s.draftSortOrder,
            status: s.draftStatus,
            publishedContent: s.draftContent as Prisma.InputJsonValue,
            publishedAt: now,
            version: { increment: 1 },
          },
        }),
      ),
    );
    await this.audit.log({
      actorId: user.id,
      actorLabel: user.email,
      action: 'CMS_HOMEPAGE_PUBLISHED',
      entityType: 'HomepageSection',
      after: { count: all.length, publishedAt: now.toISOString() },
    });
    return this.prisma.homepageSection.findMany({ orderBy: { sortOrder: 'asc' } });
  }

  @UseGuards(AdminGuard)
  @Roles('OWNER', 'ADMIN')
  @Delete('admin/cms/sections/:id')
  async deleteSection(@Param('id') id: string, @CurrentUser() user: AuthedUser) {
    const existing = await this.prisma.homepageSection.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException();
    await this.prisma.homepageSection.delete({ where: { id } });
    await this.audit.log({
      actorId: user.id,
      actorLabel: user.email,
      action: 'CMS_SECTION_DELETED',
      entityType: 'HomepageSection',
      entityId: id,
      before: existing,
    });
    return { ok: true };
  }
}
