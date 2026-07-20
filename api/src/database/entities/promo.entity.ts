import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('promos')
export class Promo {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 40 })
  code: string;

  @Column({ type: 'varchar', length: 20, default: 'percent' })
  type: 'percent' | 'fixed';

  @Column({ type: 'float' })
  value: number;

  @Column({ type: 'float', default: 0 })
  minOrder: number;

  @Column({ type: 'varchar', nullable: true })
  description: string | null;

  @Column({ type: 'boolean', default: true })
  active: boolean;
}
