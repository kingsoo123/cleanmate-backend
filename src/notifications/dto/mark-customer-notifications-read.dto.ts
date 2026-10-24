import { IsArray, IsBoolean, IsOptional, IsUUID } from 'class-validator';

export class MarkCustomerNotificationsReadDto {
  @IsOptional()
  @IsBoolean()
  all?: boolean;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  ids?: string[];
}
