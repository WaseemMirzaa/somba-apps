import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from '../database/entities';
import { RealtimeEmitter } from '../realtime/realtime-emitter';
import { AUDIT_ROLES } from '../common/role-groups';
import { pageOf } from '../common/paging';

/** What `audit:list` accepts; every field is optional and they combine with AND. */
export interface AuditFilter {
  /** One exact action, e.g. `user.suspend`. */
  action?: string;
  /** Part of the actor's name (any case). */
  actor?: string;
  /** The actor's role, e.g. `admin_finance`. */
  role?: string;
  /** The kind of thing acted on, e.g. `order`. */
  entity?: string;
  /** Part of the actor, action, entity id or detail (any case). */
  q?: string;
  /** First day to include (`YYYY-MM-DD` or a full ISO time, UTC). */
  from?: string;
  /** Last day to include; a bare date means the whole day (UTC). */
  to?: string;
  limit?: number;
  offset?: number;
}

/** A default page is the 300 newest entries the screen always showed; a client can ask for less or page on. */
const DEFAULT_PAGE = 300;

const text = (v: unknown, label: string): string | undefined => {
  if (v === undefined || v === null || v === '') return undefined;
  if (typeof v !== 'string') throw new Error(`${label} must be text.`);
  const t = v.trim().slice(0, 200);
  return t || undefined;
};

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
/** A date filter bound. A bare date is the start of that day, or (for `to`) the very end of it. */
function bound(v: unknown, label: string, end: boolean): Date | undefined {
  const t = text(v, label);
  if (!t) return undefined;
  const d = DATE_ONLY.test(t) ? new Date(`${t}T${end ? '23:59:59.999' : '00:00:00.000'}Z`) : new Date(t);
  if (Number.isNaN(d.getTime())) throw new Error(`${label} must be a valid date.`);
  return d;
}

/** `!` is the LIKE escape character (a backslash is not a single character in every database). */
const likeOf = (s: string) => `%${s.replace(/[!%_]/g, (c) => `!${c}`)}%`;

@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AuditLog) private readonly repo: Repository<AuditLog>,
    private readonly emitter: RealtimeEmitter,
  ) {}

  /** Newest first, filtered and paged on the server. With no input it is the 300 newest entries, as before. */
  async list(input?: AuditFilter | null): Promise<AuditLog[]> {
    const f = (input && typeof input === 'object' ? input : {}) as AuditFilter;
    const { take, skip } = pageOf(f, { def: DEFAULT_PAGE });
    const from = bound(f.from, 'From', false);
    const to = bound(f.to, 'To', true);
    if (from && to && from > to) throw new Error('The "from" date is after the "to" date.');
    const action = text(f.action, 'Action');
    const actor = text(f.actor, 'Actor');
    const role = text(f.role, 'Role');
    const entity = text(f.entity, 'Entity');
    const q = text(f.q, 'Search');

    const qb = this.repo.createQueryBuilder('a');
    if (action) qb.andWhere('a.action = :action', { action });
    if (actor) qb.andWhere("a.actor LIKE :actor ESCAPE '!'", { actor: likeOf(actor) });
    if (role) qb.andWhere('a.role = :role', { role });
    if (entity) qb.andWhere('a.entity = :entity', { entity });
    if (from) qb.andWhere('a.createdAt >= :from', { from });
    if (to) qb.andWhere('a.createdAt <= :to', { to });
    if (q) {
      qb.andWhere(
        "(a.actor LIKE :q ESCAPE '!' OR a.action LIKE :q ESCAPE '!' OR a.entityId LIKE :q ESCAPE '!' OR a.detail LIKE :q ESCAPE '!')",
        { q: likeOf(q) },
      );
    }
    // `id` breaks ties so a page boundary never repeats or skips an entry written in the same second.
    return qb.orderBy('a.createdAt', 'DESC').addOrderBy('a.id', 'ASC').take(take).skip(skip).getMany();
  }

  /** The actions and roles that appear in the log, for the filter pickers. */
  async facets(): Promise<{ actions: string[]; roles: string[] }> {
    const col = async (c: 'action' | 'role') =>
      (await this.repo.createQueryBuilder('a').select(`DISTINCT a.${c}`, 'v').orderBy(`a.${c}`, 'ASC').getRawMany<{ v: string }>()).map((r) => r.v);
    return { actions: await col('action'), roles: await col('role') };
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
    this.emitter.toRoles(AUDIT_ROLES, 'audit:created', log);
    return log;
  }
}
