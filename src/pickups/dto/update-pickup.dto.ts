import { IsIn, IsOptional, IsUUID } from 'class-validator';
import type { PickupAction } from '../pickup-status';

export class UpdatePickupDto {
  @IsIn([
    'accept',
    'decline',
    'assign',
    'en_route',
    'collected',
    'received',
    'convert',
  ])
  action: PickupAction;

  @IsOptional()
  @IsUUID()
  assignedRiderId?: string;
}
