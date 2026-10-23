import { Column, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/** One line of a customer's cart (or "saved for later"), kept on the account so web and app share it. */
@Entity('cart_lines')
@Index('IDX_cart_lines_user', ['userId'])
export class CartLine {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  userId: string;

  @Column({ type: 'varchar', length: 36 })
  productId: string;

  /** "Default" or "Size: 42 · Colour: Black" (checked again when the order is placed). */
  @Column({ type: 'varchar', length: 200, default: 'Default' })
  variant: string;

  @Column({ type: 'int', default: 1 })
  qty: number;

  /** Price the shopper saw when adding the line, to point out later price changes (information only). */
  @Column({ type: 'float', nullable: true })
  priceWhenAdded: number | null;

  /** true = "saved for later", not part of the cart total. */
  @Column({ type: 'boolean', default: false })
  saved: boolean;

  /** Order of the lines as the shopper sees them. */
  @Column({ type: 'int', default: 0 })
  position: number;

  @UpdateDateColumn()
  updatedAt: Date;
}
