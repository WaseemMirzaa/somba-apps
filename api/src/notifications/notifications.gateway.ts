import { ConnectedSocket, MessageBody, SubscribeMessage, WebSocketGateway } from '@nestjs/websockets';
import type { AuthedSocket } from '../sellers/gateway-support';
import { fail, ok, requireUser } from '../sellers/gateway-support';
import { NotificationsService } from './notifications.service';

/**
 * The bell: a user's own notices plus their role's, with read state kept on the server per person (a role-wide notice
 * read by one agent stays unread for the others). See docs/contracts/after-sale.md.
 */
@WebSocketGateway({ cors: { origin: true, credentials: true } })
export class NotificationsGateway {
  constructor(private readonly notifications: NotificationsService) {}

  @SubscribeMessage('notifications:list')
  async list(@ConnectedSocket() client: AuthedSocket) {
    try {
      const user = requireUser(client);
      return ok(await this.notifications.listForUser(user.id, user.role));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  @SubscribeMessage('notifications:markRead')
  async markRead(@ConnectedSocket() client: AuthedSocket, @MessageBody() body: { id: string }) {
    try {
      const user = requireUser(client);
      await this.notifications.markRead(String(body?.id ?? ''), user.id, user.role);
      return ok({ id: body?.id });
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  @SubscribeMessage('notifications:markAllRead')
  async markAllRead(@ConnectedSocket() client: AuthedSocket) {
    try {
      const user = requireUser(client);
      return ok({ count: await this.notifications.markAllRead(user.id, user.role) });
    } catch (e) {
      return fail((e as Error).message);
    }
  }
}
