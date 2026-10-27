import { ConnectedSocket, MessageBody, SubscribeMessage, WebSocketGateway } from '@nestjs/websockets';
import { oneOf } from '../common/validate';
import { sellerContext } from '../sellers/seller-context';
import type { AuthedSocket, SocketUser } from '../sellers/gateway-support';
import { fail, ok, requireUser } from '../sellers/gateway-support';
import { ExchangesService } from './exchanges.service';
import { ReplacementsService } from './replacements.service';

const isOps = (role: string) => role.startsWith('admin') || role === 'warehouse_staff';
const REPLACEMENT_STATUSES = ['requested', 'approved', 'received', 'allocated', 'dispatched', 'delivered', 'rejected'] as const;
const EXCHANGE_STATUSES = ['requested', 'approved', 'received', 'ready', 'dispatched', 'delivered', 'rejected'] as const;

/**
 * Replacements and exchanges on the shared Socket.IO server: the customer asks, the seller approves or rejects (stock
 * is taken from their product, logistics is asked to deliver), the warehouse follows the delivery task.
 * See docs/contracts/after-sale.md.
 */
@WebSocketGateway({ cors: { origin: true, credentials: true } })
export class AfterSaleGateway {
  constructor(
    private readonly replacements: ReplacementsService,
    private readonly exchanges: ExchangesService,
  ) {}

  /** A seller account acts as its store (a team member with the orders permission too); everyone else as themselves. */
  private async viewer(user: SocketUser, write: boolean) {
    if (user.role !== 'seller') return user;
    try {
      return (await sellerContext(user, 'orders', { write })).actor;
    } catch (e) {
      if (write) throw e;
      return user; // a seller without a store still sees what they bought
    }
  }

  // ---- Replacements -------------------------------------------------------
  @SubscribeMessage('replacements:list')
  async replacementsList(@ConnectedSocket() client: AuthedSocket, @MessageBody() body?: { status?: string; limit?: number; offset?: number }) {
    try {
      const user = requireUser(client);
      return ok(await this.replacements.list(await this.viewer(user, false), body ?? {}));
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
      return ok(await this.replacements.get(await this.viewer(user, false), String(body?.id ?? '')));
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

  /** The seller approves or rejects (support may on their behalf). */
  @SubscribeMessage('replacements:respond')
  async replacementsRespond(@ConnectedSocket() client: AuthedSocket, @MessageBody() body: { id: string; approve: boolean; reason?: string }) {
    try {
      const user = requireUser(client);
      if (user.role !== 'seller' && !user.role.startsWith('admin')) return fail('Not allowed.');
      return ok(await this.replacements.respond(await this.viewer(user, true), String(body?.id ?? ''), body?.approve === true, body?.reason));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  @SubscribeMessage('replacements:setStatus')
  async replacementsSetStatus(@ConnectedSocket() client: AuthedSocket, @MessageBody() body: { id: string; status: (typeof REPLACEMENT_STATUSES)[number] }) {
    try {
      const user = requireUser(client);
      if (!isOps(user.role)) return fail('Ops only.');
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
      return ok(await this.exchanges.list(await this.viewer(user, false), body ?? {}));
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
      return ok(await this.exchanges.get(await this.viewer(user, false), String(body?.id ?? '')));
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
      return ok(await this.exchanges.create(user, body));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  @SubscribeMessage('exchanges:respond')
  async exchangesRespond(@ConnectedSocket() client: AuthedSocket, @MessageBody() body: { id: string; approve: boolean; reason?: string }) {
    try {
      const user = requireUser(client);
      if (user.role !== 'seller' && !user.role.startsWith('admin')) return fail('Not allowed.');
      return ok(await this.exchanges.respond(await this.viewer(user, true), String(body?.id ?? ''), body?.approve === true, body?.reason));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  @SubscribeMessage('exchanges:setStatus')
  async exchangesSetStatus(@ConnectedSocket() client: AuthedSocket, @MessageBody() body: { id: string; status: (typeof EXCHANGE_STATUSES)[number] }) {
    try {
      const user = requireUser(client);
      if (!isOps(user.role)) return fail('Ops only.');
      oneOf(body?.status, EXCHANGE_STATUSES, 'Status');
      return ok(await this.exchanges.setStatus(body.id, body.status));
    } catch (e) {
      return fail((e as Error).message);
    }
  }
}
