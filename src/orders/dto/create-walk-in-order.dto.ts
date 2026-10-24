import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

export class WalkInLineItemDto {
  @IsOptional()
  @IsUUID()
  serviceId?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  label: string;

  @IsInt()
  @Min(1)
  quantity: number;

  @IsInt()
  @Min(0)
  unitPriceNgn: number;
}

export class CreateWalkInOrderDto {
  @IsIn(['existing', 'walk-in'])
  customerMode: 'existing' | 'walk-in';

  @ValidateIf((o: CreateWalkInOrderDto) => o.customerMode === 'existing')
  @IsUUID()
  customerId?: string;

  @ValidateIf((o: CreateWalkInOrderDto) => o.customerMode === 'walk-in')
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  walkInName?: string;

  @ValidateIf((o: CreateWalkInOrderDto) => o.customerMode === 'walk-in')
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  walkInPhone?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => WalkInLineItemDto)
  lineItems: WalkInLineItemDto[];

  @IsIn(['Pickup at shop', 'Home delivery'])
  deliveryPreference: 'Pickup at shop' | 'Home delivery';

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  customerNotes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  internalNotes?: string;

  @IsBoolean()
  sendForApproval: boolean;

  @IsInt()
  @Min(0)
  initialPaymentNgn: number;

  @IsIn(['Cash', 'Bank transfer', 'POS'])
  paymentMethod: 'Cash' | 'Bank transfer' | 'POS';
}
