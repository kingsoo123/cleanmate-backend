import {
  IsIn,
  IsNotEmpty,
  IsString,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';

export class ForgotPinDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  identifier: string;

  @IsIn(['business', 'branch_manager', 'customer', 'rider'])
  role: 'business' | 'branch_manager' | 'customer' | 'rider';

  @IsString()
  @Length(6, 6)
  @Matches(/^\d{6}$/)
  newPin: string;

  @IsString()
  @Length(6, 6)
  @Matches(/^\d{6}$/)
  confirmPin: string;
}
