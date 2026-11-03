import { ConnectedSocket, MessageBody, SubscribeMessage, WebSocketGateway } from '@nestjs/websockets';
import type { AuthedSocket } from '../sellers/gateway-support';
import { fail, ok, requireUser } from '../sellers/gateway-support';
import { FollowsService } from './follows.service';

/**
 * Following stores (customer app). `follows:toggle` flips (or sets, with `following: true|false`) the follow;
 * `follows:state` says whether the caller follows a store and how many followers it has (public, guests may ask);
 * `follows:list` is the "Following" list in the account. Pushes `follows:updated` to the caller's other devices.
 */
@WebSocketGateway({ cors: { origin: true, credentials: true } })
export class FollowsGateway {
  constructor(private readonly follows: FollowsService) {}

  @SubscribeMessage('follows:toggle')
  async toggle(@ConnectedSocket() client: AuthedSocket, @MessageBody() body: { sellerId?: string; following?: boolean }) {
    try {
      const user = requireUser(client);
      const want = typeof body?.following === 'boolean' ? body.following : undefined;
      return ok(await this.follows.toggle(user, body?.sellerId, want));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  @SubscribeMessage('follows:state')
  async state(@ConnectedSocket() client: AuthedSocket, @MessageBody() body: { sellerId?: string }) {
    try {
      const u = client.data?.user;
      return ok(await this.follows.state(u && u.role !== 'guest' ? u.id : null, body?.sellerId));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  @SubscribeMessage('follows:list')
  async list(@ConnectedSocket() client: AuthedSocket, @MessageBody() body: unknown) {
    try {
      return ok(await this.follows.list(requireUser(client).id, body));
    } catch (e) {
      return fail((e as Error).message);
    }
  }
}
