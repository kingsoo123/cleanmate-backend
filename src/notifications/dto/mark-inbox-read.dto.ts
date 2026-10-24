import { IsArray, IsBoolean, IsOptional, IsString } from 'class-validator';

export class MarkInboxReadDto {
  @IsOptional()
  @IsBoolean()
  all?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  itemKeys?: string[];
}
