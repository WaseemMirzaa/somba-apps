import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { OrderStatus, PaymentMethod } from '../common/enums';
import { numeric } from '../common/numeric.transformer';
import { OrderItem } from './order-item.entity';

@Entity('orders')
export class Order {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column()
  code: string;

  @Column()
  customerName: string;

  @Column({ nullable: true })
  customerEmail?: string;

  @Column({ nullable: true })
  customerPhone?: string;

  @Column({ type: 'text', nullable: true })
  addressLine?: string;

  @Column({ nullable: true })
  city?: string;

  @Column({ nullable: true })
  zone?: string;

  @Column({ type: 'varchar', default: PaymentMethod.STRIPE_CARD })
  paymentMethod: PaymentMethod;

  @Column({ type: 'varchar', default: OrderStatus.PENDING })
  status: OrderStatus;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0, transformer: numeric })
  subtotalUsd: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0, transformer: numeric })
  deliveryFeeUsd: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0, transformer: numeric })
  totalUsd: number;

  @OneToMany(() => OrderItem, (item) => item.order, { cascade: true, eager: true })
  items: OrderItem[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
