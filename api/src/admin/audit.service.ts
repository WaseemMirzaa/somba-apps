import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from '../entities/audit-log.entity';
import { AuthUser } from '../common/decorators';

@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AuditLog)
    private readonly logs: Repository<AuditLog>,
  ) {}

  /** Persist an admin action for the audit trail. */
  async log(
    user: AuthUser,
    action: string,
    entity: string,
    entityId?: string,
    detail?: string,
  ): Promise<AuditLog> {
    const entry = this.logs.create({
      actor: user.email,
      role: user.role,
      action,
      entity,
      entityId,
      detail,
    });
    return this.logs.save(entry);
  }

  async list(opts: { entity?: string; limit?: number }): Promise<AuditLog[]> {
    const limit = Math.min(200, Math.max(1, opts.limit ?? 50));
    const qb = this.logs.createQueryBuilder('a').orderBy('a.createdAt', 'DESC').take(limit);
    if (opts.entity) qb.where('a.entity = :entity', { entity: opts.entity });
    return qb.getMany();
  }
}
