import { IsString, MaxLength, MinLength } from 'class-validator';

export class UnregisterPushTokenDto {
  @IsString()
  @MinLength(20)
  @MaxLength(512)
  token: string;
}
