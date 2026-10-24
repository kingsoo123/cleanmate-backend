import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../users/user.entity';

export type OrderStatus =
  | 'Draft'
  | 'Awaiting Customer Approval'
  | 'Awaiting Initial Payment'
  | 'Active'
  | 'In Progress'
  | 'Quality Check'
  | 'Ready'
  | 'Out for Delivery'
  | 'Completed'
  | 'Cancelled';

export type PaymentState = 'Unpaid' | 'Partially Paid' | 'Fully Paid';

export type OrderSource = 'Walk-in' | 'Pickup';

@Entity('laundry_orders')
@Unique(['businessId', 'orderNumber'])
export class LaundryOrder {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid', name: 'business_id' })
  businessId: string;

  @Index()
  @Column({ type: 'uuid', name: 'branch_id', nullable: true })
  branchId: string | null;

  @Index()
  @Column({ type: 'uuid', name: 'customer_id', nullable: true })
  customerId: string | null;

  @Column({ type: 'varchar', length: 32, name: 'order_number' })
  orderNumber: string;

  /** @deprecated Use `tag`. Kept in sync for existing rows. */
  @Column({ type: 'varchar', length: 32, name: 'tracking_code', nullable: true })
  trackingCode: string | null;

  /** Globally unique order tag (e.g. CM-A1B2C3D4). */
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 32, nullable: true })
  tag: string | null;

  @Column({ type: 'varchar', length: 20 })
  source: OrderSource;

  @Column({ type: 'varchar', length: 64 })
  status: OrderStatus;

  @Column({ type: 'varchar', length: 32, name: 'payment_state' })
  paymentState: PaymentState;

  @Column({ type: 'varchar', length: 64, name: 'processing_stage' })
  processingStage: string;

  @Column({ type: 'int', name: 'total_ngn', default: 0 })
  totalNgn: number;

  @Column({ type: 'int', name: 'outstanding_ngn', default: 0 })
  outstandingNgn: number;

  @Column({ type: 'varchar', length: 500, name: 'items_summary' })
  itemsSummary: string;

  @Column({
    type: 'varchar',
    length: 32,
    name: 'delivery_preference',
    nullable: true,
  })
  deliveryPreference: string | null;

  @Column({ type: 'uuid', name: 'pickup_id', nullable: true })
  pickupId: string | null;

  @Column({ type: 'varchar', length: 255, name: 'walk_in_name', nullable: true })
  walkInName: string | null;

  @Column({ type: 'varchar', length: 32, name: 'walk_in_phone', nullable: true })
  walkInPhone: string | null;

  @Column({ type: 'text', name: 'customer_notes', nullable: true })
  customerNotes: string | null;

  @Column({ type: 'text', name: 'internal_notes', nullable: true })
  internalNotes: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'customer_id' })
  customer?: User | null;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'business_id' })
  business: User;
}
