import { ConnectedSocket, MessageBody, SubscribeMessage, WebSocketGateway } from '@nestjs/websockets';
import { AuditService } from '../ops/audit.service';
import type { AuthedSocket, SocketUser } from '../sellers/gateway-support';
import { fail, ok, requireUser } from '../sellers/gateway-support';
import { StaffTierService } from '../logistics/staff-tier.service';
import { RETURNS_DESK_ADMINS } from '../common/staff-access';
import { ROLE_GROUPS, inRoleGroup } from '../common/role-groups';
import { DisputesService } from './disputes.service';

/** Admin roles that work the returns and disputes queue and may decide a request; refunding also needs finance or the super admin. */
const DECIDERS: readonly string[] = ROLE_GROUPS.disputeDesk;
const idOf = (b: { id?: string; disputeId?: string } | undefined) => String(b?.id ?? b?.disputeId ?? '');

/**
 * Returns and disputes on the shared Socket.IO server (RealtimeGateway authenticates the socket). Customer opens →
 * support decides → warehouse receives and grades → the refund follows. Sellers take no part (docs/contracts/admin-controls.md).
 * See docs/contracts/after-sale.md.
 */
@WebSocketGateway({ cors: { origin: true, credentials: true } })
export class DisputesGateway {
  constructor(
    private readonly disputes: DisputesService,
    private readonly audit: AuditService,
    private readonly tiers: StaffTierService,
  ) {}

  /** An admin role outside the returns and disputes desk (marketing, moderation) is refused; null for everyone else (the service scopes the rest). */
  private adminRefusal(user: SocketUser): string | null {
    return user.role.startsWith('admin') && !inRoleGroup(user.role, 'disputeDesk') ? 'Not allowed.' : null;
  }

  /** Warehouse staff carry their warehouse (they see its returns only); everyone else is themselves (a seller who shops sees their own purchases). */
  private async viewer(user: SocketUser) {
    if (user.role === 'warehouse_staff') return { ...user, hubId: await this.tiers.hubOf(user) };
    return user;
  }

  /**
   * The returns desk (receive and grade returned goods): the Super Admin and Operations, or a supervisor or manager of the
   * warehouse the return belongs to. Support decides returns but never handles the goods; the other admin roles have no part.
   * Null when allowed, else the refusal.
   */
  private async deskRefusal(user: SocketUser): Promise<string | null> {
    if (user.role === 'warehouse_staff') return (await this.tiers.allows(user, 'oversee')) ? null : 'Only supervisors and managers can do this.';
    if (user.role.startsWith('admin')) return RETURNS_DESK_ADMINS.includes(user.role) ? null : 'Not allowed.';
    return 'Ops only.';
  }

  @SubscribeMessage('disputes:list')
  async list(@ConnectedSocket() client: AuthedSocket, @MessageBody() body?: { status?: string; type?: string; stage?: string; limit?: number; offset?: number }) {
    try {
      const user = requireUser(client);
      const refusal = this.adminRefusal(user);
      if (refusal) return fail(refusal);
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
      const refusal = this.adminRefusal(user);
      if (refusal) return fail(refusal);
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

  /** A message in the thread: the customer or KOMORIKO staff. */
  @SubscribeMessage('disputes:reply')
  async reply(@ConnectedSocket() client: AuthedSocket, @MessageBody() body: { id?: string; disputeId?: string; message?: string; text?: string; attachments?: string[] }) {
    try {
      const user = requireUser(client);
      const refusal = this.adminRefusal(user);
      if (refusal) return fail(refusal);
      return ok(await this.disputes.reply(user, idOf(body), body?.message ?? body?.text, body?.attachments));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  /** Retired: a request is with KOMORIKO support from the start, so there is nothing to escalate. Answered (not ignored) so an old app build does not wait. */
  @SubscribeMessage('disputes:escalate')
  async escalate(@ConnectedSocket() client: AuthedSocket) {
    try {
      requireUser(client);
      return fail('Your request is already with KOMORIKO support.');
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

  /** Retired: sellers no longer answer returns; support decides with `returns:decide`. Answered (not ignored) so an old client does not wait. */
  @SubscribeMessage('returns:respond')
  async respond(@ConnectedSocket() client: AuthedSocket) {
    try {
      requireUser(client);
      return fail('Returns are decided by KOMORIKO support.');
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  /** KOMORIKO support approves or refuses a return that is still undecided (the first decision on every return). */
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

  /** KOMORIKO support decides a dispute: refund all or part, a replacement, or a refusal. */
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
      if (!DECIDERS.includes(user.role)) return fail('Not allowed.');
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
      // The returns queue is a supervisor page in the web; receiving starts the refund, so the server holds the same line.
      const refusal = await this.deskRefusal(user);
      if (refusal) return fail(refusal);
      const d = await this.disputes.markReceived(String(body?.disputeId ?? ''), body?.restock !== false, await this.viewer(user));
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
      const refusal = await this.deskRefusal(user);
      if (refusal) return fail(refusal);
      const d = await this.disputes.grade(await this.viewer(user), idOf(body), body?.grades, body?.note);
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
      if (!DECIDERS.includes(user.role)) return fail('Not allowed.');
      const d = await this.disputes.reject(body.disputeId, body.resolution);
      await this.audit.record({ actor: user.name, role: user.role, action: 'dispute.rejected', entity: 'dispute', entityId: d.id, detail: d.reference });
      return ok(d);
    } catch (e) {
      return fail((e as Error).message);
    }
  }
}
