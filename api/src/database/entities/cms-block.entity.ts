import {
  Column,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('cms_blocks')
export class CmsBlock {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'varchar' })
  key: string;

  @Column({ type: 'varchar' })
  title: string;

  @Column({ type: 'text' })
  body: string;

  /** Language `title` / `body` were written in. */
  @Column({ type: 'varchar', length: 5, default: 'en' })
  sourceLang: string;

  @Column({ type: 'varchar', default: 'banner' })
  type: string;

  @Column({ type: 'boolean', default: true })
  active: boolean;

  /** Home-card picture (an uploaded image URL). Null: the app draws the designed gradient for `colorKey`. */
  @Column({ type: 'varchar', length: 500, nullable: true })
  imageUrl: string | null;

  /** What a tap on the card opens: product / category / store (id in `linkTarget`), deals (no target) or url. Null: not tappable. */
  @Column({ type: 'varchar', length: 16, nullable: true })
  linkType: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  linkTarget: string | null;

  /** Call-to-action label in English and French (null: no button). */
  @Column({ type: 'varchar', length: 40, nullable: true })
  ctaText: string | null;

  @Column({ type: 'varchar', length: 40, nullable: true })
  ctaTextFr: string | null;

  /** Position in the home carousel (lowest first). */
  @Column({ type: 'int', default: 0 })
  sortOrder: number;

  /** Visible from / until (null: no limit). */
  @Column({ type: 'datetime', nullable: true })
  startsAt: Date | null;

  @Column({ type: 'datetime', nullable: true })
  endsAt: Date | null;

  /** Colour token of the fallback gradient (see CMS_COLOR_KEYS); the app maps it to its palette. */
  @Column({ type: 'varchar', length: 24, nullable: true })
  colorKey: string | null;

  @UpdateDateColumn()
  updatedAt: Date;
}
