import { ConnectedSocket, MessageBody, SubscribeMessage, WebSocketGateway } from '@nestjs/websockets';
import { InjectRepository } from '@nestjs/typeorm';
import type { Socket } from 'socket.io';
import { Repository } from 'typeorm';
import { User } from '../database/entities';
import { Actor } from '../logistics/logistics.service';
import { tierOf } from '../logistics/tiers';
import { limitSocket } from '../common/socket-limit';
import { ShiftService } from './shift.service';

type AuthedSocket = Socket & { data: { user?: { id: string; role: string; name: string } } };

const ok = <T>(data: T) => ({ ok: true as const, data });
const fail = (error: string) => ({ ok: false as const, error });

/**
 * Rider shift and attendance events (docs/contracts/rider-shift.md). Same Socket.IO server as RealtimeGateway, which
 * authenticates the socket and sets `client.data.user`. A rider only ever reaches their OWN shifts (the id always comes
 * from the socket, never from the body); staff read one rider's attendance through {@link ShiftService.forStaff}, which
 * applies the role, the tier and the warehouse scope.
 */
@WebSocketGateway({ cors: { origin: true, credentials: true } })
export class ShiftGateway {
  constructor(
    private readonly shifts: ShiftService,
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  private rider(client: AuthedSocket): string {
    limitSocket(client);
    const u = client.data?.user;
    if (!u || u.role !== 'rider') throw new Error('Riders only.');
    return u.id;
  }

  /** The caller as the staff pages see them: role from the socket, warehouse and tier from the database (they can change while connected). */
  private async actor(client: AuthedSocket): Promise<Actor> {
    limitSocket(client);
    const u = client.data?.user;
    if (!u || u.role === 'guest') throw new Error('Sign in to continue.');
    if (u.role.startsWith('admin')) return { id: u.id, role: u.role, name: u.name, hubId: null, tier: null };
    if (u.role !== 'warehouse_staff') throw new Error('Staff only.');
    const row = await this.users.findOne({ where: { id: u.id }, select: ['id', 'hubId', 'warehouseTier', 'active'] });
    if (!row?.hubId || row.active === false) throw new Error('Your account is not linked to a warehouse. Ask an administrator.');
    return { id: u.id, role: u.role, name: u.name, hubId: row.hubId, tier: tierOf(row.warehouseTier) };
  }

  /** `shift:mine`: status, the open shift, the last shift and the last 7 days. */
  @SubscribeMessage('shift:mine')
  async mine(@ConnectedSocket() client: AuthedSocket) {
    try {
      return ok(await this.shifts.mine(this.rider(client)));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  /** `shift:clockIn`: start a shift (already on shift: the same shift comes back). */
  @SubscribeMessage('shift:clockIn')
  async clockIn(@ConnectedSocket() client: AuthedSocket) {
    try {
      return ok(await this.shifts.clockIn(this.rider(client)));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  /** `shift:clockOut`: end the shift (not on shift: nothing happens). */
  @SubscribeMessage('shift:clockOut')
  async clockOut(@ConnectedSocket() client: AuthedSocket) {
    try {
      return ok(await this.shifts.clockOut(this.rider(client)));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  /** `shift:breakStart`: needs an open shift. */
  @SubscribeMessage('shift:breakStart')
  async breakStart(@ConnectedSocket() client: AuthedSocket) {
    try {
      return ok(await this.shifts.startBreak(this.rider(client)));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  /** `shift:breakEnd`: no break running: nothing happens. */
  @SubscribeMessage('shift:breakEnd')
  async breakEnd(@ConnectedSocket() client: AuthedSocket) {
    try {
      return ok(await this.shifts.endBreak(this.rider(client)));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  /** `attendance:rider { riderId }`: one rider's attendance for the staff pages (Operations admins, warehouse supervisors and managers of that rider's warehouse). */
  @SubscribeMessage('attendance:rider')
  async attendance(@ConnectedSocket() client: AuthedSocket, @MessageBody() body: { riderId?: string }) {
    try {
      return ok(await this.shifts.forStaff(await this.actor(client), body?.riderId));
    } catch (e) {
      return fail((e as Error).message);
    }
  }
}
