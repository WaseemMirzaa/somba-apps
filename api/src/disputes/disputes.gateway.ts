import { ConnectedSocket, MessageBody, SubscribeMessage, WebSocketGateway } from '@nestjs/websockets';
import { AuditService } from '../ops/audit.service';
import { sellerContext } from '../sellers/seller-context';
import type { AuthedSocket, SocketUser } from '../sellers/gateway-support';
import { fail, ok, requireUser } from '../sellers/gateway-support';
import { DisputesService } from './disputes.service';

/** Admin roles that may decide a request; refunding also needs finance or the super admin. */
const DECIDERS = ['admin', 'admin_support', 'admin_operations', 'admin_finance'];
const idOf = (b: { id?: string; disputeId?: string } | undefined) => String(b?.id ?? b?.disputeId ?? '');

/**
 * Returns and disputes on the shared Socket.IO server (RealtimeGateway authenticates the socket). Customer opens →
 * seller answers → support decides → warehouse receives and grades → the refund follows. See docs/contracts/after-sale.md.
 */
@WebSocketGateway({ cors: { origin: true, credentials: true } })
export class DisputesGateway {
  constructor(
    private readonly disputes: DisputesService,
    private readonly audit: AuditService,
  ) {}

  /** The seller's store owner identity for a seller account (a team member acts as the store); other roles as they are. */
  private async actor(user: SocketUser, write: boolean) {
    if (user.role !== 'seller') return user;
    return (await sellerContext(user, 'orders', { write })).actor;
  }

  /** A seller who is not (yet) in a store still sees what they bought. */
  private async viewer(user: SocketUser) {
    try {
      return await this.actor(user, false);
    } catch {
      return user;
    }
  }

