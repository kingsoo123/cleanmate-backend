import {
  IsNotEmpty,
  IsString,
  IsUUID,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';

export class CreateBranchManagerDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  fullName: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  phone: string;

  @IsString()
  @Length(6, 6)
  @Matches(/^\d{6}$/)
  pin: string;

  @IsUUID()
  branchId: string;
}