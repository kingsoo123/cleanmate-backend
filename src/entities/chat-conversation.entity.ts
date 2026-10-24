import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { User } from '../users/user.entity';
import { ChatMessage } from './chat-message.entity';

@Entity('chat_conversations')
@Unique(['businessId', 'customerId'])
export class ChatConversation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid', name: 'business_id' })
  businessId: string;

  @Index()
  @Column({ type: 'uuid', name: 'customer_id' })
  customerId: string;

  @Column({
    type: 'timestamptz',
    name: 'last_message_at',
    nullable: true,
  })
  lastMessageAt: Date | null;

  @Column({
    type: 'varchar',
    length: 280,
    name: 'last_message_preview',
    nullable: true,
  })
  lastMessagePreview: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'business_id' })
  business: User;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'customer_id' })
  customer: User;

  @OneToMany(() => ChatMessage, (message) => message.conversation)
  messages: ChatMessage[];
}
