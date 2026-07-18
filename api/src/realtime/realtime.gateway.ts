import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { AuthService } from '../auth/auth.service';
import { DeliveryService } from '../delivery/delivery.service';
import { NotificationsService } from '../notifications/notifications.service';
import { OrdersService } from '../orders/orders.service';
import type { CreateOrderInput } from '../orders/orders.service';
import { ProductsService } from '../products/products.service';
import { UsersService } from '../users/users.service';
import { RealtimeEmitter } from './realtime-emitter';
import type { DeliveryStatus, OrderStatus } from '../database/entities';

interface SocketUser {
  id: string;
  role: string;
  name: string;
}

type AuthedSocket = Socket & { data: { user?: SocketUser } };

/** Standard ack envelope so clients always get {ok, data|error}. */
function ok<T>(data: T) {
  return { ok: true as const, data };
}
function fail(error: string) {
  return { ok: false as const, error };
}

/**
 * The single real-time surface of the app. After a one-shot REST login, every
 * client opens ONE socket (JWT in the handshake) and does all reads, writes,
 * and live updates here — no repeated HTTP polling. Handlers return acks for
 * request/response; the server pushes events into user/role rooms for updates.
 */
@WebSocketGateway({
  cors: { origin: true, credentials: true },
})
export class RealtimeGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  server: Server;

  constructor(
    private readonly auth: AuthService,
    private readonly users: UsersService,
    private readonly products: ProductsService,
    private readonly orders: OrdersService,
    private readonly delivery: DeliveryService,
    private readonly notifications: NotificationsService,
    private readonly emitter: RealtimeEmitter,
  ) {}

  afterInit(server: Server): void {
    this.emitter.register(server);
    this.logger.log('Realtime gateway initialised.');
  }

  /** Authenticate the handshake, then join user + role rooms. */
  async handleConnection(client: AuthedSocket): Promise<void> {
    try {
      const token =
        (client.handshake.auth?.token as string) ||
        (client.handshake.headers?.authorization as string)?.replace(
          /^Bearer\s+/i,
          '',
        );
      if (!token) throw new Error('missing token');
      const payload = await this.auth.verifyAccess(token);
      const user = await this.users.findById(payload.sub);
      if (!user) throw new Error('unknown user');

      const socketUser: SocketUser = {
        id: user.id,
        role: user.role,
        name: user.name,
      };
      client.data.user = socketUser;
      await client.join(RealtimeEmitter.userRoom(user.id));
      await client.join(RealtimeEmitter.roleRoom(user.role));
      client.emit('ready', {
        user: UsersService.toPublic(user),
        serverTime: new Date().toISOString(),
      });
      this.logger.log(`connected ${user.role} ${user.id}`);
    } catch (err) {
      this.logger.warn(`rejected socket: ${(err as Error).message}`);
      client.emit('unauthorized', { message: 'Invalid or missing token.' });
      client.disconnect(true);
    }
  }

  handleDisconnect(client: AuthedSocket): void {
    const u = client.data.user;
    if (u) this.logger.log(`disconnected ${u.role} ${u.id}`);
  }

  private requireUser(client: AuthedSocket): SocketUser {
    const user = client.data.user;
    if (!user) throw new Error('Not authenticated.');
    return user;
  }

  // ---- Products -----------------------------------------------------------
  @SubscribeMessage('products:list')
  async productsList(@MessageBody() body: { category?: string; status?: string }) {
    return ok(await this.products.list(body ?? {}));
  }

  @SubscribeMessage('products:get')
  async productsGet(@MessageBody() body: { id: string }) {
    const p = await this.products.get(body.id);
    return p ? ok(p) : fail('Product not found.');
  }

  // ---- Orders -------------------------------------------------------------
  @SubscribeMessage('orders:list')
  async ordersList(@ConnectedSocket() client: AuthedSocket) {
    try {
      const user = this.requireUser(client);
      return ok(await this.orders.list(user));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  @SubscribeMessage('orders:create')
  async ordersCreate(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: CreateOrderInput,
  ) {
    try {
      const user = this.requireUser(client);
      const order = await this.orders.create(
        { id: user.id, name: user.name },
        body,
      );
      return ok(order);
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  @SubscribeMessage('orders:updateStatus')
  async ordersUpdateStatus(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { orderId: string; status: OrderStatus },
  ) {
    try {
      const user = this.requireUser(client);
      if (user.role === 'customer') return fail('Not allowed.');
      return ok(await this.orders.updateStatus(body.orderId, body.status));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  // ---- Delivery -----------------------------------------------------------
  @SubscribeMessage('delivery:list')
  async deliveryList(@ConnectedSocket() client: AuthedSocket) {
    try {
      const user = this.requireUser(client);
      if (user.role === 'rider') {
        return ok(await this.delivery.listForRider(user.id));
      }
      return ok(await this.delivery.listAll());
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  @SubscribeMessage('delivery:unassigned')
  async deliveryUnassigned() {
    return ok(await this.delivery.listUnassigned());
  }

  @SubscribeMessage('delivery:accept')
  async deliveryAccept(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { taskId: string },
  ) {
    try {
      const user = this.requireUser(client);
      if (user.role !== 'rider') return fail('Riders only.');
      return ok(
        await this.delivery.accept(body.taskId, {
          id: user.id,
          name: user.name,
        }),
      );
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  @SubscribeMessage('delivery:updateStatus')
  async deliveryUpdateStatus(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { taskId: string; status: DeliveryStatus },
  ) {
    try {
      const user = this.requireUser(client);
      if (user.role !== 'rider') return fail('Riders only.');
      return ok(await this.delivery.updateStatus(body.taskId, body.status));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  @SubscribeMessage('delivery:location')
  async deliveryLocation(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { taskId: string; lat: number; lng: number },
  ) {
    try {
      const user = this.requireUser(client);
      if (user.role !== 'rider') return fail('Riders only.');
      await this.delivery.updateLocation(body.taskId, user.id, body.lat, body.lng);
      return ok({ received: true });
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  // ---- Notifications ------------------------------------------------------
  @SubscribeMessage('notifications:list')
  async notificationsList(@ConnectedSocket() client: AuthedSocket) {
    try {
      const user = this.requireUser(client);
      return ok(await this.notifications.listForUser(user.id, user.role));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  @SubscribeMessage('notifications:markRead')
  async notificationsMarkRead(@MessageBody() body: { id: string }) {
    await this.notifications.markRead(body.id);
    return ok({ id: body.id });
  }
}
