import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

class ChannelEnabledPatch {
  @IsOptional()
  @IsBoolean()
  sms?: boolean;

  @IsOptional()
  @IsBoolean()
  email?: boolean;

  @IsOptional()
  @IsBoolean()
  whatsapp?: boolean;
}

class EventChannelsPatch {
  @IsOptional()
  @IsBoolean()
  sms?: boolean;

  @IsOptional()
  @IsBoolean()
  email?: boolean;

  @IsOptional()
  @IsBoolean()
  whatsapp?: boolean;
}

class EventSettingsPatch {
  @IsString()
  id: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => EventChannelsPatch)
  channels?: EventChannelsPatch;
}

export class UpdateNotificationSettingsDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => ChannelEnabledPatch)
  channelEnabled?: ChannelEnabledPatch;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EventSettingsPatch)
  events?: EventSettingsPatch[];
}
