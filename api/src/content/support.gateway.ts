import { ConnectedSocket, MessageBody, SubscribeMessage, WebSocketGateway } from '@nestjs/websockets';
import type { AuthedSocket } from '../sellers/gateway-support';
import { fail, ok, requireUser } from '../sellers/gateway-support';
import { SupportService } from './support.service';
import type { TicketStatus } from '../database/entities';

/**
 * Support tickets on the shared Socket.IO server: every signed-in role (customer, seller, rider…) can open one,
 * with an order link, a category and photos; agents (admin roles) answer, assign and close. See docs/contracts/after-sale.md.
 */
@WebSocketGateway({ cors: { origin: true, credentials: true } })
export class SupportGateway {
  constructor(private readonly support: SupportService) {}

  @SubscribeMessage('support:list')
  async list(@ConnectedSocket() client: AuthedSocket, @MessageBody() body?: { status?: string; assignee?: string; limit?: number; offset?: number }) {
    try {
      return ok(await this.support.list(requireUser(client), body ?? {}));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  @SubscribeMessage('support:get')
  async get(@ConnectedSocket() client: AuthedSocket, @MessageBody() body: { id: string }) {
    try {
      return ok(await this.support.get(requireUser(client), String(body?.id ?? '')));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  @SubscribeMessage('support:open')
  async open(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { subject: string; category?: string; message: string; orderId?: string; attachments?: string[] },
  ) {
    try {
      const user = requireUser(client);
      return ok(await this.support.open({ id: user.id, name: user.name, role: user.role }, body));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  @SubscribeMessage('support:reply')
  async reply(@ConnectedSocket() client: AuthedSocket, @MessageBody() body: { id: string; text?: string; attachments?: string[] }) {
    try {
      const user = requireUser(client);
      return ok(await this.support.reply(body.id, { id: user.id, name: user.name, role: user.role }, body.text ?? '', body.attachments));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  @SubscribeMessage('support:setStatus')
  async setStatus(@ConnectedSocket() client: AuthedSocket, @MessageBody() body: { id: string; status: TicketStatus }) {
    try {
      const user = requireUser(client);
      if (!user.role.startsWith('admin')) return fail('Not allowed.');
      return ok(await this.support.setStatus(body.id, body.status));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  /** The reader opened the conversation: its unread counter goes to zero. */
  @SubscribeMessage('support:markRead')
  async markRead(@ConnectedSocket() client: AuthedSocket, @MessageBody() body: { id: string }) {
    try {
      return ok(await this.support.markRead(requireUser(client), String(body?.id ?? '')));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  /** Agents: hand a ticket to an admin account (`assigneeId` null = back to the queue). */
  @SubscribeMessage('support:assign')
  async assign(@ConnectedSocket() client: AuthedSocket, @MessageBody() body: { id: string; assigneeId?: string | null }) {
    try {
      const user = requireUser(client);
      if (!user.role.startsWith('admin')) return fail('Not allowed.');
      return ok(await this.support.assign(user, String(body?.id ?? ''), body?.assigneeId ? String(body.assigneeId) : null));
    } catch (e) {
      return fail((e as Error).message);
    }
  }
}
