import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('broadcasts')
export class Broadcast {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  title: string;

  @Column({ type: 'text' })
  body: string;

  /** Language `title` / `body` were written in. */
  @Column({ type: 'varchar', length: 5, default: 'en' })
  sourceLang: string;

  /** Target audience role, or 'all'. */
  @Column({ type: 'varchar', default: 'customer' })
  audience: string;

  @Column({ type: 'varchar' })
  sentBy: string;

  @Column({ type: 'int', default: 0 })
  recipients: number;

  @CreateDateColumn()
  createdAt: Date;
}
