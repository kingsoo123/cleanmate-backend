import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateAddressDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  label: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  line: string;
}
