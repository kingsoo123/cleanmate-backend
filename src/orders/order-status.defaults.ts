import type { OrderStatus } from '../entities/laundry-order.entity';

export const DEFAULT_PROCESSING_STAGE_BY_STATUS: Partial<
  Record<OrderStatus, string>
> = {
  'Awaiting Initial Payment': 'Awaiting payment',
  Active: 'Intake',
  'In Progress': 'Washing / Dry clean',
  'Quality Check': 'Quality check',
  Ready: 'Ready for handover',
  'Out for Delivery': 'With driver',
  Completed: 'Completed',
  Cancelled: 'Cancelled by laundry',
};

export const PROCESSING_STAGE_SUGGESTIONS = [
  'Quotation',
  'Intake',
  'Received',
  'Sorting',
  'Washing / Dry clean',
  'Drying',
  'Ironing / Folding',
  'Quality check',
  'Ready for handover',
  'With driver',
  'Completed',
  'Cancelled by laundry',
] as const;