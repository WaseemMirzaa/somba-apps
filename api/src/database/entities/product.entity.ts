import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type ProductStatus = 'draft' | 'pending' | 'approved' | 'rejected' | 'live';

@Entity('products')
export class Product {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  name: string;

  @Column({ type: 'varchar', nullable: true })
  nameFr: string | null;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  /** Price in USD. */
  @Column({ type: 'float' })
  price: number;

  @Index()
  @Column({ type: 'varchar' })
  category: string;

  @Column({ type: 'varchar', nullable: true })
  image: string | null;

  @Column({ type: 'int', default: 0 })
  stock: number;

  @Column({ type: 'float', default: 0 })
  rating: number;

  @Index()
  @Column({ type: 'varchar', length: 20, default: 'live' })
  status: ProductStatus;

  @Column({ type: 'varchar', nullable: true })
  sellerId: string | null;

  @Column({ type: 'varchar', nullable: true })
  sellerName: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
