import { z } from 'zod';
import {
  CodCollectionStatuses,
  ImportModes,
  IntegrationModes,
  PaymentMethods,
  ProductStatuses,
  ShipmentStatuses,
  SupplierOrderStatuses,
  UserRoles,
} from './enums';

const rupiah = z.number().int('Harus bilangan bulat').min(0, 'Tidak boleh negatif').max(10_000_000_000);
const slug = z
  .string()
  .trim()
  .min(2)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug hanya huruf kecil, angka, dan tanda hubung');
const sku = z
  .string()
  .trim()
  .min(2)
  .max(64)
  .regex(/^[A-Za-z0-9._-]+$/, 'SKU hanya huruf, angka, titik, garis bawah, tanda hubung')
  .transform((s) => s.toUpperCase());
export const httpUrl = z
  .string()
  .trim()
  .max(2048)
  .url('URL tidak valid')
  .refine((u) => /^https?:\/\//i.test(u), 'Hanya URL http/https');
/** Image URLs: absolute http(s) or site-relative path under /demo or /media. Never fetched by server. */
export const imageUrl = z
  .string()
  .trim()
  .max(2048)
  .refine((u) => /^https?:\/\//i.test(u) || /^\/(demo|media)\/[A-Za-z0-9._\-/]+$/.test(u), 'URL gambar tidak valid');

// ── Auth
export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Email tidak valid').max(200),
  password: z.string().min(1, 'Password wajib diisi').max(200),
});

export const createUserSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  name: z.string().trim().min(2).max(100),
  password: z.string().min(12, 'Minimal 12 karakter').max(200),
  role: z.enum(UserRoles),
});

// ── Catalog
export const categorySchema = z.object({
  name: z.string().trim().min(2).max(80),
  slug,
  icon: z.string().trim().max(40).optional().nullable(),
  imageUrl: imageUrl.optional().nullable(),
  parentId: z.string().uuid().optional().nullable(),
  sortOrder: z.number().int().min(0).max(9999).default(0),
  active: z.boolean().default(true),
});

export const variantInputSchema = z.object({
  id: z.string().uuid().optional(),
  sku,
  name: z.string().trim().min(1).max(80),
  priceOverride: rupiah.optional().nullable(),
  active: z.boolean().default(true),
  sortOrder: z.number().int().min(0).default(0),
});

export const productSchema = z
  .object({
    sku,
    slug,
    name: z.string().trim().min(3).max(160),
    description: z.string().max(20_000).default(''),
    categoryId: z.string().uuid().optional().nullable(),
    status: z.enum(ProductStatuses).default('DRAFT'),
    salePrice: rupiah.refine((v) => v > 0, 'Harga jual harus > 0'),
    compareAtPrice: rupiah.optional().nullable(),
    weightGram: z.number().int().min(1, 'Berat wajib untuk ongkir').max(100_000),
    lengthCm: z.number().int().min(0).max(500).optional().nullable(),
    widthCm: z.number().int().min(0).max(500).optional().nullable(),
    heightCm: z.number().int().min(0).max(500).optional().nullable(),
    highlights: z.array(z.string().trim().min(1).max(120)).max(10).default([]),
    badges: z.array(z.string().trim().min(1).max(60)).max(3).default([]),
    featured: z.boolean().default(false),
    initialStockQty: z.number().int().min(0).max(1_000_000).optional(),
    seoTitle: z.string().trim().max(120).optional().nullable(),
    seoDescription: z.string().trim().max(300).optional().nullable(),
    images: z
      .array(z.object({ url: imageUrl, alt: z.string().trim().max(160).default('') }))
      .max(8)
      .default([]),
    variants: z.array(variantInputSchema).max(30).default([]),
  })
  .refine((p) => p.compareAtPrice == null || p.compareAtPrice > p.salePrice, {
    message: 'Harga coret harus lebih besar dari harga jual',
    path: ['compareAtPrice'],
  });
export type ProductInput = z.infer<typeof productSchema>;

