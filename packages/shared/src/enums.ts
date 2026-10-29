// Mirrors prisma enums so the web app does not depend on @prisma/client.
export const PaymentMethods = ['BANK_TRANSFER', 'QRIS_STATIC', 'QRIS_GATEWAY', 'VIRTUAL_ACCOUNT', 'COD'] as const;
export type PaymentMethod = (typeof PaymentMethods)[number];

export const OrderStatuses = [
  'PENDING_PAYMENT',
  'AWAITING_FULFILLMENT',
  'PROCESSING',
  'PARTIALLY_SHIPPED',
  'SHIPPED',
  'PARTIALLY_DELIVERED',
  'DELIVERED',
  'COMPLETED',
  'DELIVERY_FAILED',
  'RETURNED',
  'CANCELLED',
] as const;
export type OrderStatus = (typeof OrderStatuses)[number];

export const PaymentStatuses = [
  'UNPAID',
  'PENDING_REVIEW',
  'PAID',
  'EXPIRED',
  'COD_PENDING_COLLECTION',
  'COD_COLLECTED',
  'COD_FAILED',
  'REFUNDED',
  'CANCELLED',
] as const;
export type PaymentStatus = (typeof PaymentStatuses)[number];

export const SupplierOrderStatuses = [
  'PENDING',
  'SUBMITTED',
  'CONFIRMED',
  'PACKED',
  'SHIPPED',
  'DELIVERED',
  'CANCELLED',
  'OUT_OF_STOCK',
] as const;
export type SupplierOrderStatus = (typeof SupplierOrderStatuses)[number];

export const ShipmentStatuses = [
  'AWAITING_TRACKING',
  'TRACKING_AVAILABLE',
  'TRACKING_FAILED',
  'IN_TRANSIT',
  'DELIVERED',
  'DELIVERY_FAILED',
  'RETURNED_TO_ORIGIN',
  'CANCELLED',
] as const;
export type ShipmentStatus = (typeof ShipmentStatuses)[number];

export const CodCollectionStatuses = ['NOT_APPLICABLE', 'PENDING', 'COLLECTED', 'FAILED'] as const;
export type CodCollectionStatus = (typeof CodCollectionStatuses)[number];

export const IntegrationModes = ['API', 'MANUAL', 'SUPPLIER_PORTAL', 'WHATSAPP_MANUAL'] as const;
export type IntegrationMode = (typeof IntegrationModes)[number];

export const ProductStatuses = ['DRAFT', 'ACTIVE', 'ARCHIVED'] as const;
export type ProductStatus = (typeof ProductStatuses)[number];

export const UserRoles = ['OWNER', 'ADMIN', 'STAFF'] as const;
export type UserRole = (typeof UserRoles)[number];

export const ImportModes = ['CREATE_ONLY', 'UPSERT_BY_SKU'] as const;
export type ImportMode = (typeof ImportModes)[number];

export const HomepageSectionTypes = [
  'HERO',
  'CATEGORIES',
  'FEATURED_PRODUCTS',
  'PROMO_BANNER',
  'VALUE_PROPS',
] as const;
export type HomepageSectionType = (typeof HomepageSectionTypes)[number];

