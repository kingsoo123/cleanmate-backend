import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

@Entity('business_notification_reads')
@Unique(['businessId', 'itemKey'])
export class BusinessNotificationRead {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid', name: 'business_id' })
  businessId: string;

  @Column({ type: 'varchar', length: 128, name: 'item_key' })
  itemKey: string;

  @CreateDateColumn({ type: 'timestamptz', name: 'read_at' })
  readAt: Date;
}
