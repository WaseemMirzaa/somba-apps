import { ConnectedSocket, MessageBody, SubscribeMessage, WebSocketGateway } from '@nestjs/websockets';
import { inRoleGroup } from '../common/role-groups';
import { AuditService } from '../ops/audit.service';
import { SellerContextService } from './seller-context';
import { SellerPolicyService } from './policy.service';
import { StorefrontService } from './storefront.service';
import { fail, ok, requireUser } from './gateway-support';
import type { AuthedSocket } from './gateway-support';

/**
 * What KOMORIKO admin controls for stores (docs/contracts/admin-controls.md): the express switch and the approval of store
 * policies, plus the policy template and the proposal status the seller portal reads. Same Socket.IO server as RealtimeGateway.
 */
@WebSocketGateway({ cors: { origin: true, credentials: true } })
export class AdminControlsGateway {
  constructor(
    private readonly ctx: SellerContextService,
    private readonly storefront: StorefrontService,
    private readonly policies: SellerPolicyService,
    private readonly audit: AuditService,
  ) {}

  /** The signed-in account when it is in the admin group that approves policies; else the refusal. */
  private policyAdmin(client: AuthedSocket) {
    const user = requireUser(client);
    if (!inRoleGroup(user.role, 'storePolicy')) throw new Error('Not allowed.');
    return user;
  }

  // ── Express ──────────────────────────────────────────────────────────────

  /** Admin / operations: `{ sellerId, enabled }`. Turning it on needs the store's pickup pin. Returns the store as the admin sees it. */
  @SubscribeMessage('sellers:setExpress')
  async setExpress(@ConnectedSocket() client: AuthedSocket, @MessageBody() body: { sellerId?: string; id?: string; enabled?: boolean }) {
    try {
      const user = requireUser(client);
      if (!inRoleGroup(user.role, 'logisticsDesk')) return fail('Not allowed.');
      const seller = await this.storefront.setExpress(body?.sellerId ?? body?.id, body?.enabled);
      await this.audit.record({ actor: user.name, role: user.role, action: body?.enabled ? 'seller.express_on' : 'seller.express_off', entity: 'seller', entityId: seller.id, detail: seller.name });
      return ok(seller);
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  // ── Policies: the seller's side ──────────────────────────────────────────

  /** The returns-policy template in both languages: `{ returnsPolicy: { en, fr }, returnWindowDays }`. Any store member who may edit the storefront. */
  @SubscribeMessage('sellers:policy:template')
  async template(@ConnectedSocket() client: AuthedSocket) {
    try {
      await this.ctx.resolve(requireUser(client), 'storefront', { write: false });
      return ok(await this.policies.template());
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  /** `{ pending, lastDecided }`: the store's proposal waiting for approval, and the last one an admin decided (with its note). */
  @SubscribeMessage('sellers:policy:mine')
  async mine(@ConnectedSocket() client: AuthedSocket) {
    try {
      return ok(await this.policies.mine(await this.ctx.resolve(requireUser(client), 'storefront', { write: false })));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  // ── Policies: the admin's side ───────────────────────────────────────────

  /** `{ status?: 'pending'|'approved'|'rejected'|'all' (default pending), sellerId?, limit?, offset? }`: the queue, each row with the live text beside the proposal. */
  @SubscribeMessage('sellers:policy:list')
  async list(@ConnectedSocket() client: AuthedSocket, @MessageBody() body: Record<string, unknown>) {
    try {
      this.policyAdmin(client);
      return ok(await this.policies.list(body ?? {}));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  /** `{ id, note? }`: the proposal goes live (translated like any live write); the seller is told. */
  @SubscribeMessage('sellers:policy:approve')
  async approve(@ConnectedSocket() client: AuthedSocket, @MessageBody() body: { id?: string; note?: string }) {
    try {
      const user = this.policyAdmin(client);
      const row = await this.policies.approve(user, body?.id, body?.note);
      await this.audit.record({ actor: user.name, role: user.role, action: 'seller.policy_approved', entity: 'seller', entityId: row.sellerId, detail: row.storeName });
      return ok(row);
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  /** `{ id, note }`: the note (at least 5 characters) tells the seller why; the live text is untouched. */
  @SubscribeMessage('sellers:policy:reject')
  async reject(@ConnectedSocket() client: AuthedSocket, @MessageBody() body: { id?: string; note?: string }) {
    try {
      const user = this.policyAdmin(client);
      const row = await this.policies.reject(user, body?.id, body?.note);
      await this.audit.record({ actor: user.name, role: user.role, action: 'seller.policy_rejected', entity: 'seller', entityId: row.sellerId, detail: row.storeName });
      return ok(row);
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  /**
   * `{ sellerId, returnsPolicy?, returnsPolicyFr?, shippingPolicy?, shippingPolicyFr?, revisionId?, note? }`: edit and publish any
   * store's policy directly (it goes live now). `revisionId` is the pending proposal the admin edited (it is approved).
   */
  @SubscribeMessage('sellers:policy:publish')
  async publish(@ConnectedSocket() client: AuthedSocket, @MessageBody() body: Record<string, unknown>) {
    try {
      const user = this.policyAdmin(client);
      const row = await this.policies.publish(user, body ?? {});
      await this.audit.record({ actor: user.name, role: user.role, action: 'seller.policy_published', entity: 'seller', entityId: row.sellerId, detail: row.storeName });
      return ok(row);
    } catch (e) {
      return fail((e as Error).message);
    }
  }
}