export const catalogQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  category: z.string().trim().max(120).optional(),
  minPrice: z.coerce.number().int().min(0).optional(),
  maxPrice: z.coerce.number().int().min(0).optional(),
  inStock: z
    .enum(['1', 'true', '0', 'false'])
    .optional()
    .transform((v) => v === '1' || v === 'true'),
  cod: z
    .enum(['1', 'true', '0', 'false'])
    .optional()
    .transform((v) => v === '1' || v === 'true'),
  sort: z.enum(['newest', 'price_asc', 'price_desc', 'popular', 'name']).default('newest'),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(60).default(12),
});

// ── Suppliers
export const supplierSchema = z.object({
  name: z.string().trim().min(2).max(120),
  active: z.boolean().default(true),
  integrationMode: z.enum(IntegrationModes).default('MANUAL'),
  sourcePlatform: z.string().trim().max(80).optional().nullable(),
  contactName: z.string().trim().max(100).optional().nullable(),
  contactPhone: z.string().trim().max(30).optional().nullable(),
  contactEmail: z.string().trim().email().max(200).optional().nullable().or(z.literal('')),
  portalUrl: httpUrl.optional().nullable().or(z.literal('')),
  externalRef: z.string().trim().max(120).optional().nullable(),
  credentialRef: z
    .string()
    .trim()
    .max(80)
    .regex(/^[A-Z0-9_]*$/, 'Nama variabel env (huruf besar/underscore), bukan isi rahasia')
    .optional()
    .nullable(),
  codSupported: z.boolean().default(false),
  publicLabel: z.string().trim().max(80).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
});

export const warehouseSchema = z.object({
  supplierId: z.string().uuid(),
  name: z.string().trim().min(2).max(120),
  city: z.string().trim().min(2).max(80),
  province: z.string().trim().max(80).optional().nullable(),
  address: z.string().trim().max(500).optional().nullable(),
  shippingOriginId: z.string().trim().max(40).optional().nullable(),
  active: z.boolean().default(true),
});

export const offerSchema = z.object({
  productId: z.string().uuid(),
  variantId: z.string().uuid().optional().nullable(),
  supplierId: z.string().uuid(),
  warehouseId: z.string().uuid(),
  supplierSku: z.string().trim().min(1).max(80),
  supplierProductUrl: httpUrl.optional().nullable().or(z.literal('')),
  costPrice: rupiah,
  stockQty: z.number().int().min(0).max(1_000_000),
  leadTimeDays: z.number().int().min(0).max(60).default(1),
  fulfillmentPriority: z.number().int().min(0).max(1000).default(100),
  codEnabled: z.boolean().default(false),
  integrationMode: z.enum(IntegrationModes).default('MANUAL'),
  active: z.boolean().default(true),
});

export const stockAdjustSchema = z.object({
  delta: z
    .number()
    .int()
    .refine((v) => v !== 0, 'Perubahan stok tidak boleh 0'),
  reason: z.string().trim().min(3, 'Alasan wajib diisi').max(300),
});

// ── Checkout
export const cartLineSchema = z.object({
  productId: z.string().uuid(),
  variantId: z.string().uuid().optional().nullable(),
  quantity: z.number().int().min(1).max(99),
});

export const addressSchema = z.object({
  recipientName: z.string().trim().min(3, 'Nama penerima minimal 3 karakter').max(100),
  phone: z.string().trim().min(8).max(20),
  email: z.string().trim().toLowerCase().email().max(200).optional().or(z.literal('')),
  addressLine: z.string().trim().min(10, 'Alamat terlalu pendek').max(500),
  province: z.string().trim().min(2).max(80),
  city: z.string().trim().min(2).max(80),
  district: z.string().trim().min(2).max(80),
  postalCode: z
    .string()
    .trim()
    .regex(/^\d{5}$/, 'Kode pos 5 digit')
    .optional()
    .or(z.literal('')),
  destinationId: z.string().trim().max(40).optional().nullable(),
  customerNote: z.string().trim().max(300).optional().or(z.literal('')),
});

export const quoteRequestSchema = z.object({
  items: z.array(cartLineSchema).min(1).max(50),
  destinationId: z.string().trim().max(40).optional().nullable(),
  paymentMethod: z.enum(PaymentMethods).optional(),
});

