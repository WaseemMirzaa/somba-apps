import { ConnectedSocket, MessageBody, SubscribeMessage, WebSocketGateway } from '@nestjs/websockets';
import { oneOf } from '../common/validate';
import type { AuthedSocket, SocketUser } from '../sellers/gateway-support';
import { fail, ok, requireUser } from '../sellers/gateway-support';
import { StaffTierService } from '../logistics/staff-tier.service';
import { ExchangesService, canMoveExchange } from './exchanges.service';
import type { ExchangeView } from './exchanges.service';
import { inRoleGroup } from '../common/role-groups';
import { AuditService } from '../ops/audit.service';
import { ReplacementsService, canWorkReplacements } from './replacements.service';

const SUPERVISORS_ONLY = 'Only supervisors and managers can see this.';
const REPLACEMENT_STATUSES = ['requested', 'approved', 'received', 'allocated', 'dispatched', 'delivered', 'rejected'] as const;
const EXCHANGE_STATUSES = ['requested', 'approved', 'received', 'ready', 'dispatched', 'delivered', 'rejected'] as const;

/**
 * Replacements and exchanges on the shared Socket.IO server: the customer asks, KOMORIKO support approves or rejects (stock
 * is taken from the seller's product, logistics is asked to deliver), the warehouse follows the delivery task. Sellers take
 * no part (docs/contracts/admin-controls.md). See docs/contracts/after-sale.md.
 */
