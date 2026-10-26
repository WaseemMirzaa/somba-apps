import { ConnectedSocket, MessageBody, SubscribeMessage, WebSocketGateway } from '@nestjs/websockets';
import { InjectRepository } from '@nestjs/typeorm';
import type { Socket } from 'socket.io';
import { Repository } from 'typeorm';
import { AuditLog, User } from '../database/entities';
import { RealtimeEmitter } from '../realtime/realtime-emitter';
import { ADMIN_ROLES } from '../notifications/notifications.service';
import { tierAllows } from '../logistics/tiers';
import { CoverageService } from './coverage.service';
import { GeoService } from './geo.service';

type AuthedSocket = Socket & { data: { user?: { id: string; role: string; name: string } } };

const ok = <T>(data: T) => ({ ok: true as const, data });
const fail = (error: string) => ({ ok: false as const, error });

const GEO_ADMINS = ['admin', 'admin_operations'];

/**
 * `geo:*` (the area tree, search, resolve; admins edit), `coverage:*` and the coverage half of the warehouse directory
 * (`hubs:coverage|assign|unassign`). Shares the Socket.IO server with RealtimeGateway, which authenticates the socket
 * (guests included: pickers work before sign-in). See docs/contracts/areas.md.
 */
@WebSocketGateway({ cors: { origin: true, credentials: true } })
export class GeoGateway {
  constructor(
    private readonly geo: GeoService,
    private readonly coverage: CoverageService,
    private readonly emitter: RealtimeEmitter,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(AuditLog) private readonly audits: Repository<AuditLog>,
  ) {}

  private role(client: AuthedSocket): string {
    return client.data?.user?.role ?? 'guest';
  }

  private isGeoAdmin(client: AuthedSocket): boolean {
    return GEO_ADMINS.includes(this.role(client));
  }

  private requireAdmin(client: AuthedSocket) {
    const u = client.data?.user;
    if (!u || !GEO_ADMINS.includes(u.role)) throw new Error('Not allowed.');
    return u;
  }

  private audit(u: { name: string; role: string }, action: string, entity: string, entityId: string | null, detail: string): void {
    void this.audits
      .save(this.audits.create({ actor: u.name, role: u.role, action, entity, entityId, detail }))
      .then((log) => this.emitter.toRoles(ADMIN_ROLES, 'audit:created', log))
      .catch(() => undefined);
  }

