import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

export class RecordPaymentDto {
  @IsUUID()
  orderId: string;

  @IsInt()
  @Min(1)
  amountNgn: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  method: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
