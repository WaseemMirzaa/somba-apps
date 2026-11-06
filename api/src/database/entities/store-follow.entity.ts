import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/** A customer following a store: they hear about its new products. One row per customer and store. */
@Entity('store_follows')
@Index('IDX_store_follows_unique', ['userId', 'sellerId'], { unique: true })
export class StoreFollow {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  userId: string;

  /** The store (a `sellers` row), not its owner's account. */
  @Index('IDX_store_follows_seller')
  @Column({ type: 'varchar', length: 36 })
  sellerId: string;

  @CreateDateColumn()
  createdAt: Date;
}
