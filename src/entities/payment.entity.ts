import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { LaundryOrder } from './laundry-order.entity';
import { User } from '../users/user.entity';

@Entity('payments')
export class Payment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid', name: 'business_id' })
  businessId: string;

  @Index()
  @Column({ type: 'uuid', name: 'order_id' })
  orderId: string;

  @Index()
  @Column({ type: 'uuid', name: 'customer_id' })
  customerId: string;

  @Column({ type: 'int', name: 'amount_ngn' })
  amountNgn: number;

  @Column({ type: 'varchar', length: 64 })
  method: string;

  @Column({ type: 'varchar', length: 20 })
  status: 'Successful' | 'Pending';

  @Column({
    type: 'varchar',
    length: 128,
    name: 'transfer_reference',
    nullable: true,
  })
  transferReference: string | null;

  @Column({ type: 'text', nullable: true })
  note: string | null;

  @CreateDateColumn({ name: 'paid_at' })
  paidAt: Date;

  @ManyToOne(() => LaundryOrder, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'order_id' })
  order: LaundryOrder;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'customer_id' })
  customer: User;
}
