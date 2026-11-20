import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import type { OrderStatus } from '../../entities/laundry-order.entity';

export const STAFF_SELECTABLE_ORDER_STATUSES = [
  'Awaiting Initial Payment',
  'Active',
  'In Progress',
  'Quality Check',
  'Ready',
  'Out for Delivery',
  'Completed',
  'Cancelled',
] as const satisfies readonly OrderStatus[];

export type StaffSelectableOrderStatus =
  (typeof STAFF_SELECTABLE_ORDER_STATUSES)[number];

export class UpdateOrderStatusDto {
  @IsIn([...STAFF_SELECTABLE_ORDER_STATUSES])
  status: StaffSelectableOrderStatus;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  processingStage?: string;
}