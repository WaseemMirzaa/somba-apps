import { ConnectedSocket, MessageBody, SubscribeMessage, WebSocketGateway } from '@nestjs/websockets';
import { SellerContextService } from './seller-context';
import { TeamService } from './team.service';
import { fail, ok, requireUser } from './gateway-support';
import type { AuthedSocket } from './gateway-support';

/** Admin roles that may look at any store's team (read only). */
const TEAM_READERS = ['admin', 'admin_operations', 'admin_moderation', 'admin_support'];

/**
 * Seller team accounts (docs/contracts/seller-platform.md). Same Socket.IO server as RealtimeGateway, which
 * authenticates the handshake. The owner manages the team; every member can read their own seat (`team:me`) and leave.
 */
@WebSocketGateway({ cors: { origin: true, credentials: true } })
export class TeamGateway {
  constructor(
    private readonly ctx: SellerContextService,
    private readonly team: TeamService,
  ) {}

  /**
   * The owner's view of the team: owner + staff with their status, and the seats the plan allows. Admins (operations,
   * moderation, support) may read any store's team with `{ sellerId }`.
   */
  @SubscribeMessage('team:list')
  async list(@ConnectedSocket() client: AuthedSocket, @MessageBody() body?: { sellerId?: string }) {
    try {
      const user = requireUser(client);
      if (TEAM_READERS.includes(user.role)) {
        return ok(await this.team.listOf(String(body?.sellerId ?? '')));
      }
      const ctx = await this.ctx.resolve(user, 'team', { write: false });
      return ok(await this.team.list(ctx));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  /** Invite by e-mail: `{ email, role: manager|catalog|orders|finance|support, name? }`. */
  @SubscribeMessage('team:invite')
  async invite(@ConnectedSocket() client: AuthedSocket, @MessageBody() body: { email?: string; role?: string; name?: string }) {
    try {
      const ctx = await this.ctx.resolve(requireUser(client), 'team');
      return ok(await this.team.invite(ctx, body ?? {}));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  /** The invitee, signed in with the invited address, takes the seat: `{ token }`. */
  @SubscribeMessage('team:accept')
  async accept(@ConnectedSocket() client: AuthedSocket, @MessageBody() body: { token?: string }) {
    try {
      return ok(await this.team.accept(requireUser(client), body?.token));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  @SubscribeMessage('team:setRole')
  async setRole(@ConnectedSocket() client: AuthedSocket, @MessageBody() body: { memberId?: string; role?: string }) {
    try {
      const ctx = await this.ctx.resolve(requireUser(client), 'team');
      return ok(await this.team.setRole(ctx, body ?? {}));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  @SubscribeMessage('team:remove')
  async remove(@ConnectedSocket() client: AuthedSocket, @MessageBody() body: { memberId?: string }) {
    try {
      const ctx = await this.ctx.resolve(requireUser(client), 'team');
      return ok(await this.team.remove(ctx, body ?? {}));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  /** A staff member leaves the team by themselves. */
  @SubscribeMessage('team:leave')
  async leave(@ConnectedSocket() client: AuthedSocket) {
    try {
      return ok(await this.team.leave(requireUser(client)));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  /** My seat: the store, my role and what it allows (for the portal to hide what the role cannot do). */
  @SubscribeMessage('team:me')
  async me(@ConnectedSocket() client: AuthedSocket) {
    try {
      const ctx = await this.ctx.resolve(requireUser(client), 'any', { write: false });
      return ok(this.team.me(ctx));
    } catch (e) {
      return fail((e as Error).message);
    }
  }
}
