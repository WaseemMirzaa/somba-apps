import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

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

  @CreateDateColumn()
  createdAt: Date;
}
