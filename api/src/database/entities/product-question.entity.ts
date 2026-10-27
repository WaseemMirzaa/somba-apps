import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('product_questions')
export class ProductQuestion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'varchar' })
  productId: string;

  @Column({ type: 'varchar' })
  askedBy: string;

  /** The asker's account (null on questions asked before this was stored). They are told when it is answered. */
  @Index()
  @Column({ type: 'varchar', length: 36, nullable: true })
  askerId: string | null;

  /** The product's store when asked (the seller's inbox filters on it). */
  @Index()
  @Column({ type: 'varchar', nullable: true })
  sellerId: string | null;

  @Column({ type: 'text' })
  question: string;

  @Column({ type: 'text', nullable: true })
  answer: string | null;

  @Column({ type: 'varchar', nullable: true })
  answeredBy: string | null;

  @Column({ type: 'datetime', nullable: true })
  answeredAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}
