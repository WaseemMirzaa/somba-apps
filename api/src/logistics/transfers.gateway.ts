import { ConnectedSocket, MessageBody, SubscribeMessage, WebSocketGateway } from '@nestjs/websockets';
import { InjectRepository } from '@nestjs/typeorm';
import type { Socket } from 'socket.io';
import { Repository } from 'typeorm';
import { User } from '../database/entities';
import { LanesService } from './lanes.service';
import { Actor } from './logistics.service';
import { RunsService } from './runs.service';

type AuthedSocket = Socket & { data: { user?: { id: string; role: string; name: string } } };

const ok = <T>(data: T) => ({ ok: true as const, data });
const fail = (error: string) => ({ ok: false as const, error });

const LANE_ADMINS = ['admin', 'admin_operations'];

/**
 * Multi-warehouse transfers: the lanes between warehouses (`lanes:*`, `routes:preview`), the transfer runs of the
 * warehouse desk (`logistics:*Run*`) and the driver's side (`rider:runs`, `rider:runStatus`). Shares the Socket.IO server
 * with RealtimeGateway, which authenticates the socket. See docs/contracts/areas.md.
 */
@WebSocketGateway({ cors: { origin: true, credentials: true } })
export class TransfersGateway {
  constructor(
    private readonly lanes: LanesService,
    private readonly runs: RunsService,
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  private signedIn(client: AuthedSocket) {
    const u = client.data?.user;
    if (!u || u.role === 'guest') throw new Error('Sign in to continue.');
    return u;
  }

  private isOps(role: string): boolean {
    return role.startsWith('admin') || role === 'warehouse_staff';
  }

  /** The caller as the desk sees them: warehouse and tier come from the database (they can change while connected). */
  private async actor(client: AuthedSocket): Promise<Actor> {
    const u = this.signedIn(client);
    if (u.role.startsWith('admin')) return { id: u.id, role: u.role, name: u.name, hubId: null, tier: null };
    if (u.role !== 'warehouse_staff') throw new Error('Staff only.');
    const row = await this.users.findOne({ where: { id: u.id }, select: ['id', 'hubId', 'warehouseTier', 'active'] });
    if (!row?.hubId) throw new Error('Your account is not linked to a warehouse. Ask an administrator.');
    return { id: u.id, role: u.role, name: u.name, hubId: row.hubId, tier: row.warehouseTier ?? 'operator' };
  }

  // ── lanes ────────────────────────────────────────────────────────────────────
  @SubscribeMessage('lanes:list')
  async lanesList(@ConnectedSocket() client: AuthedSocket, @MessageBody() body?: { hubId?: string }) {
    try {
      if (!this.isOps(this.signedIn(client).role)) return fail('Staff only.');
      return ok(await this.lanes.list(body?.hubId ? String(body.hubId) : null));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  @SubscribeMessage('lanes:upsert')
  async lanesUpsert(@ConnectedSocket() client: AuthedSocket, @MessageBody() body: Record<string, unknown>) {
    try {
      if (!LANE_ADMINS.includes(this.signedIn(client).role)) return fail('Not allowed.');
      return ok(await this.lanes.upsert(body ?? {}));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  @SubscribeMessage('lanes:remove')
  async lanesRemove(@ConnectedSocket() client: AuthedSocket, @MessageBody() body: { id?: string; both?: boolean }) {
    try {
      if (!LANE_ADMINS.includes(this.signedIn(client).role)) return fail('Not allowed.');
      return ok(await this.lanes.remove(body?.id, { both: body?.both === true }));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  @SubscribeMessage('routes:preview')
  async routesPreview(@ConnectedSocket() client: AuthedSocket, @MessageBody() body: { fromHubId?: string; toHubId?: string }) {
    try {
      if (!this.isOps(this.signedIn(client).role)) return fail('Staff only.');
      return ok(await this.lanes.preview(body?.fromHubId, body?.toHubId));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  // ── transfer runs (warehouse desk) ───────────────────────────────────────────
  @SubscribeMessage('logistics:runs')
  async runList(@ConnectedSocket() client: AuthedSocket, @MessageBody() body?: { status?: string; direction?: string; hubId?: string }) {
    try {
      return ok(await this.runs.list(await this.actor(client), { status: body?.status, direction: body?.direction, hubId: body?.hubId }));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  @SubscribeMessage('logistics:runProposals')
  async runProposals(@ConnectedSocket() client: AuthedSocket, @MessageBody() body?: { hubId?: string }) {
    try {
      return ok(await this.runs.proposals(await this.actor(client), body?.hubId));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  @SubscribeMessage('logistics:createRun')
  async createRun(@ConnectedSocket() client: AuthedSocket, @MessageBody() body: { toHubId?: string; taskIds?: string[]; fromHubId?: string }) {
    try {
      return ok(await this.runs.create(await this.actor(client), body ?? {}));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  @SubscribeMessage('logistics:updateRun')
  async updateRun(@ConnectedSocket() client: AuthedSocket, @MessageBody() body: { runId?: string; addTaskIds?: string[]; removeTaskIds?: string[] }) {
    try {
      return ok(await this.runs.update(await this.actor(client), body ?? {}));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  @SubscribeMessage('logistics:splitRun')
  async splitRun(@ConnectedSocket() client: AuthedSocket, @MessageBody() body: { runId?: string; taskIds?: string[] }) {
    try {
      return ok(await this.runs.split(await this.actor(client), body ?? {}));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  @SubscribeMessage('logistics:assignRun')
  async assignRun(@ConnectedSocket() client: AuthedSocket, @MessageBody() body: { runId?: string; riderId?: string }) {
    try {
      return ok(await this.runs.assign(await this.actor(client), body ?? {}));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  @SubscribeMessage('logistics:dispatchRun')
  async dispatchRun(@ConnectedSocket() client: AuthedSocket, @MessageBody() body: { runId?: string }) {
    try {
      return ok(await this.runs.dispatch(await this.actor(client), body ?? {}));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  @SubscribeMessage('logistics:receiveRun')
  async receiveRun(@ConnectedSocket() client: AuthedSocket, @MessageBody() body: { runId?: string; taskIds?: string[] }) {
    try {
      return ok(await this.runs.receive(await this.actor(client), body ?? {}));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  @SubscribeMessage('logistics:closeRun')
  async closeRun(@ConnectedSocket() client: AuthedSocket, @MessageBody() body: { runId?: string }) {
    try {
      return ok(await this.runs.close(await this.actor(client), body ?? {}));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  // ── the driver ───────────────────────────────────────────────────────────────
  @SubscribeMessage('rider:runs')
  async riderRuns(@ConnectedSocket() client: AuthedSocket) {
    try {
      const u = this.signedIn(client);
      if (u.role !== 'rider') return fail('Riders only.');
      return ok(await this.runs.forRider(u.id));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  /** The driver reports the whole run on the road. */
  @SubscribeMessage('rider:runStatus')
  async riderRunStatus(@ConnectedSocket() client: AuthedSocket, @MessageBody() body: { runId?: string; status?: string }) {
    try {
      const u = this.signedIn(client);
      if (u.role !== 'rider') return fail('Riders only.');
      if (body?.status !== 'in_transit') return fail('Status must be in_transit.');
      return ok(await this.runs.markInTransit(String(body?.runId ?? ''), u.id));
    } catch (e) {
      return fail((e as Error).message);
    }
  }
}
