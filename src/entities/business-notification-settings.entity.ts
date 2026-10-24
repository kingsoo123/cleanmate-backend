import { Column, Entity, PrimaryColumn } from 'typeorm';

export type NotificationChannelKey = 'sms' | 'email' | 'whatsapp';

export type NotificationEventChannelMap = Record<NotificationChannelKey, boolean>;

export type StoredNotificationEvent = {
  id: string;
  label: string;
  description: string;
  channels: NotificationEventChannelMap;
};

@Entity('business_notification_settings')
export class BusinessNotificationSettings {
  @PrimaryColumn({ type: 'uuid', name: 'business_id' })
  businessId: string;

  @Column({ type: 'jsonb', name: 'channel_enabled' })
  channelEnabled: Record<NotificationChannelKey, boolean>;

  @Column({ type: 'jsonb' })
  events: StoredNotificationEvent[];
}
