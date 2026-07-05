import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { UserRole } from '../common/enums';

@Entity('audit_logs')
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  actor: string;

  @Column({ type: 'varchar' })
  role: UserRole;

  @Column()
  action: string;

  @Column()
  entity: string;

  @Column({ nullable: true })
  entityId?: string;

  @Column({ type: 'text', nullable: true })
  detail?: string;

  @CreateDateColumn()
  createdAt: Date;
}
