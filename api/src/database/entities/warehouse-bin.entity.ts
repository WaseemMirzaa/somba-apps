import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * A shelf, rack or floor spot inside one warehouse (WS-C). `code` is what is printed on the label and scanned
 * ("A-01-3"); it is unique inside the warehouse, case-insensitively (stored upper-case). `RECV` is the receiving
 * area every warehouse gets on first use. A bin that holds stock cannot be deactivated.
 */
@Index('IDX_warehouse_bins_hub_code', ['hubId', 'code'], { unique: true })
@Entity('warehouse_bins')
export class WarehouseBin {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  hubId: string;

  @Column({ type: 'varchar', length: 40 })
  code: string;

  @Column({ type: 'varchar', length: 120, nullable: true })
  label: string | null;

  @Column({ type: 'boolean', default: true })
  active: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
