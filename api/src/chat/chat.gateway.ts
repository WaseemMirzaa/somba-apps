import { ConnectedSocket, MessageBody, SubscribeMessage, WebSocketGateway } from '@nestjs/websockets';
import { fail, ok, requireUser } from '../sellers/gateway-support';
import type { AuthedSocket } from '../sellers/gateway-support';
import { ChatService } from './chat.service';

/**
 * Customer <-> seller chat (docs/contracts/seller-platform.md §3). Same Socket.IO server as RealtimeGateway, which
 * authenticates the handshake. Pushes: `chat:message` { conversation, message } to both sides (the owner and the
 * staff allowed to answer), `chat:read` { conversationId, side } when a side reads the thread.
 */
@WebSocketGateway({ cors: { origin: true, credentials: true } })
export class ChatGateway {
  constructor(private readonly chat: ChatService) {}

  /** `{ sellerId, productId?, orderId?, text, attachments? }`: opens (or reuses) the thread and posts the first message. */
  @SubscribeMessage('chat:start')
  async start(@ConnectedSocket() client: AuthedSocket, @MessageBody() body: Record<string, unknown>) {
    try {
      return ok(await this.chat.start(requireUser(client), body ?? {}));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  /** `{ as?: 'buyer'|'seller', limit?, offset? }`: my conversations with unread counts. */
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

  /** `{ conversationId, text, attachments? }` */
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

  /** Total unread across my chats: `{ total, buyer, seller }`. */
  @SubscribeMessage('chat:unread')
  async unread(@ConnectedSocket() client: AuthedSocket) {
    try {
      return ok(await this.chat.unread(requireUser(client)));
    } catch (e) {
      return fail((e as Error).message);
    }
  }
}
