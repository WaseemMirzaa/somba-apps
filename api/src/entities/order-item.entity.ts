import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { OrderStatus } from '../common/enums';
import { numeric } from '../common/numeric.transformer';
import { Order } from './order.entity';
import { Product } from './product.entity';
import { Seller } from './seller.entity';

@Entity('order_items')
export class OrderItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Order, (order) => order.items, { onDelete: 'CASCADE' })
  @JoinColumn()
  order: Order;

  @ManyToOne(() => Product, { nullable: true, onDelete: 'SET NULL', eager: true })
  @JoinColumn()
  product?: Product;

  @ManyToOne(() => Seller, { nullable: true, eager: true })
  @JoinColumn()
  seller?: Seller;

  /** Snapshot of the product name at purchase time. */
  @Column()
  nameSnapshot: string;

  @Column({ type: 'decimal', precision: 12, scale: 2, transformer: numeric })
  unitPrice: number;

  @Column({ type: 'int', default: 1 })
  qty: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, transformer: numeric })
  lineTotal: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0, transformer: numeric })
  commissionRate: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0, transformer: numeric })
  commissionAmount: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0, transformer: numeric })
  netToSeller: number;

  /** Per-seller fulfillment status of this line. */
  @Column({ type: 'varchar', default: OrderStatus.PENDING })
  fulfillmentStatus: OrderStatus;
}
