import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class SignUpBranchDto {
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;
}
