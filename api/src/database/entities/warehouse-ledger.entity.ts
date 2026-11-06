import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/** What happened: units arrived, moved bin, were counted (a variance), left, or were corrected by hand. */
export type LedgerKind = 'receive' | 'move' | 'count' | 'stock_out';
export const LEDGER_KINDS: readonly LedgerKind[] = ['receive', 'move', 'count', 'stock_out'];

/** Why. `parcel` = put away from a scanned parcel, `dispatch` = left with a rider or on a run. */
export type LedgerReason =
  | 'parcel'
  | 'manual_receipt'
  | 'return_restock'
  | 'relocation'
  | 'cycle_count'
  | 'dispatch'
  | 'damaged'
  | 'lost'
  | 'sample'
  | 'seller_pickup'
  | 'other';
export const RECEIVE_REASONS: readonly LedgerReason[] = ['manual_receipt', 'return_restock', 'other'];
export const OUT_REASONS: readonly LedgerReason[] = ['damaged', 'lost', 'sample', 'seller_pickup', 'other'];

/**
 * One movement of stock in one warehouse (WS-C). A line is never edited and never deleted: the stock in `warehouse_stock`
 * is the sum of these lines. `delta` is the effect on the warehouse's total of that product option (+ in, - out, 0 for a
 * move between bins); `qty` is how many units the movement is about (for a count: the number counted).
 */
@Index('IDX_warehouse_ledger_hub_created', ['hubId', 'createdAt'])
@Index('IDX_warehouse_ledger_product', ['hubId', 'productId', 'createdAt'])
@Index('IDX_warehouse_ledger_order', ['orderId'])
@Index('IDX_warehouse_ledger_task', ['taskId'])
@Index('IDX_warehouse_ledger_clientRef', ['clientRef'], { unique: true })
@Entity('warehouse_ledger')
export class WarehouseLedger {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  hubId: string;

  @Column({ type: 'varchar', length: 36 })
  productId: string;

  @Column({ type: 'varchar', length: 200, default: 'Default' })
  variant: string;

  @Column({ type: 'varchar', length: 12 })
  kind: LedgerKind;

  @Column({ type: 'varchar', length: 20 })
  reason: LedgerReason;

  @Column({ type: 'int' })
  qty: number;

  @Column({ type: 'int' })
  delta: number;

  /** The warehouse's total of this product option right after this line. */
  @Column({ type: 'int' })
  onHandAfter: number;

  @Column({ type: 'varchar', length: 36, nullable: true })
  fromBinId: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  toBinId: string | null;

  /** Bin codes as they were on the day (a bin may be renamed or retired later; history stays readable). */
  @Column({ type: 'varchar', length: 40, nullable: true })
  fromBinCode: string | null;

  @Column({ type: 'varchar', length: 40, nullable: true })
  toBinCode: string | null;

  /** Cycle count only: what the system expected in the bin and what was counted (variance = counted - expected = delta). */
  @Column({ type: 'int', nullable: true })
  expectedQty: number | null;

  @Column({ type: 'int', nullable: true })
  countedQty: number | null;

  /** The parcel (delivery task) and the order the units came with / left with, when there is one. */
  @Column({ type: 'varchar', length: 36, nullable: true })
  taskId: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  orderId: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  actorId: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  actorName: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  note: string | null;

  /** Idempotency key: sending the same movement twice (a double tap, a retry) records it once. */
  @Column({ type: 'varchar', length: 100, nullable: true })
  clientRef: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
