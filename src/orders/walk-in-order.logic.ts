import type {
  OrderStatus,
  PaymentState,
} from '../entities/laundry-order.entity';

export function sumLineItemsTotal(
  items: { quantity: number; unitPriceNgn: number }[],
): number {
  return items.reduce(
    (sum, item) => sum + item.quantity * item.unitPriceNgn,
    0,
  );
}

export function resolveWalkInOrderState(input: {
  totalNgn: number;
  paidNgn: number;
  sendForApproval: boolean;
}): { status: OrderStatus; paymentState: PaymentState } {
  const { totalNgn, paidNgn, sendForApproval } = input;
  const outstandingNgn = Math.max(0, totalNgn - paidNgn);

  if (sendForApproval) {
    return {
      status: 'Awaiting Customer Approval',
      paymentState: paidNgn > 0 ? 'Partially Paid' : 'Unpaid',
    };
  }
  if (paidNgn <= 0 && totalNgn > 0) {
    return {
      status: 'Awaiting Initial Payment',
      paymentState: 'Unpaid',
    };
  }
  if (outstandingNgn > 0) {
    return { status: 'Active', paymentState: 'Partially Paid' };
  }
  if (totalNgn > 0) {
    return { status: 'Active', paymentState: 'Fully Paid' };
  }
  return { status: 'Draft', paymentState: 'Unpaid' };
}

export function buildItemsSummary(
  items: { label: string; quantity: number }[],
): string {
  return items
    .map((item) => `${item.quantity}× ${item.label}`)
    .join(', ')
    .slice(0, 500);
}
