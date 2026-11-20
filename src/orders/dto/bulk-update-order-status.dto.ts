import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import {
  STAFF_SELECTABLE_ORDER_STATUSES,
  type StaffSelectableOrderStatus,
} from './update-order-status.dto';

export class BulkUpdateOrderStatusDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @IsUUID('4', { each: true })
  orderIds: string[];

  @IsIn([...STAFF_SELECTABLE_ORDER_STATUSES])
  status: StaffSelectableOrderStatus;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  processingStage?: string;
}