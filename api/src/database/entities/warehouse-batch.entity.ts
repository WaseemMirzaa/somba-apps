import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('warehouse_batches')
export class WarehouseBatch {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 24 })
  reference: string;

  @Column({ type: 'varchar', nullable: true })
  hubId: string | null;

  @Column({ type: 'varchar', nullable: true })
  riderId: string | null;

  @Column({ type: 'varchar', nullable: true })
  riderName: string | null;

  /** JSON array of delivery-task ids in the batch. */
  @Column({ type: 'text', default: '[]' })
  taskIds: string;

  @Column({ type: 'varchar', length: 20, default: 'building' })
  status: string; // building | dispatched | completed

  @CreateDateColumn()
  createdAt: Date;
}