  // ── geography (everyone may read) ────────────────────────────────────────────
  @SubscribeMessage('geo:children')
  async children(@ConnectedSocket() client: AuthedSocket, @MessageBody() body?: { parentId?: string | null; parentCode?: string | null; flatten?: string | null }) {
    try {
      return ok(await this.geo.children({ parentId: body?.parentId ?? null, parentCode: body?.parentCode ?? null, flatten: body?.flatten ?? null }, { includeInactive: this.isGeoAdmin(client) }));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  /** A city's communes in one call, each with its district (shorthand for `geo:children` with `flatten: 'commune'`). */
  @SubscribeMessage('geo:communes')
  async communes(@ConnectedSocket() client: AuthedSocket, @MessageBody() body?: { cityId?: string | null; cityCode?: string | null; parentId?: string | null }) {
    try {
      return ok(await this.geo.children({ parentId: body?.cityId ?? body?.parentId ?? null, parentCode: body?.cityCode ?? 'CD-KN-KIN', flatten: 'commune' }, { includeInactive: this.isGeoAdmin(client) }));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  /** The cities with any coverage (served, or with a served district / commune inside): what the not-served message lists. */
  @SubscribeMessage('geo:servedCities')
  async servedCities() {
    try {
      return ok(await this.geo.servedCities());
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  @SubscribeMessage('geo:tree')
  async tree(@ConnectedSocket() client: AuthedSocket, @MessageBody() body?: { rootCode?: string | null; depth?: number | null }) {
    try {
      return ok(await this.geo.tree({ rootCode: body?.rootCode ?? null, depth: body?.depth ?? null }, { includeInactive: this.isGeoAdmin(client) }));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  @SubscribeMessage('geo:search')
  async search(@ConnectedSocket() client: AuthedSocket, @MessageBody() body?: { q?: string; level?: string; servedOnly?: boolean; limit?: number }) {
    try {
      return ok(await this.geo.search(body ?? {}, { includeInactive: this.isGeoAdmin(client) }));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  /**
   * One area by id (or code) with its ancestors. Hidden areas are served too: an order keeps the area it was placed
   * for (`orders.destinationAreaId`) even after an admin switched that area off, and its name must still be shown.
   */
  @SubscribeMessage('geo:get')
  async getArea(@ConnectedSocket() client: AuthedSocket, @MessageBody() body?: { id?: string; code?: string }) {
    try {
      const user = client.data?.user;
      if (!user || user.role === 'guest') return fail('Sign in to continue.'); // a guest's read-only socket is not signed in
      const row = body?.code ? await this.geo.getByCode(String(body.code)) : await this.geo.get(body?.id);
      if (!row) return fail('Area not found.');
      const [area, chain] = await Promise.all([this.geo.view(row.id), this.geo.chainView(row.id)]);
      return ok({ area, chain });
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  @SubscribeMessage('geo:resolve')
  async resolve(@MessageBody() body?: { components?: unknown; text?: { commune?: string; city?: string; province?: string }; pin?: { lat?: number; lng?: number } }) {
    try {
      return ok(await this.geo.resolve(body ?? {}));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  @SubscribeMessage('geo:create')
  async create(@ConnectedSocket() client: AuthedSocket, @MessageBody() body: Record<string, unknown>) {
    try {
      const u = this.requireAdmin(client);
      const area = await this.geo.create(body ?? {});
      this.audit(u, 'geo.created', 'geo_area', area.id, `${area.level} ${area.name} (${area.code})`);
      return ok(area);
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  @SubscribeMessage('geo:update')
  async update(@ConnectedSocket() client: AuthedSocket, @MessageBody() body: Record<string, unknown>) {
    try {
      const u = this.requireAdmin(client);
      const area = await this.geo.update(body ?? {});
      this.audit(u, 'geo.updated', 'geo_area', area.id, `${area.level} ${area.name} (${area.code})`);
      return ok(area);
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  /** Shorthand for `geo:update { id, active }`. */
  @SubscribeMessage('geo:setActive')
  async setActive(@ConnectedSocket() client: AuthedSocket, @MessageBody() body: { id?: string; active?: boolean }) {
    return this.update(client, { id: body?.id, active: body?.active });
  }

  /** Customers, sellers and orders in an area and below it (admin Geography screen). */
  @SubscribeMessage('geo:stats')
  async stats(@ConnectedSocket() client: AuthedSocket, @MessageBody() body: { areaId?: string; id?: string }) {
    try {
      this.requireAdmin(client);
      return ok(await this.geo.stats(body?.areaId ?? body?.id));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  // ── warehouse coverage ───────────────────────────────────────────────────────
  /** Admins read any warehouse's coverage; a manager reads THEIR warehouse's. */
  @SubscribeMessage('hubs:coverage')
  async hubCoverage(@ConnectedSocket() client: AuthedSocket, @MessageBody() body: { hubId?: string }) {
    try {
      const u = client.data?.user;
      if (!u || u.role === 'guest') throw new Error('Sign in to continue.');
      if (!GEO_ADMINS.includes(u.role)) {
        const row = await this.users.findOne({ where: { id: u.id }, select: ['id', 'hubId', 'warehouseTier', 'role'] });
        const mine = !!row?.hubId && row.hubId === String(body?.hubId ?? '');
        // A manager reads their warehouse's coverage; so does any rider of it (the rider app shows where they deliver).
        const allowed = mine && ((u.role === 'warehouse_staff' && tierAllows(row.role, row.warehouseTier, 'manage')) || u.role === 'rider');
        if (!allowed) throw new Error('Not allowed.');
      }
      return ok(await this.coverage.forHub(body?.hubId));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  @SubscribeMessage('hubs:assign')
  async assign(@ConnectedSocket() client: AuthedSocket, @MessageBody() body: { hubId?: string; areaIds?: string[]; move?: boolean; feeOverrideUsd?: number | null }) {
    try {
      const u = this.requireAdmin(client);
      const out = await this.coverage.assign(body ?? {});
      if (out.assigned.length) this.audit(u, body?.move ? 'coverage.moved' : 'coverage.assigned', 'hub', String(body?.hubId ?? ''), out.assigned.map((a) => a.code).join(', ').slice(0, 480));
      return ok(out);
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  @SubscribeMessage('hubs:unassign')
  async unassign(@ConnectedSocket() client: AuthedSocket, @MessageBody() body: { hubId?: string; areaIds?: string[] }) {
    try {
      const u = this.requireAdmin(client);
      const out = await this.coverage.unassign(body ?? {});
      if (out.removed) this.audit(u, 'coverage.removed', 'hub', String(body?.hubId ?? ''), `${out.removed} area(s)`);
      return ok(out);
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  @SubscribeMessage('coverage:map')
  async map(@ConnectedSocket() client: AuthedSocket, @MessageBody() body?: { rootId?: string }) {
    try {
      const role = this.role(client);
      if (!GEO_ADMINS.includes(role) && !role.startsWith('admin') && role !== 'warehouse_staff') throw new Error('Not allowed.');
      return ok(await this.coverage.map(body?.rootId));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  @SubscribeMessage('coverage:gaps')
  async gaps(@ConnectedSocket() client: AuthedSocket, @MessageBody() body: { rootId?: string }) {
    try {
      this.requireAdmin(client);
      return ok(await this.coverage.gaps(body?.rootId));
    } catch (e) {
      return fail((e as Error).message);
    }
  }
}
