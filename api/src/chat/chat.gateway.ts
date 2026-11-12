import { ConnectedSocket, MessageBody, SubscribeMessage, WebSocketGateway } from '@nestjs/websockets';
import { fail, ok, requireUser } from '../sellers/gateway-support';
import type { AuthedSocket } from '../sellers/gateway-support';
import { ChatService } from './chat.service';

/**
 * Customer <-> seller chat is CLOSED (docs/contracts/admin-controls.md): `chat:start` and `chat:send` answer with
 * "Messaging sellers is closed. Contact support from your account." Existing conversations stay stored: a customer
 * reads their own (`chat:list`, `chat:messages`), support and the super admin read every one read-only
 * (`chat:adminList`, `chat:adminMessages`). Same Socket.IO server as RealtimeGateway, which authenticates the handshake.
 */
@WebSocketGateway({ cors: { origin: true, credentials: true } })
export class ChatGateway {
  constructor(private readonly chat: ChatService) {}

  /** Closed: always answers `{ ok: false, error: 'Messaging sellers is closed. Contact support from your account.' }`. */
  @SubscribeMessage('chat:start')
  async start(@ConnectedSocket() client: AuthedSocket, @MessageBody() body: Record<string, unknown>) {
    try {
      return ok(await this.chat.start(requireUser(client), body ?? {}));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  /** `{ limit?, offset? }`: the customer's own conversations (history; the store side is gone, `as: 'seller'` returns nothing). */
  @SubscribeMessage('chat:list')
  async list(@ConnectedSocket() client: AuthedSocket, @MessageBody() body: Record<string, unknown>) {
    try {
      return ok(await this.chat.list(requireUser(client), body ?? {}));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  /** `{ conversationId, before?, limit? }`: messages oldest first; `before` = a message id to page back from. */
  @SubscribeMessage('chat:messages')
  async messages(@ConnectedSocket() client: AuthedSocket, @MessageBody() body: Record<string, unknown>) {
    try {
      return ok(await this.chat.messages(requireUser(client), body ?? {}));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  /** Closed: always answers `{ ok: false, error: 'Messaging sellers is closed. Contact support from your account.' }`. */
  @SubscribeMessage('chat:send')
  async send(@ConnectedSocket() client: AuthedSocket, @MessageBody() body: Record<string, unknown>) {
    try {
      return ok(await this.chat.send(requireUser(client), body ?? {}));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  /** `{ conversationId }`: zero my side's unread count. */
  @SubscribeMessage('chat:markRead')
  async markRead(@ConnectedSocket() client: AuthedSocket, @MessageBody() body: Record<string, unknown>) {
    try {
      return ok(await this.chat.markRead(requireUser(client), body ?? {}));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  /** Total unread across my chats: `{ total, buyer, seller }` (`seller` is always 0). */
  @SubscribeMessage('chat:unread')
  async unread(@ConnectedSocket() client: AuthedSocket) {
    try {
      return ok(await this.chat.unread(requireUser(client)));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  /** Admin / support, read-only. `{ sellerId?, buyerId?, orderId?, q?, limit?, offset? }`: every conversation, newest first, with `messageCount`. */
  @SubscribeMessage('chat:adminList')
  async adminList(@ConnectedSocket() client: AuthedSocket, @MessageBody() body: Record<string, unknown>) {
    try {
      return ok(await this.chat.adminList(requireUser(client), body ?? {}));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  /** Admin / support, read-only. `{ conversationId, before?, limit? }`: the messages of any conversation, oldest first. */
  @SubscribeMessage('chat:adminMessages')
  async adminMessages(@ConnectedSocket() client: AuthedSocket, @MessageBody() body: Record<string, unknown>) {
    try {
      return ok(await this.chat.adminMessages(requireUser(client), body ?? {}));
    } catch (e) {
      return fail((e as Error).message);
    }
  }
}