@WebSocketGateway({ cors: { origin: true, credentials: true } })
export class AfterSaleGateway {
  constructor(
    private readonly replacements: ReplacementsService,
    private readonly exchanges: ExchangesService,
    private readonly tiers: StaffTierService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Every staff action on an exchange is audited (A-03), with the wallet credit it causes: a cheaper item is refunded to
   * the customer's wallet when the exchange is delivered. The customer's own actions are not.
   */
  private async auditExchange(user: SocketUser, action: string, ex: ExchangeView): Promise<void> {
    if (user.role === 'customer' || user.role === 'seller' || ex.customerId === user.id) return;
    const diff = Number(ex.priceDiffUsd) || 0;
    const money =
      diff < 0
        ? ` · $${Math.abs(diff).toFixed(2)} refunded to the customer's wallet${action === 'exchange.delivered' ? '' : ' on delivery'}`
        : diff > 0
          ? ` · price difference $${diff.toFixed(2)}`
          : '';
    await this.audit.record({ actor: user.name, role: user.role, action, entity: 'exchange', entityId: ex.id, detail: `${ex.reference ?? ''} · ${ex.orderReference ?? ''}${money}` });
  }

  /**
   * Warehouse staff reach replacements and exchanges through the supervisor pages only, so an operator is refused here
   * (same tier as `WAREHOUSE_ROUTES` in the web). Sellers, customers and admins are not affected.
   */
  private async staffBelowSupervisor(user: SocketUser): Promise<boolean> {
    return user.role === 'warehouse_staff' && !(await this.tiers.allows(user, 'oversee'));
  }

  /**
   * Replacements and exchanges are read by the admin roles that decide them (super admin, operations, support: group
   * `exchangeDecide`); marketing, finance and moderation are refused. Null for everyone else (the service scopes sellers and customers).
   */
  private adminRefusal(user: SocketUser): string | null {
    return user.role.startsWith('admin') && !inRoleGroup(user.role, 'exchangeDecide') ? 'Not allowed.' : null;
  }

  /** Everyone acts as themselves: a seller who shops sees only what they bought (sellers take no part in after-sale). */
  private viewer(user: SocketUser) {
    return user;
  }

  // ---- Replacements -------------------------------------------------------
  @SubscribeMessage('replacements:list')
  async replacementsList(@ConnectedSocket() client: AuthedSocket, @MessageBody() body?: { status?: string; limit?: number; offset?: number }) {
    try {
      const user = requireUser(client);
      const refusal = this.adminRefusal(user);
      if (refusal) return fail(refusal);
      if (await this.staffBelowSupervisor(user)) return fail(SUPERVISORS_ONLY);
      return ok(await this.replacements.list(this.viewer(user), body ?? {}));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  /** The customer's own requests (the status screen). */
  @SubscribeMessage('replacements:mine')
  async replacementsMine(@ConnectedSocket() client: AuthedSocket, @MessageBody() body?: { status?: string; limit?: number; offset?: number }) {
    try {
      return ok(await this.replacements.mine(requireUser(client).id, body ?? {}));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  @SubscribeMessage('replacements:get')
  async replacementsGet(@ConnectedSocket() client: AuthedSocket, @MessageBody() body: { id: string }) {
    try {
      const user = requireUser(client);
      const refusal = this.adminRefusal(user);
      if (refusal) return fail(refusal);
      if (await this.staffBelowSupervisor(user)) return fail(SUPERVISORS_ONLY);
      return ok(await this.replacements.get(this.viewer(user), String(body?.id ?? '')));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  @SubscribeMessage('replacements:create')
  async replacementsCreate(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { orderId: string; itemId?: string; sku?: string; productName?: string; reason?: string; condition?: string; qty?: number; attachments?: string[] },
  ) {
    try {
      const user = requireUser(client);
      return ok(await this.replacements.create(user, body));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  /** Support approves or rejects (the first decision on every replacement). */
  @SubscribeMessage('replacements:respond')
  async replacementsRespond(@ConnectedSocket() client: AuthedSocket, @MessageBody() body: { id: string; approve: boolean; reason?: string }) {
    try {
      const user = requireUser(client);
      // Support / operations / the super admin (group `exchangeDecide`); sellers and the other admin departments are refused.
      if (!inRoleGroup(user.role, 'exchangeDecide')) return fail('Not allowed.');
      return ok(await this.replacements.respond(this.viewer(user), String(body?.id ?? ''), body?.approve === true, body?.reason));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  @SubscribeMessage('replacements:setStatus')
  async replacementsSetStatus(@ConnectedSocket() client: AuthedSocket, @MessageBody() body: { id: string; status: (typeof REPLACEMENT_STATUSES)[number] }) {
    try {
      const user = requireUser(client);
      // Like an exchange: the exchange desk and warehouse supervisors move a replacement; no other admin department.
      if (!canWorkReplacements(user.role)) return fail('Ops only.');
      if (await this.staffBelowSupervisor(user)) return fail('Only supervisors and managers can do this.');
      oneOf(body?.status, REPLACEMENT_STATUSES, 'Status');
      return ok(await this.replacements.setStatus(body.id, body.status));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  // ---- Exchanges ----------------------------------------------------------
  @SubscribeMessage('exchanges:list')
  async exchangesList(@ConnectedSocket() client: AuthedSocket, @MessageBody() body?: { status?: string; limit?: number; offset?: number }) {
    try {
      const user = requireUser(client);
      const refusal = this.adminRefusal(user);
      if (refusal) return fail(refusal);
      if (await this.staffBelowSupervisor(user)) return fail(SUPERVISORS_ONLY);
      return ok(await this.exchanges.list(this.viewer(user), body ?? {}));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  @SubscribeMessage('exchanges:mine')
  async exchangesMine(@ConnectedSocket() client: AuthedSocket, @MessageBody() body?: { status?: string; limit?: number; offset?: number }) {
    try {
      return ok(await this.exchanges.mine(requireUser(client).id, body ?? {}));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  @SubscribeMessage('exchanges:get')
  async exchangesGet(@ConnectedSocket() client: AuthedSocket, @MessageBody() body: { id: string }) {
    try {
      const user = requireUser(client);
      const refusal = this.adminRefusal(user);
      if (refusal) return fail(refusal);
      if (await this.staffBelowSupervisor(user)) return fail(SUPERVISORS_ONLY);
      return ok(await this.exchanges.get(this.viewer(user), String(body?.id ?? '')));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  @SubscribeMessage('exchanges:create')
  async exchangesCreate(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody()
    body: { orderId: string; itemId?: string; fromSku?: string; fromName?: string; toSku: string; toName: string; toVariant?: string; qty?: number; priceDiffUsd?: number; reason?: string; attachments?: string[] },
  ) {
    try {
      const user = requireUser(client);
      const ex = await this.exchanges.create(user, body);
      await this.auditExchange(user, 'exchange.create', ex);
      return ok(ex);
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  @SubscribeMessage('exchanges:respond')
  async exchangesRespond(@ConnectedSocket() client: AuthedSocket, @MessageBody() body: { id: string; approve: boolean; reason?: string }) {
    try {
      const user = requireUser(client);
      // A-03/A-07: support, operations or the super admin decide (group `exchangeDecide`), whatever the price difference; sellers and the other admin departments are refused.
      if (!inRoleGroup(user.role, 'exchangeDecide')) return fail('Not allowed.');
      const ex = await this.exchanges.respond(this.viewer(user), String(body?.id ?? ''), body?.approve === true, body?.reason);
      await this.auditExchange(user, ex.status === 'rejected' ? 'exchange.rejected' : 'exchange.approved', ex);
      return ok(ex);
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  @SubscribeMessage('exchanges:setStatus')
  async exchangesSetStatus(@ConnectedSocket() client: AuthedSocket, @MessageBody() body: { id: string; status: (typeof EXCHANGE_STATUSES)[number] }) {
    try {
      const user = requireUser(client);
      // A-03: delivery credits a cheaper item's difference to the wallet, so only the exchange desk and warehouse supervisors.
      if (!canMoveExchange(user.role)) return fail('Ops only.');
      if (await this.staffBelowSupervisor(user)) return fail('Only supervisors and managers can do this.');
      oneOf(body?.status, EXCHANGE_STATUSES, 'Status');
      const ex = await this.exchanges.setStatus(String(body.id ?? ''), body.status, user);
      await this.auditExchange(user, `exchange.${ex.status}`, ex);
      return ok(ex);
    } catch (e) {
      return fail((e as Error).message);
    }
  }
}
