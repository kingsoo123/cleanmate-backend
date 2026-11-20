import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';

export class UpdateBranchManagerDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  fullName?: string;

  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsString()
  @Length(6, 6)
  @Matches(/^\d{6}$/)
  pin?: string;
}