import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/** Which kind of record a translation belongs to. */
export type TranslationEntityType =
  | 'product'
  | 'category'
  | 'seller'
  | 'campaign'
  | 'flash_sale'
  | 'cms_block'
  | 'broadcast'
  | 'order_item'
  | 'notification'
  | 'review'
  | 'review_reply'
  | 'question'
  | 'answer';

/** author = typed by a person (a machine never overwrites it) · machine = Google · snapshot = copied at order time. */
export type TranslationOrigin = 'author' | 'machine' | 'snapshot';

/**
 * One translated value of one field of one record in one language. A record keeps its authored text in its own
 * columns (in its `sourceLang`); every OTHER language lives here, so a new language needs no schema change.
 */
@Index('IDX_translations_unique', ['entityType', 'entityId', 'field', 'locale'], { unique: true })
@Index('IDX_translations_entity', ['entityType', 'entityId'])
@Index('IDX_translations_hash', ['sourceHash', 'locale'])
@Entity('translations')
export class Translation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 24 })
  entityType: TranslationEntityType;

  @Column({ type: 'varchar', length: 36 })
  entityId: string;

  /** name | description | variants | title | body | text | reply | productName | variant */
  @Column({ type: 'varchar', length: 32 })
  field: string;

  @Column({ type: 'varchar', length: 5 })
  locale: string;

  @Column({ type: 'text' })
  value: string;

  @Column({ type: 'varchar', length: 10 })
  origin: TranslationOrigin;

  /** The language the value was translated from (detected for reviews / Q&A). */
  @Column({ type: 'varchar', length: 5, nullable: true })
  sourceLang: string | null;

  /** sha1 hex (40 chars; varchar so SQLite dev/test databases work) of sourceLang + "\n" + source text: tells a stale machine row from a current one and lets equal strings share one call. */
  @Column({ type: 'varchar', length: 40, nullable: true })
  sourceHash: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
