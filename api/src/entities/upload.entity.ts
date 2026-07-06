import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { UploadContext } from '../common/enums';

@Entity('uploads')
export class Upload {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  context: UploadContext;

  @Column()
  filename: string;

  /** Public URL served from the static uploads mount. */
  @Column()
  url: string;

  @Column({ nullable: true })
  mime?: string;

  @Column({ type: 'int', default: 0 })
  sizeBytes: number;

  @Column({ nullable: true })
  uploadedBy?: string;

  @CreateDateColumn()
  createdAt: Date;
}
