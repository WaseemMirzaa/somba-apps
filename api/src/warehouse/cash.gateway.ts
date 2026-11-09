import { ConnectedSocket, MessageBody, SubscribeMessage, WebSocketGateway } from '@nestjs/websockets';
import { InjectRepository } from '@nestjs/typeorm';
import type { Socket } from 'socket.io';
import { Repository } from 'typeorm';
import { User } from '../database/entities';
import { Actor } from '../logistics/logistics.service';
import { tierOf } from '../logistics/tiers';
import { CASH_DESK_ADMINS } from '../common/staff-access';
import { CashService } from './cash.service';

type AuthedSocket = Socket & { data: { user?: { id: string; role: string; name: string } } };

const ok = <T>(data: T) => ({ ok: true as const, data });
const fail = (error: string) => ({ ok: false as const, error });

/**
 * The cash-on-delivery hand-over desk (C-cod). Lives on the same Socket.IO server as RealtimeGateway (which
 * authenticates the socket and sets `client.data.user`). A rider sees only their own cash; staff act for THEIR warehouse
 * and the tier is enforced by {@link CashService} (receiving cash needs a supervisor or a manager); admins see every warehouse.
 */
@WebSocketGateway({ cors: { origin: true, credentials: true } })
export class CashGateway {
  constructor(
    private readonly cash: CashService,
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  /** The caller as the desk sees them: role from the socket, warehouse and tier from the database (they can change while connected). */
  private async actor(client: AuthedSocket): Promise<Actor> {
    const u = client.data?.user;
    if (!u || u.role === 'guest') throw new Error('Sign in to continue.');
    if (u.role.startsWith('admin')) {
      // Rider cash: the Super Admin, Finance and Operations (`CASH_DESK_ADMINS`); support, marketing and moderation have no part in it.
      if (!CASH_DESK_ADMINS.includes(u.role)) throw new Error('Not allowed.');
      return { id: u.id, role: u.role, name: u.name, hubId: null, tier: null };
    }
    if (u.role !== 'warehouse_staff') throw new Error('Staff only.');
    const row = await this.users.findOne({ where: { id: u.id }, select: ['id', 'hubId', 'warehouseTier', 'active'] });
    if (!row?.hubId || row.active === false) throw new Error('Your account is not linked to a warehouse. Ask an administrator.');
    return { id: u.id, role: u.role, name: u.name, hubId: row.hubId, tier: tierOf(row.warehouseTier) };
  }

  /** A rider's own cash in hand (collected on COD, not yet handed in) and their latest hand-over receipts. */
  @SubscribeMessage('cash:mine')
  async mine(@ConnectedSocket() client: AuthedSocket) {
    try {
      const u = client.data?.user;
      if (!u || u.role !== 'rider') return fail('Riders only.');
      return ok(await this.cash.forRider(u.id));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  /** A supervisor or manager records that a rider handed in cash (partial amounts allowed, never more than the rider holds). */
  @SubscribeMessage('cash:handover')
  async handover(@ConnectedSocket() client: AuthedSocket, @MessageBody() body: { riderId: string; amountUsd: number; note?: string; clientRef?: string }) {
    try {
      return ok(await this.cash.handOver(await this.actor(client), { riderId: body?.riderId, amountUsd: body?.amountUsd, note: body?.note, clientRef: body?.clientRef }));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  /** The hand-over receipts of the caller's warehouse (every warehouse for an admin), newest first. */
  @SubscribeMessage('cash:history')
  async history(@ConnectedSocket() client: AuthedSocket, @MessageBody() body?: { hubId?: string; riderId?: string; limit?: number }) {
    try {
      return ok(await this.cash.history(await this.actor(client), { hubId: body?.hubId ?? null, riderId: body?.riderId ?? null, limit: body?.limit }));
    } catch (e) {
      return fail((e as Error).message);
    }
  }
}
