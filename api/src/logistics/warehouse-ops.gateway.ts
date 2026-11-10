import { ConnectedSocket, MessageBody, SubscribeMessage, WebSocketGateway } from '@nestjs/websockets';
import { InjectRepository } from '@nestjs/typeorm';
import type { Socket } from 'socket.io';
import { Repository } from 'typeorm';
import { User } from '../database/entities';
import { str } from '../common/validate';
import { AgedParcelsService } from './aged-parcels.service';
import { HUB_OPS_ADMINS, HubOpsSettingsService } from './hub-ops-settings.service';
import { Actor, LogisticsService } from './logistics.service';
import { OpsAnalyticsService } from './ops-analytics.service';
import { DESK_ADMINS_ONLY, isDeskAdmin, tierAllows, tierOf } from './tiers';
import { JOB_STEPS, JobStep, WarehouseOpsJob } from './warehouse-ops.job';

type AuthedSocket = Socket & { data: { user?: { id: string; role: string; name: string } } };

const ok = <T>(data: T) => ({ ok: true as const, data });
const fail = (error: string) => ({ ok: false as const, error });

/**
 * Warehouse operations: the warehouse's own settings (working hours, batch size, auto-assignment, aged-parcel ages, delivery-time
 * target), the aged-parcel board with "return to seller", and the leg analytics. A separate gateway on the same Socket.IO server as
 * RealtimeGateway (which authenticates the socket and sets `client.data.user`). Staff are limited to THEIR warehouse and to what their
 * tier allows; admins see every warehouse. Riders are salaried and never accept or refuse: nothing here asks them to.
 *
 * Events: `hubSettings:get`, `hubSettings:update`, `aged:summary`, `aged:returnToSeller`, `analytics:legs`, `warehouseOps:runNow`.
 */
