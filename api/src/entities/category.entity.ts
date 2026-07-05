import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { numeric } from '../common/numeric.transformer';
import { Product } from './product.entity';

@Entity('categories')
export class Category {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ nullable: true })
  nameFr?: string;

  @Index({ unique: true })
  @Column()
  slug: string;

  /** Category-tiered platform commission (percent, 8–15%). */
  @Column({ type: 'decimal', precision: 5, scale: 2, default: 10, transformer: numeric })
  commissionRate: number;

  @Column({ nullable: true })
  imageUrl?: string;

  @Column({ default: true })
  active: boolean;

  @OneToMany(() => Product, (product) => product.category)
  products: Product[];

  @CreateDateColumn()
  createdAt: Date;
}
