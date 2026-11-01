import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/** Why units moved. `sale` takes stock; the others give it back or are a person's correction. */
export type StockReason =
  | 'sale'
  | 'cancel_restock'
  | 'return_restock'
  | 'manual_adjust'
  | 'replacement'
  | 'import'
  | 'initial';

export const STOCK_REASONS: readonly StockReason[] = ['sale', 'cancel_restock', 'return_restock', 'manual_adjust', 'replacement', 'import', 'initial'];
/** The reasons a seller may pick for a manual adjustment. */
export const MANUAL_REASONS: readonly StockReason[] = ['manual_adjust', 'replacement', 'return_restock'];

/** One change of a product's stock (a ledger line: never edited, never deleted). */
@Index('IDX_stock_movements_product', ['productId', 'createdAt'])
@Entity('stock_movements')
export class StockMovement {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  productId: string;

  /** The store that owned the product at the time. */
  @Index('IDX_stock_movements_seller')
  @Column({ type: 'varchar', length: 36, nullable: true })
  sellerId: string | null;

  /** The option label the units were taken from / given to (null = the product as a whole / shared pool). */
  @Column({ type: 'varchar', length: 200, nullable: true })
  variant: string | null;

  /** Units added (+) or taken (-). */
  @Column({ type: 'int' })
  delta: number;

  /** The product's total stock right after this change. */
  @Column({ type: 'int' })
  stockAfter: number;

  @Column({ type: 'varchar', length: 24 })
  reason: StockReason;

  @Column({ type: 'varchar', length: 36, nullable: true })
  orderId: string | null;

  /** Who made a manual change (null for the system). */
  @Column({ type: 'varchar', length: 36, nullable: true })
  actorId: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  note: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