  @SubscribeMessage('disputes:list')
  async list(@ConnectedSocket() client: AuthedSocket, @MessageBody() body?: { status?: string; type?: string; stage?: string; limit?: number; offset?: number }) {
    try {
      const user = requireUser(client);
      return ok(await this.disputes.list(await this.viewer(user), body ?? {}));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  /** Returns only: `returns:list` is `disputes:list` with the type fixed. */
  @SubscribeMessage('returns:list')
  async returnsList(@ConnectedSocket() client: AuthedSocket, @MessageBody() body?: { status?: string; stage?: string; limit?: number; offset?: number }) {
    return this.list(client, { ...(body ?? {}), type: 'return' });
  }

  @SubscribeMessage('disputes:get')
  async get(@ConnectedSocket() client: AuthedSocket, @MessageBody() body: { id?: string; disputeId?: string }) {
    try {
      const user = requireUser(client);
      return ok(await this.disputes.get(await this.viewer(user), idOf(body)));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  /** What the customer can still return from an order, and whether the window is open. */
  @SubscribeMessage('disputes:eligibility')
  async eligibility(@ConnectedSocket() client: AuthedSocket, @MessageBody() body: { orderId: string }) {
    try {
      const user = requireUser(client);
      if (user.role !== 'customer') return fail('Customers only.');
      return ok(await this.disputes.eligibility(user.id, String(body?.orderId ?? '')));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  @SubscribeMessage('disputes:open')
  async open(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody()
    body: {
      orderId: string;
      type: 'dispute' | 'return';
      reason: string;
      category?: string;
      items?: { itemId?: string; productId?: string; qty?: number }[];
      attachments?: string[];
      refundTo?: string;
    },
  ) {
    try {
      const user = requireUser(client);
      if (user.role !== 'customer') return fail('Customers only.');
      return ok(
        await this.disputes.open(
          { id: user.id, name: user.name },
          { orderId: body?.orderId, type: body?.type, reason: body?.reason, category: body?.category, items: body?.items, attachments: body?.attachments, refundTo: body?.refundTo },
        ),
      );
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  /** A message in the thread: the customer, the seller (a team member with the orders permission) or Somba staff. */
  @SubscribeMessage('disputes:reply')
  async reply(@ConnectedSocket() client: AuthedSocket, @MessageBody() body: { id?: string; disputeId?: string; message?: string; text?: string; attachments?: string[] }) {
    try {
      const user = requireUser(client);
      const who = await this.actor(user, true);
      const asUser = user.role === 'seller' ? { ...who, name: user.name } : user;
      return ok(await this.disputes.reply(asUser, idOf(body), body?.message ?? body?.text, body?.attachments));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  @SubscribeMessage('disputes:escalate')
  async escalate(@ConnectedSocket() client: AuthedSocket, @MessageBody() body: { id?: string; disputeId?: string; note?: string }) {
    try {
      const user = requireUser(client);
      if (user.role !== 'customer') return fail('Customers only.');
      return ok(await this.disputes.escalate(user, idOf(body), body?.note));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  @SubscribeMessage('disputes:cancel')
  async cancel(@ConnectedSocket() client: AuthedSocket, @MessageBody() body: { id?: string; disputeId?: string }) {
    try {
      const user = requireUser(client);
      if (user.role !== 'customer') return fail('Customers only.');
      return ok(await this.disputes.cancel(user, idOf(body)));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  /** The seller says yes or no to a return. */
  @SubscribeMessage('returns:respond')
  async respond(@ConnectedSocket() client: AuthedSocket, @MessageBody() body: { id?: string; disputeId?: string; accept: boolean; reason?: string }) {
    try {
      const user = requireUser(client);
      if (user.role !== 'seller') return fail('Sellers only.');
      const ctx = await sellerContext(user, 'orders');
      return ok(await this.disputes.sellerRespond(ctx.actor, idOf(body), body?.accept === true, body?.reason));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  /** Somba support approves or refuses a return the seller rejected or let lapse. */
  @SubscribeMessage('returns:decide')
  async decideReturn(@ConnectedSocket() client: AuthedSocket, @MessageBody() body: { id?: string; disputeId?: string; approve: boolean; reason?: string }) {
    try {
      const user = requireUser(client);
      if (!DECIDERS.includes(user.role)) return fail('Not allowed.');
      const d = await this.disputes.adminDecideReturn(user, idOf(body), body?.approve === true, body?.reason);
      await this.audit.record({ actor: user.name, role: user.role, action: body?.approve === true ? 'return.approved' : 'return.refused', entity: 'dispute', entityId: d.id, detail: d.reference });
      return ok(d);
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  /** Somba support decides a dispute: refund all or part, a replacement, or a refusal. */
  @SubscribeMessage('disputes:decide')
  async decide(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { id?: string; disputeId?: string; outcome: string; amountUsd?: number; reason?: string; items?: { itemId?: string; qty?: number }[]; refundTo?: string },
  ) {
    try {
      const user = requireUser(client);
      if (!DECIDERS.includes(user.role)) return fail('Not allowed.');
      const d = await this.disputes.decide(
        user,
        idOf(body),
        { outcome: body?.outcome, amountUsd: body?.amountUsd, reason: body?.reason, items: body?.items, refundTo: body?.refundTo },
        user.role === 'admin' || user.role === 'admin_finance',
      );
      await this.audit.record({ actor: user.name, role: user.role, action: `dispute.${body.outcome}`, entity: 'dispute', entityId: d.id, detail: `${d.reference}${d.refundUsd ? ` $${d.refundUsd}` : ''}` });
      return ok(d);
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  @SubscribeMessage('disputes:resolve')
  async resolve(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { disputeId: string; resolution?: string; refund?: boolean; force?: boolean },
  ) {
    try {
      const user = requireUser(client);
      if (!user.role.startsWith('admin')) return fail('Admins only.');
      return ok(
        await this.disputes.resolve(
          body.disputeId,
          { resolution: body.resolution, refund: body.refund, force: body.force === true && user.role === 'admin' },
          user.role === 'admin' || user.role === 'admin_finance',
        ),
      );
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  /** The warehouse confirms returned goods arrived (needed before a refund on a return). */
  @SubscribeMessage('disputes:markReceived')
  async markReceived(@ConnectedSocket() client: AuthedSocket, @MessageBody() body: { disputeId: string; restock?: boolean }) {
    try {
      const user = requireUser(client);
      if (!user.role.startsWith('admin') && user.role !== 'warehouse_staff') return fail('Ops only.');
      const d = await this.disputes.markReceived(String(body?.disputeId ?? ''), body?.restock !== false);
      await this.audit.record({ actor: user.name, role: user.role, action: 'return.received', entity: 'dispute', entityId: d.id, detail: d.reference });
      return ok(d);
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  /** Condition grading of the returned goods; the resellable units go back on the seller's shelf. */
  @SubscribeMessage('returns:grade')
  async grade(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { id?: string; disputeId?: string; grades: { itemId: string; condition: string; restockQty?: number }[]; note?: string },
  ) {
    try {
      const user = requireUser(client);
      if (!user.role.startsWith('admin') && user.role !== 'warehouse_staff') return fail('Ops only.');
      const d = await this.disputes.grade(user, idOf(body), body?.grades, body?.note);
      await this.audit.record({ actor: user.name, role: user.role, action: 'return.graded', entity: 'dispute', entityId: d.id, detail: d.reference });
      return ok(d);
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  @SubscribeMessage('disputes:reject')
  async reject(@ConnectedSocket() client: AuthedSocket, @MessageBody() body: { disputeId: string; resolution?: string }) {
    try {
      const user = requireUser(client);
      if (!user.role.startsWith('admin')) return fail('Admins only.');
      return ok(await this.disputes.reject(body.disputeId, body.resolution));
    } catch (e) {
      return fail((e as Error).message);
    }
  }
}
