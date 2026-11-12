import {
  BeforeInsert,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { auditDetailFr } from '../../common/audit-detail-fr';

@Entity('audit_logs')
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  actor: string;

  @Column({ type: 'varchar' })
  role: string;

  @Index()
  @Column({ type: 'varchar' })
  action: string;

  @Column({ type: 'varchar' })
  entity: string;

  @Column({ type: 'varchar', nullable: true })
  entityId: string | null;

  @Column({ type: 'text', nullable: true })
  detail: string | null;

  /**
   * The French version of `detail`, set when the row is written (see `auditDetailFr`). Null where the detail is only data
   * (references, names, codes): readers show `detailFr ?? detail`.
   */
  @Column({ type: 'text', nullable: true })
  detailFr: string | null;

  @BeforeInsert()
  fillDetailFr(): void {
    if (this.detailFr === undefined || this.detailFr === null) this.detailFr = auditDetailFr(this.detail);
  }

  @CreateDateColumn()
  createdAt: Date;
}
