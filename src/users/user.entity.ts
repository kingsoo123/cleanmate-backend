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

export type UserRole = 'business' | 'customer' | 'rider';

@Entity('users')
@Unique(['phoneNormalized', 'role'])
@Unique(['email'])
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 20 })
  role: UserRole;

  @Index()
  @Column({ type: 'varchar', length: 255, nullable: true })
  email: string | null;

  @Index()
  @Column({ type: 'varchar', length: 32 })
  phone: string;

  /** Digits-only phone for lookup. */
  @Index()
  @Column({ type: 'varchar', length: 20, name: 'phone_normalized' })
  phoneNormalized: string;

  @Column({ type: 'varchar', length: 255, name: 'pin_hash' })
  pinHash: string;

  @Column({ type: 'varchar', length: 255, name: 'full_name' })
  fullName: string;

  @Column({ type: 'varchar', length: 255, name: 'business_name', nullable: true })
  businessName: string | null;

  /** Business owner that registered this customer or rider. */
  @Index()
  @Column({ type: 'uuid', name: 'business_id', nullable: true })
  businessId: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'business_id' })
  business?: User | null;

  @Column({ type: 'varchar', length: 500, name: 'default_address', nullable: true })
  defaultAddress: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
