import { ConnectedSocket, MessageBody, SubscribeMessage, WebSocketGateway } from '@nestjs/websockets';
import type { Socket } from 'socket.io';
import { CartService } from './cart.service';

type AuthedSocket = Socket & { data: { user?: { id: string; role: string } } };

const ok = <T>(data: T) => ({ ok: true as const, data });
const fail = (error: string) => ({ ok: false as const, error });

/**
 * Cart events on the same Socket.IO server as RealtimeGateway (which authenticates the socket on connect and
 * puts the user on `client.data.user`). Customers only.
 */
@WebSocketGateway({ cors: { origin: true, credentials: true } })
export class CartGateway {
  constructor(private readonly cart: CartService) {}

  private customer(client: AuthedSocket) {
    const u = client.data?.user;
    if (!u || u.role === 'guest') throw new Error('Sign in to continue.');
    if (u.role !== 'customer') throw new Error('Only customer accounts have a cart.');
    return u;
  }

  @SubscribeMessage('cart:get')
  async get(@ConnectedSocket() client: AuthedSocket) {
    try {
      return ok(await this.cart.get(this.customer(client).id));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  @SubscribeMessage('cart:set')
  async set(@ConnectedSocket() client: AuthedSocket, @MessageBody() body: { lines?: unknown; saved?: unknown }) {
    try {
      return ok(await this.cart.set(this.customer(client).id, body ?? {}));
    } catch (e) {
      return fail((e as Error).message);
    }
  }
}
