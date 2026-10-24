import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { LaundryOrder } from './laundry-order.entity';

@Entity('order_line_items')
export class OrderLineItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid', name: 'order_id' })
  orderId: string;

  @Column({ type: 'uuid', name: 'service_id', nullable: true })
  serviceId: string | null;

  @Column({ type: 'varchar', length: 255 })
  label: string;

  @Column({ type: 'int' })
  quantity: number;

  @Column({ type: 'int', name: 'unit_price_ngn' })
  unitPriceNgn: number;

  @ManyToOne(() => LaundryOrder, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'order_id' })
  order: LaundryOrder;
}
