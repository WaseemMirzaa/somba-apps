import { ConnectedSocket, MessageBody, SubscribeMessage, WebSocketGateway } from '@nestjs/websockets';
import type { Socket } from 'socket.io';
import { limitSocket } from '../common/socket-limit';
import { sellerContext } from '../sellers/seller-context';
import { InventoryService } from './inventory.service';

type AuthedSocket = Socket & { data: { user?: { id: string; role: string; name?: string } } };

const ok = <T>(data: T) => ({ ok: true as const, data });
const fail = (error: string) => ({ ok: false as const, error });

/**
 * Inventory events on the same Socket.IO server as RealtimeGateway (which authenticates the socket on connect and
 * puts the user on `client.data.user`). Sellers act on their own products, admins on any.
 */
@WebSocketGateway({ cors: { origin: true, credentials: true } })
export class InventoryGateway {
  constructor(private readonly inventory: InventoryService) {}

  /**
   * Who is acting: an admin as themselves; a seller account (the owner or a team member whose role allows `permission`)
   * as the store OWNER (services key stock by the owner's account), remembering who really clicked.
   */
  private async actor(client: AuthedSocket, permission: 'catalog' | 'catalog_read', write = true): Promise<{ user: { id: string; role: string }; by: string }> {
    limitSocket(client);
    const u = client.data?.user;
    if (!u || u.role === 'guest') throw new Error('Sign in to continue.');
    if (u.role.startsWith('admin')) return { user: u, by: u.id };
    if (u.role !== 'seller') throw new Error('Sellers only.');
    const ctx = await sellerContext({ id: u.id, role: u.role, name: u.name ?? '' }, permission, { write });
    return { user: ctx.actor, by: ctx.user.id };
  }

  /** Add or remove units: `{ productId, variant?, delta, reason?, note? }`. Never an absolute value. */
  @SubscribeMessage('inventory:adjust')
  async adjust(@ConnectedSocket() client: AuthedSocket, @MessageBody() body: Record<string, unknown>) {
    try {
      const { user, by } = await this.actor(client, 'catalog');
      return ok(await this.inventory.adjust(user, body ?? {}, by));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  /** The ledger of one product: `{ productId, limit?, offset? }`. */
  @SubscribeMessage('inventory:movements')
  async movements(@ConnectedSocket() client: AuthedSocket, @MessageBody() body: Record<string, unknown>) {
    try {
      return ok(await this.inventory.movements((await this.actor(client, 'catalog_read', false)).user, body ?? {}));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  /** The store's low-stock line: no body reads it; `{ lowStockThreshold }` sets it. */
  @SubscribeMessage('inventory:settings')
  async settings(@ConnectedSocket() client: AuthedSocket, @MessageBody() body?: Record<string, unknown>) {
    try {
      // Reading the line needs to see the catalog; changing it needs to manage it.
      const writes = body?.lowStockThreshold !== undefined;
      return ok(await this.inventory.settings((await this.actor(client, writes ? 'catalog' : 'catalog_read', writes)).user, body ?? undefined));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  /** Products with stock, per-option stock, reserved units and low / out flags. */
  @SubscribeMessage('inventory:overview')
  async overview(@ConnectedSocket() client: AuthedSocket, @MessageBody() body?: Record<string, unknown>) {
    try {
      return ok(await this.inventory.overview((await this.actor(client, 'catalog_read', false)).user, body ?? {}));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  /** Can this cart be bought? `{ lines?: [{ productId, variant?, qty }] }` (the saved cart when omitted). */
  @SubscribeMessage('cart:validate')
  async validateCart(@ConnectedSocket() client: AuthedSocket, @MessageBody() body?: { lines?: unknown }) {
    try {
      limitSocket(client);
      const u = client.data?.user;
      if (!u || u.role === 'guest') throw new Error('Sign in to continue.');
      return ok(await this.inventory.validateCart(u.id, body?.lines));
    } catch (e) {
      return fail((e as Error).message);
    }
  }
}
