import { Check, Column, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/**
 * What a bin holds right now: units of one product option (`variant`, 'Default' when the product has no options).
 * This is the running total of `warehouse_ledger`: only the stock service changes it, always together with a ledger
 * row, always by a conditional update, and the database refuses a negative quantity (`CHK_warehouse_stock_qty`).
 */
@Check('CHK_warehouse_stock_qty', 'qty >= 0')
@Index('IDX_warehouse_stock_slot', ['hubId', 'binId', 'productId', 'variant'], { unique: true })
@Index('IDX_warehouse_stock_product', ['hubId', 'productId'])
@Entity('warehouse_stock')
export class WarehouseStock {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  hubId: string;

  @Column({ type: 'varchar', length: 36 })
  binId: string;

  @Column({ type: 'varchar', length: 36 })
  productId: string;

  @Column({ type: 'varchar', length: 200, default: 'Default' })
  variant: string;

  @Column({ type: 'int', default: 0 })
  qty: number;

  @UpdateDateColumn()
  updatedAt: Date;
}
