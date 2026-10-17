import {
  Column,
  Entity,
  Index,
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

  @Index('IDX_order_items_product')
  @Column({ type: 'varchar' })
  productId: string;

  @Column({ type: 'varchar' })
  productName: string;

  @Column({ type: 'varchar', default: 'Default' })
  variant: string;

  @Column({ type: 'int', default: 1 })
  qty: number;

  /** Unit price charged (after any flash sale / campaign discount). */
  @Column({ type: 'float' })
  priceUsd: number;

  /** The listing's normal price at order time (null on orders placed before campaigns existed). */
  @Column({ type: 'float', nullable: true })
  listPriceUsd: number | null;

  /** The campaign whose discount set `priceUsd` (null when none applied). */
  @Column({ type: 'varchar', length: 36, nullable: true })
  campaignId: string | null;

  @Column({ type: 'int', default: 0 })
  campaignPct: number;
}
