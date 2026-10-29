import type { OrderStatus, PaymentMethod, PaymentStatus, ShipmentStatus, SupplierOrderStatus } from './enums';

/**
 * Derive the parent order fulfilment status from its supplier orders and shipments.
 * Rules (documented in docs/ORDER_LIFECYCLE.md):
 *  - Terminal statuses CANCELLED / COMPLETED / RETURNED are never overwritten by derivation.
 *  - While payment is not settled for prepaid methods, status stays PENDING_PAYMENT.
 *  - Active (non-cancelled) supplier orders are considered. If all active shipments delivered → DELIVERED.
 *  - Some delivered → PARTIALLY_DELIVERED. All active groups shipped → SHIPPED. Some → PARTIALLY_SHIPPED.
 *  - All active groups failed/returned → DELIVERY_FAILED / RETURNED.
 */
export interface DeriveInput {
  current: OrderStatus;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  supplierOrders: Array<{
    status: SupplierOrderStatus;
    shipments: Array<{ status: ShipmentStatus }>;
  }>;
}

const SHIPPED_LIKE: ShipmentStatus[] = ['TRACKING_AVAILABLE', 'IN_TRANSIT', 'DELIVERED'];

export function isPrepaid(method: PaymentMethod): boolean {
  return method !== 'COD';
}

export function isPaymentSettledForFulfilment(method: PaymentMethod, status: PaymentStatus): boolean {
  if (method === 'COD') return status === 'COD_PENDING_COLLECTION' || status === 'COD_COLLECTED';
  return status === 'PAID';
}

export function deriveOrderStatus(input: DeriveInput): OrderStatus {
  const { current } = input;
  if (current === 'CANCELLED' || current === 'COMPLETED' || current === 'RETURNED') return current;
  if (!isPaymentSettledForFulfilment(input.paymentMethod, input.paymentStatus)) {
    return input.paymentMethod === 'COD' ? current : 'PENDING_PAYMENT';
  }
  const groups = input.supplierOrders.filter((g) => g.status !== 'CANCELLED' && g.status !== 'OUT_OF_STOCK');
  if (groups.length === 0) return current === 'PENDING_PAYMENT' ? 'AWAITING_FULFILLMENT' : current;

  type GroupState = 'none' | 'processing' | 'shipped' | 'delivered' | 'failed' | 'returned';
  const states: GroupState[] = groups.map((g) => {
    const shipments = g.shipments.filter((s) => s.status !== 'CANCELLED');
    if (shipments.length === 0) {
      return g.status === 'PENDING' ? 'none' : 'processing';
    }
    if (shipments.every((s) => s.status === 'DELIVERED')) return 'delivered';
    if (shipments.every((s) => s.status === 'RETURNED_TO_ORIGIN')) return 'returned';
    if (shipments.every((s) => s.status === 'DELIVERY_FAILED' || s.status === 'RETURNED_TO_ORIGIN'))
      return 'failed';
    if (shipments.some((s) => SHIPPED_LIKE.includes(s.status))) return 'shipped';
    return 'processing';
  });

  const all = (s: GroupState) => states.every((x) => x === s);
  const some = (s: GroupState) => states.some((x) => x === s);

  if (all('delivered')) return 'DELIVERED';
  if (all('returned')) return 'RETURNED';
  if (states.every((x) => x === 'failed' || x === 'returned')) return 'DELIVERY_FAILED';
  if (some('delivered')) return 'PARTIALLY_DELIVERED';
  if (states.every((x) => x === 'shipped' || x === 'delivered')) return 'SHIPPED';
  if (some('shipped')) return 'PARTIALLY_SHIPPED';
  if (some('processing')) return 'PROCESSING';
  return 'AWAITING_FULFILLMENT';
}

/** Allowed manual payment transitions performed by admin or verified webhook. */
export const paymentTransitions: Record<PaymentStatus, PaymentStatus[]> = {
  UNPAID: ['PENDING_REVIEW', 'PAID', 'EXPIRED', 'CANCELLED'],
  PENDING_REVIEW: ['PAID', 'UNPAID', 'CANCELLED'],
  PAID: ['REFUNDED'],
  EXPIRED: ['CANCELLED'],
  COD_PENDING_COLLECTION: ['COD_COLLECTED', 'COD_FAILED', 'CANCELLED'],
  COD_COLLECTED: ['REFUNDED'],
  COD_FAILED: ['COD_PENDING_COLLECTION', 'CANCELLED'],
  REFUNDED: [],
  CANCELLED: [],
};

export function canTransitionPayment(from: PaymentStatus, to: PaymentStatus): boolean {
  return paymentTransitions[from].includes(to);
}

export const supplierOrderTransitions: Record<SupplierOrderStatus, SupplierOrderStatus[]> = {
  PENDING: ['SUBMITTED', 'CANCELLED', 'OUT_OF_STOCK'],
  SUBMITTED: ['CONFIRMED', 'PACKED', 'SHIPPED', 'CANCELLED', 'OUT_OF_STOCK'],
  CONFIRMED: ['PACKED', 'SHIPPED', 'CANCELLED', 'OUT_OF_STOCK'],
  PACKED: ['SHIPPED', 'CANCELLED'],
  SHIPPED: ['DELIVERED'],
  DELIVERED: [],
  CANCELLED: [],
  OUT_OF_STOCK: ['PENDING', 'CANCELLED'],
};

export function canTransitionSupplierOrder(from: SupplierOrderStatus, to: SupplierOrderStatus): boolean {
  return supplierOrderTransitions[from].includes(to);
}

export const shipmentTransitions: Record<ShipmentStatus, ShipmentStatus[]> = {
  AWAITING_TRACKING: ['TRACKING_AVAILABLE', 'TRACKING_FAILED', 'CANCELLED'],
  TRACKING_FAILED: ['AWAITING_TRACKING', 'TRACKING_AVAILABLE', 'CANCELLED'],
  TRACKING_AVAILABLE: ['IN_TRANSIT', 'DELIVERED', 'DELIVERY_FAILED', 'CANCELLED'],
  IN_TRANSIT: ['DELIVERED', 'DELIVERY_FAILED', 'RETURNED_TO_ORIGIN'],
  DELIVERY_FAILED: ['IN_TRANSIT', 'RETURNED_TO_ORIGIN', 'DELIVERED'],
  DELIVERED: [],
  RETURNED_TO_ORIGIN: [],
  CANCELLED: [],
};

export function canTransitionShipment(from: ShipmentStatus, to: ShipmentStatus): boolean {
  return from === to || shipmentTransitions[from].includes(to);
}

