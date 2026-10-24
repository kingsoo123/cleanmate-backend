import { IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreatePickupDto {
  @IsUUID()
  addressId: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  scheduledFor: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  estimatedItems: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  customerNotes?: string;
}
