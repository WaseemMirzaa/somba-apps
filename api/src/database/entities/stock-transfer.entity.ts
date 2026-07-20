import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('stock_transfers')
export class StockTransfer {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 24 })
  reference: string;

  @Column({ type: 'varchar' })
  fromHub: string;

  @Column({ type: 'varchar' })
  toHub: string;

  @Column({ type: 'varchar' })
  sku: string;

  @Column({ type: 'varchar', nullable: true })
  productName: string | null;

  @Column({ type: 'int' })
  qty: number;

  @Column({ type: 'varchar', length: 20, default: 'requested' })
  status: string; // requested | in_transit | received

  @CreateDateColumn()
  createdAt: Date;
}
