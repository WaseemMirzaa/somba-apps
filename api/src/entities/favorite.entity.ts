import {
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { Product } from './product.entity';
import { User } from './user.entity';

/** A customer's wishlisted product (one row per user+product). */
@Entity('favorites')
@Unique(['user', 'product'])
export class Favorite {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn()
  user: User;

  @ManyToOne(() => Product, { onDelete: 'CASCADE', eager: true })
  @JoinColumn()
  product: Product;

  @CreateDateColumn()
  createdAt: Date;
}
