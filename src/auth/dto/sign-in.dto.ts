import {
  IsIn,
  IsNotEmpty,
  IsString,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';

export class SignInDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  identifier: string;

  @IsString()
  @Length(6, 6)
  @Matches(/^\d{6}$/)
  pin: string;

  @IsIn(['business', 'branch_manager', 'customer', 'rider'])
  role: 'business' | 'branch_manager' | 'customer' | 'rider';
}
