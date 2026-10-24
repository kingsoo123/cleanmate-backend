import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('customer_notifications')
export class CustomerNotification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid', name: 'customer_id' })
  customerId: string;

  @Index()
  @Column({ type: 'uuid', name: 'business_id' })
  businessId: string;

  @Column({ type: 'uuid', name: 'order_id', nullable: true })
  orderId: string | null;

  @Column({ type: 'varchar', length: 32, name: 'tracking_code', nullable: true })
  trackingCode: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  tag: string | null;

  @Column({ type: 'varchar', length: 128 })
  title: string;

  @Column({ type: 'text' })
  body: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  href: string | null;

  @Column({ type: 'varchar', length: 64, name: 'event_type' })
  eventType: string;

  @Column({ type: 'timestamptz', name: 'read_at', nullable: true })
  readAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;
}
