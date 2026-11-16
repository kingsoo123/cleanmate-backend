import { IsInt, IsNotEmpty, IsString, Max, MaxLength, Min } from 'class-validator';

export class CreateCatalogServiceDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  category: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  name: string;

  @IsInt()
  @Min(1)
  @Max(50_000_000)
  unitPriceNgn: number;
}