import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Product } from './product.entity';
import { User } from './user.entity';

/** A customer product review. */
@Entity('reviews')
export class Review {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @ManyToOne(() => Product, { onDelete: 'CASCADE' })
  @JoinColumn()
  product: Product;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn()
  user?: User;

  /** Snapshot of the author's display name at review time. */
  @Column()
  authorName: string;

  @Column({ type: 'int', default: 5 })
  stars: number;

  @Column({ type: 'text', nullable: true })
  text?: string;

  /** Number of photos attached to the review. */
  @Column({ type: 'int', default: 0 })
  photos: number;

  @CreateDateColumn()
  createdAt: Date;
}
