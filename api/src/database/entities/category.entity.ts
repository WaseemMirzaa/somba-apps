import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('categories')
export class Category {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  name: string;

  /** Language `name` was written in; the other language is a `translations` row. */
  @Column({ type: 'varchar', length: 5, default: 'en' })
  sourceLang: string;

  @Column({ type: 'varchar', nullable: true })
  icon: string | null;

  @Column({ type: 'varchar', nullable: true })
  image: string | null;

  @Column({ type: 'int', default: 0 })
  sortOrder: number;

  /**
   * Seller commission (%) for listings in this category; NULL = the global default (`settings.commissionPct`). 0 is a real
   * rate. Never shown to customers or guests (stripped from `categories:list` / `categories:updated` for them).
   */
  @Column({ type: 'float', nullable: true })
  commissionPct: number | null;
}
