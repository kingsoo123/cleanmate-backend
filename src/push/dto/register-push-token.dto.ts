import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class RegisterPushTokenDto {
  @IsString()
  @MinLength(20)
  @MaxLength(512)
  token: string;

  @IsOptional()
  @IsIn(['web'])
  platform?: 'web';
}
