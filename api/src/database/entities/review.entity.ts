import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('reviews')
export class Review {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'varchar' })
  productId: string;

  @Column({ type: 'varchar' })
  userId: string;

  @Column({ type: 'varchar' })
  author: string;

  @Column({ type: 'int', default: 5 })
  rating: number;

  @Column({ type: 'text' })
  text: string;

  /** How many shoppers found this review helpful. */
  @Column({ type: 'int', default: 0 })
  helpful: number;

  @CreateDateColumn()
  createdAt: Date;
}
