import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Order } from './order.entity';

@Entity('order_items')
export class OrderItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Order, (order) => order.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'orderId' })
  order: Order;

  @Column({ type: 'varchar' })
  orderId: string;

  @Column({ type: 'varchar' })
  productId: string;

  @Column({ type: 'varchar' })
  productName: string;

  @Column({ type: 'varchar', default: 'Default' })
  variant: string;

  @Column({ type: 'int', default: 1 })
  qty: number;

  @Column({ type: 'float' })
  priceUsd: number;
}
