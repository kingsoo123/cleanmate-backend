import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../users/user.entity';

export type PickupRequestStatus =
  | 'Pending Review'
  | 'Accepted'
  | 'Driver Assigned'
  | 'En Route'
  | 'Collected'
  | 'Received at Facility'
  | 'Converted to Order'
  | 'Declined';

@Entity('pickup_requests')
export class PickupRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid', name: 'business_id' })
  businessId: string;

  @Index()
  @Column({ type: 'uuid', name: 'customer_id' })
  customerId: string;

  @Column({ type: 'varchar', length: 32, unique: true })
  reference: string;

  @Column({ type: 'varchar', length: 500, name: 'address_line' })
  addressLine: string;

  @Column({ type: 'varchar', length: 128, name: 'scheduled_for' })
  scheduledFor: string;

  @Column({ type: 'varchar', length: 500, name: 'estimated_items' })
  estimatedItems: string;

  @Column({ type: 'text', name: 'customer_notes', default: '' })
  customerNotes: string;

  @Column({ type: 'varchar', length: 64 })
  status: PickupRequestStatus;

  @Column({ type: 'uuid', name: 'assigned_rider_id', nullable: true })
  assignedRiderId: string | null;

  @Column({ type: 'uuid', name: 'order_id', nullable: true })
  orderId: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'customer_id' })
  customer: User;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'business_id' })
  business: User;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'assigned_rider_id' })
  assignedRider?: User | null;
}
