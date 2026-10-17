import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Daily counter of product-detail views by shoppers (customers and guests; the
 * owning seller and staff are not counted). One row per product per UTC day —
 * a real, windowed number for the seller conversion funnel (not unique visitors).
 */
@Index('IDX_product_views_product_day', ['productId', 'viewDate'], { unique: true })
@Entity('product_views')
export class ProductView {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  productId: string;

  /** UTC day, 'YYYY-MM-DD'. */
  @Column({ type: 'varchar', length: 10 })
  viewDate: string;

  @Column({ type: 'int', default: 0 })
  views: number;
}
