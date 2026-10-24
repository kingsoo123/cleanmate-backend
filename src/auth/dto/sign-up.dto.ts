import { Type } from 'class-transformer';
import {
  IsArray,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { SignUpBranchDto } from './sign-up-branch.dto';

export class SignUpDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  businessName: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  fullName: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  phone: string;

  @IsEmail()
  @MaxLength(255)
  email: string;

  @IsString()
  @Length(6, 6)
  @Matches(/^\d{6}$/)
  pin: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SignUpBranchDto)
  branches?: SignUpBranchDto[];
}
