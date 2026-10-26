import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/** nominated (a seller proposed it) -> approved | declined. Admin-made sales start approved. */
export type FlashSaleStatus = 'nominated' | 'approved' | 'declined';
/** Where the schedule stands, kept by the sweep so each change is announced once. */
export type FlashSalePhase = 'scheduled' | 'running' | 'ended';

@Entity('flash_sales')
export class FlashSale {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  title: string;

  /** Language `title` was written in; the other language is a `translations` row. */
  @Column({ type: 'varchar', length: 5, default: 'en' })
  sourceLang: string;

  @Column({ type: 'varchar' })
  productId: string;

  @Column({ type: 'float' })
  flashPrice: number;

  @Column({ type: 'int', default: 0 })
  discount: number;

  @Column({ type: 'varchar', nullable: true })
  startsAt: string | null;

  @Column({ type: 'varchar', nullable: true })
  endsAt: string | null;

  @Column({ type: 'boolean', default: true })
  active: boolean;

  /** The store that nominated the sale (null = created by an admin). */
  @Index('IDX_flash_sales_seller')
  @Column({ type: 'varchar', length: 36, nullable: true })
  sellerId: string | null;

  @Column({ type: 'varchar', length: 16, default: 'approved' })
  status: FlashSaleStatus;

  @Column({ type: 'varchar', length: 12, default: 'scheduled' })
  phase: FlashSalePhase;

  /** Why an admin declined a nomination. */
  @Column({ type: 'varchar', length: 300, nullable: true })
  rejectReason: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