export const createOrderSchema = z.object({
  items: z.array(cartLineSchema).min(1).max(50),
  address: addressSchema,
  paymentMethod: z.enum(PaymentMethods),
  quoteId: z.string().uuid(),
  shippingSelections: z
    .array(z.object({ groupKey: z.string().max(100), optionId: z.string().max(100) }))
    .min(1)
    .max(20),
  idempotencyKey: z.string().trim().min(16).max(80),
  acceptTerms: z.literal(true, { errorMap: () => ({ message: 'Setujui syarat & ketentuan' }) }),
});
export type CreateOrderInput = z.infer<typeof createOrderSchema>;

export const orderAccessSchema = z.object({
  orderNumber: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9-]{6,30}$/),
  key: z.string().trim().min(20).max(100),
});

// ── Admin: payments / orders / fulfilment
export const proofApproveSchema = z.object({
  reviewedAmount: rupiah,
  note: z.string().trim().max(500).optional(),
});
export const proofRejectSchema = z.object({
  reason: z.string().trim().min(5, 'Alasan penolakan wajib diisi').max(500),
});
export const codReconcileSchema = z.object({
  outcome: z.enum(['COLLECTED', 'FAILED']),
  evidence: z.string().trim().min(5, 'Catat bukti/sumber konfirmasi (mis. laporan setoran kurir)').max(500),
});
export const cancelOrderSchema = z.object({
  reason: z.string().trim().min(5).max(500),
});
export const supplierOrderStatusSchema = z.object({
  status: z.enum(SupplierOrderStatuses),
  externalOrderRef: z.string().trim().max(120).optional().nullable(),
  note: z.string().trim().max(500).optional(),
});
export const shipmentCreateSchema = z.object({
  supplierOrderId: z.string().uuid(),
  carrier: z.string().trim().min(2).max(60),
  carrierService: z.string().trim().max(60).optional().nullable(),
  trackingNumber: z
    .string()
    .trim()
    .max(60)
    .regex(/^[A-Za-z0-9-]*$/, 'Nomor resi hanya huruf/angka')
    .optional()
    .nullable()
    .or(z.literal('')),
  trackingUrl: httpUrl.optional().nullable().or(z.literal('')),
});
export const shipmentUpdateSchema = z.object({
  carrier: z.string().trim().min(2).max(60).optional(),
  carrierService: z.string().trim().max(60).optional().nullable(),
  trackingNumber: z
    .string()
    .trim()
    .max(60)
    .regex(/^[A-Za-z0-9-]*$/)
    .optional()
    .nullable()
    .or(z.literal('')),
  trackingUrl: httpUrl.optional().nullable().or(z.literal('')),
  status: z.enum(ShipmentStatuses).optional(),
  trackingError: z.string().trim().max(300).optional().nullable(),
  eventMessage: z.string().trim().max(300).optional(),
});
export const shipmentCodSchema = z.object({
  status: z.enum(CodCollectionStatuses),
  evidence: z.string().trim().min(5).max(500),
});

// ── Import
export const importCommitSchema = z.object({
  jobId: z.string().uuid(),
  mode: z.enum(ImportModes),
  protectedFields: z.array(z.enum(['PRICE', 'COST', 'STOCK', 'STATUS', 'SUPPLIER', 'COD'])).default([]),
  confirm: z.literal(true),
});

// ── Settings
export const storeSettingsSchema = z.object({
  storeName: z.string().trim().min(2).max(80),
  tagline: z.string().trim().max(300).default(''),
  logoUrl: imageUrl.optional().nullable().or(z.literal('')),
  announcement: z.string().trim().max(500).default(''),
  supportEmail: z.string().trim().email().optional().or(z.literal('')),
  whatsappNumber: z
    .string()
    .trim()
    .regex(/^(\d{8,15})?$/, 'Nomor WA format internasional tanpa + (mis. 62812...)')
    .default(''),
  serviceHours: z.string().trim().max(160).default(''),
  address: z.string().trim().max(500).default(''),
  instagramUrl: httpUrl.optional().or(z.literal('')),
  tiktokUrl: httpUrl.optional().or(z.literal('')),
  footerAbout: z.string().trim().max(1500).default(''),
});

