import type {
  CodCollectionStatus,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  ShipmentStatus,
  SupplierOrderStatus,
  IntegrationMode,
} from './enums';

export const orderStatusLabel: Record<OrderStatus, string> = {
  PENDING_PAYMENT: 'Menunggu Pembayaran',
  AWAITING_FULFILLMENT: 'Menunggu Diproses',
  PROCESSING: 'Diproses',
  PARTIALLY_SHIPPED: 'Sebagian Dikirim',
  SHIPPED: 'Dikirim',
  PARTIALLY_DELIVERED: 'Sebagian Terkirim',
  DELIVERED: 'Terkirim',
  COMPLETED: 'Selesai',
  DELIVERY_FAILED: 'Gagal Dikirim',
  RETURNED: 'Retur',
  CANCELLED: 'Dibatalkan',
};

export const paymentStatusLabel: Record<PaymentStatus, string> = {
  UNPAID: 'Menunggu Pembayaran',
  PENDING_REVIEW: 'Menunggu Verifikasi',
  PAID: 'Lunas (Terverifikasi)',
  EXPIRED: 'Kedaluwarsa',
  COD_PENDING_COLLECTION: 'COD Belum Diterima',
  COD_COLLECTED: 'COD Diterima',
  COD_FAILED: 'COD Gagal',
  REFUNDED: 'Dikembalikan',
  CANCELLED: 'Dibatalkan',
};

export const paymentMethodLabel: Record<PaymentMethod, string> = {
  BANK_TRANSFER: 'Transfer Bank',
  QRIS_STATIC: 'QRIS (scan manual)',
  QRIS_GATEWAY: 'QRIS Otomatis',
  VIRTUAL_ACCOUNT: 'Virtual Account',
  COD: 'Bayar di Tempat (COD)',
};

export const supplierOrderStatusLabel: Record<SupplierOrderStatus, string> = {
  PENDING: 'Belum Dipesan ke Pemasok',
  SUBMITTED: 'Dipesan ke Pemasok',
  CONFIRMED: 'Dikonfirmasi Pemasok',
  PACKED: 'Dikemas',
  SHIPPED: 'Dikirim',
  DELIVERED: 'Terkirim',
  CANCELLED: 'Dibatalkan',
  OUT_OF_STOCK: 'Stok Pemasok Habis',
};

export const shipmentStatusLabel: Record<ShipmentStatus, string> = {
  AWAITING_TRACKING: 'Menunggu Resi',
  TRACKING_AVAILABLE: 'Resi Tersedia',
  TRACKING_FAILED: 'Gagal Mengambil Resi',
  IN_TRANSIT: 'Dalam Perjalanan',
  DELIVERED: 'Terkirim',
  DELIVERY_FAILED: 'Gagal Dikirim',
  RETURNED_TO_ORIGIN: 'Retur ke Pengirim',
  CANCELLED: 'Dibatalkan',
};

export const codStatusLabel: Record<CodCollectionStatus, string> = {
  NOT_APPLICABLE: '-',
  PENDING: 'COD Belum Diterima',
  COLLECTED: 'COD Diterima',
  FAILED: 'COD Gagal',
};

export const integrationModeLabel: Record<IntegrationMode, string> = {
  API: 'API',
  MANUAL: 'Manual',
  SUPPLIER_PORTAL: 'Portal Pemasok',
  WHATSAPP_MANUAL: 'WhatsApp (manual)',
};

export type Tone = 'neutral' | 'accent' | 'success' | 'danger' | 'info';

export function toneForOrderStatus(s: OrderStatus): Tone {
  if (['COMPLETED', 'DELIVERED'].includes(s)) return 'success';
  if (['CANCELLED', 'DELIVERY_FAILED', 'RETURNED'].includes(s)) return 'danger';
  if (s === 'PENDING_PAYMENT') return 'accent';
  return 'info';
}

export function toneForPaymentStatus(s: PaymentStatus): Tone {
  if (s === 'PAID' || s === 'COD_COLLECTED') return 'success';
  if (['EXPIRED', 'COD_FAILED', 'CANCELLED', 'REFUNDED'].includes(s)) return 'danger';
  if (s === 'PENDING_REVIEW' || s === 'COD_PENDING_COLLECTION') return 'accent';
  return 'neutral';
}

export function toneForShipmentStatus(s: ShipmentStatus): Tone {
  if (s === 'DELIVERED') return 'success';
  if (['TRACKING_FAILED', 'DELIVERY_FAILED', 'RETURNED_TO_ORIGIN', 'CANCELLED'].includes(s)) return 'danger';
  if (s === 'AWAITING_TRACKING') return 'accent';
  return 'info';
}

