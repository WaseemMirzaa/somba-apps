import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/** An order inside a parcel group. An order is in one group only (unique), so a box code always resolves to the same orders. */
@Index('UQ_parcel_group_orders_order', ['orderId'], { unique: true })
@Index('IDX_parcel_group_orders_group', ['groupId'])
@Entity('parcel_group_orders')
export class ParcelGroupOrder {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  groupId: string;

  @Column({ type: 'varchar', length: 36 })
  orderId: string;

  @CreateDateColumn()
  createdAt: Date;
}
