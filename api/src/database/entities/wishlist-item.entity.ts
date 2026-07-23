import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/** A product a shopper has saved to their wishlist. */
@Index(['userId', 'productId'], { unique: true })
@Entity('wishlist_items')
export class WishlistItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'varchar' })
  userId: string;

  @Column({ type: 'varchar' })
  productId: string;

  @CreateDateColumn()
  createdAt: Date;
}
