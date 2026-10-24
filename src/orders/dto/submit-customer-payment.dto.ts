import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

export class SubmitCustomerPaymentDto {
  @IsUUID()
  orderId: string;

  @IsInt()
  @Min(1)
  amountNgn: number;

  @IsString()
  @MaxLength(64)
  method: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  transferReference?: string;
}
