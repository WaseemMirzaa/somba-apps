import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export type PrivateFileKind = 'kyc';

/**
 * A file that is NOT served from the public /uploads/ folder: store KYC documents. It is downloaded only through
 * `GET /api/v1/private-uploads/:id` by its owner, a moderator or an admin.
 */
@Entity('private_files')
export class PrivateFile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('IDX_private_files_owner')
  @Column({ type: 'varchar', length: 36 })
  ownerUserId: string;

  @Column({ type: 'varchar', length: 20, default: 'kyc' })
  kind: PrivateFileKind;

  /** File name on disk inside the private folder (uuid + extension). */
  @Column({ type: 'varchar', length: 80 })
  storedName: string;

  @Column({ type: 'varchar', length: 40 })
  mime: string;

  @Column({ type: 'int', default: 0 })
  size: number;

  @CreateDateColumn()
  createdAt: Date;
}
