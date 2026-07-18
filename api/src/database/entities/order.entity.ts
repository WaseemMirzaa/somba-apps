import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { encryptedColumn } from '../../common/crypto/field-crypto';
import { OrderItem } from './order-item.entity';

export type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'processing'
  | 'shipped'
  | 'out_for_delivery'
  | 'delivered'
  | 'cancelled'
  | 'returned';

export type PaymentMethod = 'stripe_card' | 'cod' | 'airtel_money' | 'wallet';

@Entity('orders')
export class Order {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Short human-facing reference, e.g. SOM-1042. */
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 20 })
  reference: string;

  @Index()
  @Column({ type: 'varchar' })
  customerId: string;

  @Column({ type: 'varchar' })
  customerName: string;

  @Index()
  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status: OrderStatus;

  @Column({ type: 'varchar', length: 20, default: 'cod' })
  paymentMethod: PaymentMethod;

  @Column({ type: 'float', default: 0 })
  subtotalUsd: number;

  @Column({ type: 'float', default: 0 })
  deliveryFeeUsd: number;

  @Column({ type: 'float', default: 0 })
  totalUsd: number;

  @Column({ type: 'varchar', nullable: true })
  zoneId: string | null;

  /** Encrypted at rest — full JSON delivery address. */
  @Column({ type: 'text', nullable: true, transformer: encryptedColumn })
  shippingAddress: string | null;

  /** Assigned rider (set when a delivery task is accepted). */
  @Column({ type: 'varchar', nullable: true })
  riderId: string | null;

  @OneToMany(() => OrderItem, (item) => item.order, { cascade: true, eager: true })
  items: OrderItem[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
