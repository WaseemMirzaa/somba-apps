import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from '../database/entities';
import { RealtimeEmitter } from '../realtime/realtime-emitter';
import { ADMIN_ROLES } from '../notifications/notifications.service';

@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AuditLog) private readonly repo: Repository<AuditLog>,
    private readonly emitter: RealtimeEmitter,
  ) {}

  list(): Promise<AuditLog[]> {
    return this.repo.find({ order: { createdAt: 'DESC' }, take: 300 });
  }

  async record(entry: {
    actor: string;
    role: string;
    action: string;
    entity: string;
    entityId?: string;
    detail?: string;
  }): Promise<AuditLog> {
    const log = await this.repo.save(
      this.repo.create({
        actor: entry.actor,
        role: entry.role,
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId ?? null,
        detail: entry.detail ?? null,
      }),
    );
    this.emitter.toRoles(ADMIN_ROLES, 'audit:created', log);
    return log;
  }
}
