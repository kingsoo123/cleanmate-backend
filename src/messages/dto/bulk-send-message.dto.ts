import { IsBoolean, IsOptional } from 'class-validator';
import { SendMessageDto } from './send-message.dto';

export class BulkSendMessageDto extends SendMessageDto {
  @IsOptional()
  @IsBoolean()
  includeCustomers?: boolean;

  @IsOptional()
  @IsBoolean()
  includeStaff?: boolean;
}