@WebSocketGateway({ cors: { origin: true, credentials: true } })
export class WarehouseOpsGateway {
  constructor(
    private readonly settings: HubOpsSettingsService,
    private readonly aged: AgedParcelsService,
    private readonly analytics: OpsAnalyticsService,
    private readonly logistics: LogisticsService,
    private readonly job: WarehouseOpsJob,
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  /** The caller as the desk sees them: role from the socket, warehouse and tier from the database (they can change while connected). */
  private async actor(client: AuthedSocket): Promise<Actor> {
    const u = client.data?.user;
    if (!u || u.role === 'guest') throw new Error('Sign in to continue.');
    if (u.role.startsWith('admin')) {
      if (!isDeskAdmin(u.role)) throw new Error(DESK_ADMINS_ONLY);
      return { id: u.id, role: u.role, name: u.name, hubId: null, tier: null };
    }
    if (u.role !== 'warehouse_staff') throw new Error('Staff only.');
    const row = await this.users.findOne({ where: { id: u.id }, select: ['id', 'hubId', 'warehouseTier', 'active'] });
    if (!row?.hubId || row.active === false) throw new Error('Your account is not linked to a warehouse. Ask an administrator.');
    return { id: u.id, role: u.role, name: u.name, hubId: row.hubId, tier: tierOf(row.warehouseTier) };
  }

  /** "Now" for a request. Outside production a test may pass `asOf` to move the clock (the aged-parcel job and board read it); in production it is ignored. */
  private clock(asOf: unknown): Date {
    if (typeof asOf === 'string' && asOf && process.env.NODE_ENV !== 'production') {
      const at = new Date(asOf);
      if (Number.isNaN(at.getTime())) throw new Error('asOf must be a date.');
      return at;
    }
    return new Date();
  }

  /** The warehouse a request is about: the staff member's own (a hub they pass is ignored); an admin names it (null = all, where allowed). */
  private hubOf(me: Actor, asked: unknown, required: boolean): string | null {
    if (me.hubId) return me.hubId;
    const id = typeof asked === 'string' && asked.trim() ? str(asked, 'Warehouse', { max: 64 }) : null;
    if (!id && required) throw new Error('Choose a warehouse.');
    return id;
  }

  /** The warehouse's settings. Its staff (any tier) and every admin may read them. */
  @SubscribeMessage('hubSettings:get')
  async get(@ConnectedSocket() client: AuthedSocket, @MessageBody() body?: { hubId?: string }) {
    try {
      const me = await this.actor(client);
      const hubId = this.hubOf(me, body?.hubId, true) as string;
      return ok({ ...(await this.settings.view(hubId)), canEdit: this.settings.canEdit(me, hubId) });
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  /** Change them: the warehouse's manager, or an operations admin. Validated on the server and audited. */
  @SubscribeMessage('hubSettings:update')
  async update(@ConnectedSocket() client: AuthedSocket, @MessageBody() body: Record<string, unknown>) {
    try {
      const me = await this.actor(client);
      const hubId = this.hubOf(me, body?.hubId, true) as string;
      const { hubId: _ignored, ...patch } = body ?? {};
      void _ignored;
      return ok({ ...(await this.settings.update(me, hubId, patch)), canEdit: true });
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  /** For the aged-parcels page: the alert ages, the level each open leg has reached, when it was alerted, and the counts per level. Supervisors and above. */
  @SubscribeMessage('aged:summary')
  async summary(@ConnectedSocket() client: AuthedSocket, @MessageBody() body?: { hubId?: string; asOf?: string }) {
    try {
      const me = await this.actor(client);
      if (!tierAllows(me.role, me.tier, 'oversee')) return fail('Only supervisors and managers can see this.');
      return ok(await this.aged.summary(this.hubOf(me, body?.hubId, false), this.clock(body?.asOf)));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  /** Send a stuck parcel back to its seller (supervisors and managers of the warehouse, admins any). */
  @SubscribeMessage('aged:returnToSeller')
  async returnToSeller(@ConnectedSocket() client: AuthedSocket, @MessageBody() body: { taskId: string }) {
    try {
      const me = await this.actor(client);
      const { closed, legs } = await this.logistics.returnToSeller(str(body?.taskId, 'Task', { max: 64 }), me);
      return ok({ closed: await this.logistics.view(closed), legs: await this.logistics.viewMany(legs) });
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  /** On-time rate, average time per leg and per-rider counts for a period (`from` / `to` as YYYY-MM-DD, default the last 30 days). Managers and admins. */
  @SubscribeMessage('analytics:legs')
  async legs(@ConnectedSocket() client: AuthedSocket, @MessageBody() body?: { hubId?: string; from?: string; to?: string; asOf?: string }) {
    try {
      const me = await this.actor(client);
      if (!tierAllows(me.role, me.tier, 'manage')) return fail('Only managers can see this.');
      return ok(await this.analytics.legs(this.hubOf(me, body?.hubId, false), body, this.clock(body?.asOf)));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  /**
   * Run the warehouse job now (super admin and operations admin): the aged-parcel sweep, auto-assignment of waiting legs and the
   * planning of waiting multi-seller orders. Replies `{ aged, autoAssigned, split }`. `only` limits the pass to some steps
   * (`'aged' | 'assign' | 'split'`), so a test that ages every parcel does not also split every waiting order of its database.
   * Outside production an `asOf` time moves the job's clock, so a test can age the open parcels without waiting.
   */
  @SubscribeMessage('warehouseOps:runNow')
  async runNow(@ConnectedSocket() client: AuthedSocket, @MessageBody() body?: { asOf?: string; only?: unknown }) {
    try {
      const me = await this.actor(client);
      if (!HUB_OPS_ADMINS.includes(me.role)) return fail('Not allowed.');
      let only: readonly JobStep[] = JOB_STEPS;
      if (body?.only !== undefined && body?.only !== null) {
        if (!Array.isArray(body.only) || body.only.some((x) => !JOB_STEPS.includes(x as JobStep))) throw new Error("only must list steps from: 'aged', 'assign', 'split'.");
        only = body.only as JobStep[];
      }
      return ok(await this.job.run(this.clock(body?.asOf), only));
    } catch (e) {
      return fail((e as Error).message);
    }
  }
}