export const paymentSettingsSchema = z.object({
  bankTransferEnabled: z.boolean(),
  bankName: z.string().trim().max(60).default(''),
  bankAccountName: z.string().trim().max(100).default(''),
  bankAccountNumber: z
    .string()
    .trim()
    .regex(/^[0-9 -]*$/, 'Nomor rekening hanya angka')
    .max(40)
    .default(''),
  transferInstructions: z.string().trim().max(1000).default(''),
  qrisStaticEnabled: z.boolean(),
  qrisImageUrl: imageUrl.optional().nullable().or(z.literal('')),
  paymentWindowHours: z.number().int().min(1).max(168).default(24),
  proofMaxBytes: z
    .number()
    .int()
    .min(100_000)
    .max(10 * 1024 * 1024)
    .default(5 * 1024 * 1024),
});

export const codSettingsSchema = z.object({
  codEnabled: z.boolean(),
  codFeeFlat: rupiah.default(0),
  codFeePercentBps: z.number().int().min(0).max(1000).default(0), // basis points of goods subtotal
  codMaxOrderTotal: rupiah.default(0), // 0 = no limit
  codBlockedProvinces: z.array(z.string().trim().max(80)).max(40).default([]),
  codNotes: z.string().trim().max(500).default(''),
});

export const shippingSettingsSchema = z.object({
  provider: z.enum(['rajaongkir', 'flat']),
  couriers: z
    .array(
      z
        .string()
        .trim()
        .regex(/^[a-z0-9_]+$/),
    )
    .max(15)
    .default(['jne', 'sicepat', 'jnt']),
  flatRatePerGroup: rupiah.default(0),
  flatRateLabel: z.string().trim().max(60).default('Ongkir standar'),
  freeShippingMinSubtotal: rupiah.default(0), // 0 = disabled
});

export const legalPagesSchema = z.object({
  pages: z
    .array(
      z.object({
        slug: z.enum(['syarat-ketentuan', 'kebijakan-privasi', 'pengembalian', 'pengiriman', 'bantuan']),
        title: z.string().trim().min(2).max(80),
        body: z.string().max(20_000),
        ownerReviewed: z.boolean().default(false),
      }),
    )
    .max(10),
});

// ── Homepage CMS
const cta = z.object({ label: z.string().trim().max(60), href: z.string().trim().max(200) });
export const heroContentSchema = z.object({
  eyebrow: z.string().trim().max(150).default(''),
  headline: z.string().trim().min(3).max(200),
  subtext: z.string().trim().max(600).default(''),
  imageUrl: imageUrl.optional().or(z.literal('')),
  imageAlt: z.string().trim().max(160).default(''),
  primaryCta: cta,
  secondaryCta: cta.optional(),
  spotlightProductId: z.string().uuid().optional().nullable(),
});
export const categoriesContentSchema = z.object({
  eyebrow: z.string().trim().max(150).default(''),
  title: z.string().trim().min(2).max(200),
  categoryIds: z.array(z.string().uuid()).max(12).default([]),
});
export const featuredContentSchema = z.object({
  eyebrow: z.string().trim().max(150).default(''),
  title: z.string().trim().min(2).max(200),
  subtitle: z.string().trim().max(600).default(''),
  productIds: z.array(z.string().uuid()).max(12).default([]),
});
export const promoContentSchema = z.object({
  eyebrow: z.string().trim().max(150).default(''),
  headline: z.string().trim().min(3).max(200),
  body: z.string().trim().max(600).default(''),
  voucherCode: z.string().trim().max(40).default(''),
  ctaLabel: z.string().trim().max(60).default(''),
  ctaHref: z.string().trim().max(200).default(''),
  endsAt: z.string().datetime().optional().nullable(), // countdown shown only if a real end date is set
  imageUrl: imageUrl.optional().or(z.literal('')),
});
export const valuePropsContentSchema = z.object({
  items: z
    .array(
      z.object({
        icon: z.enum(['shield', 'truck', 'refresh', 'headset', 'wallet', 'package']),
        title: z.string().trim().min(2).max(100),
        body: z.string().trim().max(300),
      }),
    )
    .max(4),
});

export const sectionContentSchemas = {
  HERO: heroContentSchema,
  CATEGORIES: categoriesContentSchema,
  FEATURED_PRODUCTS: featuredContentSchema,
  PROMO_BANNER: promoContentSchema,
  VALUE_PROPS: valuePropsContentSchema,
} as const;

export const telegramTestSchema = z.object({
  dryRun: z.boolean().default(true),
});

