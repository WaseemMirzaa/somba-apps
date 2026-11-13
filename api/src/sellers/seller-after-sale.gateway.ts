import { ConnectedSocket, MessageBody, SubscribeMessage, WebSocketGateway } from '@nestjs/websockets';
import { inRoleGroup } from '../common/role-groups';
import { AuditService } from '../ops/audit.service';
import { AfterSaleAccessService } from './after-sale-access.service';
import { AFTER_SALE_KEYS } from './after-sale-access';
import { CaseThreadService } from './case-thread.service';
import { fail, ok, requireUser } from './gateway-support';
import type { AuthedSocket } from './gateway-support';

/**
 * The seller portal's read-only after-sale sections: who switches them (defaults and per-store overrides) and the private seller <->
 * support thread per case. Reading the cases themselves stays on the existing `returns:*`, `exchanges:*`, `replacements:*` events
 * (the store gets its redacted view there while its section is on). docs/contracts/admin-controls.md §13.
 */
@WebSocketGateway({ cors: { origin: true, credentials: true } })
export class SellerAfterSaleGateway {
  constructor(
    private readonly access: AfterSaleAccessService,
    private readonly threads: CaseThreadService,
    private readonly audit: AuditService,
  ) {}

  private manager(client: AuthedSocket) {
    const user = requireUser(client);
    if (!inRoleGroup(user.role, 'sellerAfterSaleManage')) throw new Error('Not allowed.');
    return user;
  }

  /** The four platform defaults `{ returns, exchanges, replacements, express }` (managers only). */
  @SubscribeMessage('sellerAccess:defaults:get')
  async getDefaults(@ConnectedSocket() client: AuthedSocket) {
    try {
      this.manager(client);
      return ok(await this.access.defaults());
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  /** `{ returns?, exchanges?, replacements?, express? }` (booleans): the defaults; stores that follow them update live. */
  @SubscribeMessage('sellerAccess:defaults:set')
  async setDefaults(@ConnectedSocket() client: AuthedSocket, @MessageBody() body: Record<string, unknown>) {
    try {
      const user = this.manager(client);
      const { defaults, changed } = await this.access.setDefaults(body);
      if (changed.length) {
        await this.audit.record({ actor: user.name, role: user.role, action: 'seller.after_sale_defaults', entity: 'setting', entityId: 'sellerView', detail: changed.map((k) => `${k} ${defaults[k] ? 'on' : 'off'}`).join(', ') });
      }
      return ok(defaults);
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  /** `{ sellerId, returns?, exchanges?, replacements?, express? }`, each true | false | null (null = follow the default). Returns the store as staff see it. */
  @SubscribeMessage('sellers:setAfterSaleAccess')
  async setStoreAccess(@ConnectedSocket() client: AuthedSocket, @MessageBody() body: Record<string, unknown>) {
    try {
      const user = this.manager(client);
      const r = await this.access.setStoreAccess(body);
      const changed = AFTER_SALE_KEYS.filter((k) => r.before[k] !== r.after[k]);
      if (changed.length) {
        await this.audit.record({ actor: user.name, role: user.role, action: 'seller.after_sale_access', entity: 'seller', entityId: r.seller.id, detail: `${r.seller.name}: ${changed.map((k) => `${k} ${r.after[k] ? 'on' : 'off'}`).join(', ')}` });
      }
      return ok(r.store);
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  @SubscribeMessage('caseThread:list')
  async list(@ConnectedSocket() client: AuthedSocket, @MessageBody() body: { kind?: string; caseId?: string }) {
    try {
      return ok(await this.threads.list(requireUser(client), body));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  /** `{ kind, caseId }`: the customer <-> support conversation of one of the store's cases, read-only, when admin shares it. */
  @SubscribeMessage('caseThread:customer')
  async customer(@ConnectedSocket() client: AuthedSocket, @MessageBody() body: { kind?: string; caseId?: string }) {
    try {
      return ok(await this.threads.customerConversation(requireUser(client), body));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  @SubscribeMessage('caseThread:send')
  async send(@ConnectedSocket() client: AuthedSocket, @MessageBody() body: { kind?: string; caseId?: string; text?: string }) {
    try {
      return ok(await this.threads.send(requireUser(client), body));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  @SubscribeMessage('caseThread:markRead')
  async markRead(@ConnectedSocket() client: AuthedSocket, @MessageBody() body: { kind?: string; caseId?: string }) {
    try {
      return ok(await this.threads.markRead(requireUser(client), body));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  @SubscribeMessage('caseThread:unread')
  async unread(@ConnectedSocket() client: AuthedSocket) {
    try {
      return ok(await this.threads.unread(requireUser(client)));
    } catch (e) {
      return fail((e as Error).message);
    }
  }
}
