import {
  BeforeUpdate,
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

export type PaymentMethod =
  | 'stripe_card'
  | 'cod'
  | 'airtel_money'
  | 'orange_money'
  | 'vodacom_mpesa'
  | 'wallet';

@Index('IDX_orders_status_created', ['status', 'createdAt'])
@Index('IDX_orders_created', ['createdAt'])
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

  /** Promo discount already deducted from the total (server-validated). */
  @Column({ type: 'float', default: 0 })
  discountUsd: number;

  @Column({ type: 'varchar', length: 40, nullable: true })
  promoCode: string | null;

  /**
   * Part of the line prices that is a seller-campaign discount (already deducted
   * from the item prices and the subtotal). Per-line detail is on the items.
   */
  @Column({ type: 'float', default: 0 })
  campaignDiscountUsd: number;

  @Column({ type: 'float', default: 0 })
  totalUsd: number;

  /** @deprecated Zones are gone; history only. */
  @Column({ type: 'varchar', nullable: true })
  zoneId: string | null;

  /** The warehouse that delivers the order: the nearest to the customer's map pin that has riders. */
  @Index('IDX_orders_destinationHubId')
  @Column({ type: 'varchar', nullable: true })
  destinationHubId: string | null;

  /** The delivery area of the customer's address when the order was placed (history; later coverage changes never reroute). */
  @Index('IDX_orders_destinationAreaId')
  @Column({ type: 'varchar', length: 36, nullable: true })
  destinationAreaId: string | null;

  /** One origin warehouse per seller on the order (the one nearest each seller's pickup pin). */
  @Column({ type: 'simple-json', nullable: true })
  originHubIds: string[] | null;

  /** The planned chain of warehouses each seller's parcel travels: `{ [sellerId]: [originHubId, …, destinationHubId] }` (one entry when no transfer is needed). */
  @Column({ type: 'simple-json', nullable: true })
  routeBySeller: Record<string, string[]> | null;

  /**
   * Which warehouse collects from which seller: `{ [sellerId]: hubId }` (keys are the `sellerId` of the order lines).
   * `originHubIds` lists the same warehouses but in no promised order; read this to match a seller to its warehouse.
   * Null on orders placed before this existed.
   */
  @Column({ type: 'simple-json', nullable: true })
  originBySeller: Record<string, string> | null;

  /** Encrypted at rest — full JSON delivery address. */
  @Column({ type: 'text', nullable: true, transformer: encryptedColumn })
  shippingAddress: string | null;

  /** Expected delivery day (YYYY-MM-DD, Kinshasa): order day + the slowest line's seller-set delivery days. */
  @Column({ type: 'varchar', length: 10, nullable: true })
  estimatedDeliveryDate: string | null;

  /** Assigned rider (set when a delivery task is accepted). */
  @Column({ type: 'varchar', nullable: true })
  riderId: string | null;

  @OneToMany(() => OrderItem, (item) => item.order, { cascade: true, eager: true })
  items: OrderItem[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  /**
   * Every save moves `updatedAt` forward. TypeORM can otherwise write back the loaded value (rounded to the
   * millisecond), so a later copy looked older than an earlier one and clients that keep the newest copy ignored it.
   */
  @BeforeUpdate()
  touch() {
    this.updatedAt = new Date();
  }
}
