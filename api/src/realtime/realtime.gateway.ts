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
import { WalletService } from '../wallet/wallet.service';
import { PaymentsService } from '../payments/payments.service';
import { PayoutsService } from '../payouts/payouts.service';
import { DisputesService } from '../disputes/disputes.service';
import { CategoriesService } from '../catalog/categories.service';
import { AddressesService } from '../addresses/addresses.service';
import { ReviewsService } from '../content/reviews.service';
import { SupportService } from '../content/support.service';
import { PromosService } from '../content/promos.service';
import { CmsService } from '../content/cms.service';
import { SettingsService } from '../content/settings.service';
import { RealtimeEmitter } from './realtime-emitter';
import type {
  DeliveryStatus,
  DisputeType,
  OrderStatus,
} from '../database/entities';

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
    private readonly wallet: WalletService,
    private readonly payments: PaymentsService,
    private readonly payouts: PayoutsService,
    private readonly disputes: DisputesService,
    private readonly categories: CategoriesService,
    private readonly addresses: AddressesService,
    private readonly reviews: ReviewsService,
    private readonly support: SupportService,
    private readonly promos: PromosService,
    private readonly cms: CmsService,
    private readonly settings: SettingsService,
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
      // Anonymous browsing: guests may open a read-only socket (public
      // catalog/categories/reviews). Mutations still require a real account.
      if (!token) {
        const guest: SocketUser = { id: 'guest', role: 'guest', name: 'Guest' };
        client.data.user = guest;
        await client.join(RealtimeEmitter.roleRoom('guest'));
        client.emit('ready', {
          user: { id: 'guest', role: 'guest', name: 'Guest' },
          serverTime: new Date().toISOString(),
        });
        return;
      }
      const payload = await this.auth.verifyAccess(token);
      const user = await this.users.findById(payload.sub);
      if (!user) throw new Error('unknown user');
      if ((payload.tokenVersion ?? 0) !== user.tokenVersion) {
        throw new Error('revoked session');
      }

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

  /** Require a real, signed-in account (rejects anonymous guests). */
  private requireUser(client: AuthedSocket): SocketUser {
    const user = client.data.user;
    if (!user || user.role === 'guest') {
      throw new Error('Sign in to continue.');
    }
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

  // Public — categories for the storefront (guests included).
  @SubscribeMessage('categories:list')
  async categoriesList() {
    return ok(await this.categories.list());
  }

  @SubscribeMessage('products:create')
  async productsCreate(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody()
    body: {
      name: string;
      nameFr?: string;
      price: number;
      category: string;
      stock?: number;
      image?: string;
      description?: string;
    },
  ) {
    try {
      const user = this.requireUser(client);
      if (user.role !== 'seller' && !user.role.startsWith('admin')) {
        return fail('Only sellers or admins can publish products.');
      }
      if (!body?.name || body.price == null || !body.category) {
        return fail('name, price and category are required.');
      }
      // Seller-published products go live immediately in this prototype.
      const product = await this.products.create({
        name: body.name,
        nameFr: body.nameFr ?? null,
        price: Number(body.price),
        category: body.category,
        stock: body.stock ?? 0,
        image: body.image ?? null,
        description: body.description ?? null,
        status: 'live',
        sellerId: user.id,
        sellerName: user.name,
      });
      return ok(product);
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  @SubscribeMessage('products:update')
  async productsUpdate(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { id: string; patch: Record<string, unknown> },
  ) {
    try {
      const user = this.requireUser(client);
      const existing = await this.products.get(body.id);
      if (!existing) return fail('Product not found.');
      const isOwner = existing.sellerId === user.id;
      if (!isOwner && !user.role.startsWith('admin')) {
        return fail('You can only edit your own products.');
      }
      return ok(await this.products.update(body.id, body.patch));
    } catch (e) {
      return fail((e as Error).message);
    }
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

  // ---- Wallet -------------------------------------------------------------
  @SubscribeMessage('wallet:get')
  async walletGet(@ConnectedSocket() client: AuthedSocket) {
    try {
      const user = this.requireUser(client);
      return ok({ balance: await this.wallet.getBalance(user.id) });
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  @SubscribeMessage('wallet:transactions')
  async walletTransactions(@ConnectedSocket() client: AuthedSocket) {
    try {
      const user = this.requireUser(client);
      return ok(await this.wallet.list(user.id));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  @SubscribeMessage('wallet:topup')
  async walletTopup(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { amountUsd: number; method?: string },
  ) {
    try {
      const user = this.requireUser(client);
      return ok(await this.wallet.topUp(user.id, body.amountUsd, body.method));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  // ---- Payments -----------------------------------------------------------
  @SubscribeMessage('payments:list')
  async paymentsList(@ConnectedSocket() client: AuthedSocket) {
    try {
      const user = this.requireUser(client);
      return ok(await this.payments.list(user));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  @SubscribeMessage('orders:refund')
  async ordersRefund(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { orderId: string; toWallet?: boolean },
  ) {
    try {
      const user = this.requireUser(client);
      const canRefund =
        user.role === 'admin' || user.role === 'admin_finance';
      if (!canRefund) return fail('Only admin/finance can issue refunds.');
      return ok(await this.orders.refund(body.orderId, body.toWallet ?? true));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  // ---- Payouts (seller ⇄ finance) -----------------------------------------
  @SubscribeMessage('payouts:list')
  async payoutsList(@ConnectedSocket() client: AuthedSocket) {
    try {
      const user = this.requireUser(client);
      return ok(await this.payouts.list(user));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  @SubscribeMessage('payouts:request')
  async payoutsRequest(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { amountUsd: number; method?: string },
  ) {
    try {
      const user = this.requireUser(client);
      if (user.role !== 'seller') return fail('Sellers only.');
      return ok(
        await this.payouts.request(
          { id: user.id, name: user.name },
          body.amountUsd,
          body.method,
        ),
      );
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  @SubscribeMessage('payouts:approve')
  async payoutsApprove(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { payoutId: string },
  ) {
    try {
      const user = this.requireUser(client);
      if (user.role !== 'admin' && user.role !== 'admin_finance') {
        return fail('Only admin/finance can approve payouts.');
      }
      return ok(await this.payouts.approve(body.payoutId));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  @SubscribeMessage('payouts:reject')
  async payoutsReject(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { payoutId: string; note?: string },
  ) {
    try {
      const user = this.requireUser(client);
      if (user.role !== 'admin' && user.role !== 'admin_finance') {
        return fail('Only admin/finance can reject payouts.');
      }
      return ok(await this.payouts.reject(body.payoutId, body.note));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  // ---- Disputes / returns (customer ⇄ admin) ------------------------------
  @SubscribeMessage('disputes:list')
  async disputesList(@ConnectedSocket() client: AuthedSocket) {
    try {
      const user = this.requireUser(client);
      return ok(await this.disputes.list(user));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  @SubscribeMessage('disputes:open')
  async disputesOpen(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { orderId: string; type: DisputeType; reason: string },
  ) {
    try {
      const user = this.requireUser(client);
      if (user.role !== 'customer') return fail('Customers only.');
      return ok(
        await this.disputes.open(
          { id: user.id, name: user.name },
          { orderId: body.orderId, type: body.type, reason: body.reason },
        ),
      );
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  @SubscribeMessage('disputes:resolve')
  async disputesResolve(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { disputeId: string; resolution?: string; refund?: boolean },
  ) {
    try {
      const user = this.requireUser(client);
      if (!user.role.startsWith('admin')) return fail('Admins only.');
      return ok(
        await this.disputes.resolve(body.disputeId, {
          resolution: body.resolution,
          refund: body.refund,
        }),
      );
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  @SubscribeMessage('disputes:reject')
  async disputesReject(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { disputeId: string; resolution?: string },
  ) {
    try {
      const user = this.requireUser(client);
      if (!user.role.startsWith('admin')) return fail('Admins only.');
      return ok(await this.disputes.reject(body.disputeId, body.resolution));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  // ---- Addresses (customer) ----------------------------------------------
  @SubscribeMessage('addresses:list')
  async addressesList(@ConnectedSocket() client: AuthedSocket) {
    try {
      const user = this.requireUser(client);
      return ok(await this.addresses.list(user.id));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  @SubscribeMessage('addresses:create')
  async addressesCreate(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: Record<string, unknown>,
  ) {
    try {
      const user = this.requireUser(client);
      return ok(await this.addresses.create(user.id, body));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  @SubscribeMessage('addresses:update')
  async addressesUpdate(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { id: string; patch: Record<string, unknown> },
  ) {
    try {
      const user = this.requireUser(client);
      return ok(await this.addresses.update(user.id, body.id, body.patch));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  @SubscribeMessage('addresses:remove')
  async addressesRemove(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { id: string },
  ) {
    try {
      const user = this.requireUser(client);
      await this.addresses.remove(user.id, body.id);
      return ok({ id: body.id });
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  // ---- Reviews & Q&A (public read; customer writes) ----------------------
  @SubscribeMessage('reviews:list')
  async reviewsList(@MessageBody() body: { productId: string }) {
    return ok(await this.reviews.listForProduct(body.productId));
  }

  @SubscribeMessage('reviews:create')
  async reviewsCreate(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { productId: string; rating: number; text: string },
  ) {
    try {
      const user = this.requireUser(client);
      return ok(
        await this.reviews.create({ id: user.id, name: user.name }, body),
      );
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  @SubscribeMessage('questions:list')
  async questionsList(@MessageBody() body: { productId: string }) {
    return ok(await this.reviews.listQuestions(body.productId));
  }

  @SubscribeMessage('questions:ask')
  async questionsAsk(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { productId: string; question: string },
  ) {
    try {
      const user = this.requireUser(client);
      return ok(await this.reviews.ask({ id: user.id, name: user.name }, body));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  @SubscribeMessage('questions:answer')
  async questionsAnswer(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { id: string; answer: string },
  ) {
    try {
      const user = this.requireUser(client);
      if (user.role === 'customer') return fail('Not allowed.');
      return ok(await this.reviews.answer(body.id, body.answer, user.name));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  // ---- Support tickets ----------------------------------------------------
  @SubscribeMessage('support:list')
  async supportList(@ConnectedSocket() client: AuthedSocket) {
    try {
      return ok(await this.support.list(this.requireUser(client)));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  @SubscribeMessage('support:open')
  async supportOpen(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody()
    body: { subject: string; category?: string; message: string; orderId?: string },
  ) {
    try {
      const user = this.requireUser(client);
      return ok(await this.support.open({ id: user.id, name: user.name }, body));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  @SubscribeMessage('support:reply')
  async supportReply(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { id: string; text: string },
  ) {
    try {
      const user = this.requireUser(client);
      return ok(
        await this.support.reply(body.id, { name: user.name, role: user.role }, body.text),
      );
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  @SubscribeMessage('support:setStatus')
  async supportSetStatus(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { id: string; status: 'open' | 'pending' | 'resolved' | 'closed' },
  ) {
    try {
      const user = this.requireUser(client);
      if (user.role === 'customer') return fail('Not allowed.');
      return ok(await this.support.setStatus(body.id, body.status));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  // ---- Promotions & flash sales ------------------------------------------
  @SubscribeMessage('promos:list')
  async promosList() {
    return ok(await this.promos.list());
  }

  @SubscribeMessage('promos:validate')
  async promosValidate(@MessageBody() body: { code: string; subtotalUsd: number }) {
    return ok(await this.promos.validate(body.code, body.subtotalUsd));
  }

  @SubscribeMessage('promos:create')
  async promosCreate(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: Record<string, unknown>,
  ) {
    try {
      const user = this.requireUser(client);
      if (!user.role.startsWith('admin')) return fail('Admins only.');
      return ok(await this.promos.create(body));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  @SubscribeMessage('flashsales:list')
  async flashSalesList() {
    return ok(await this.promos.listFlashSales());
  }

  @SubscribeMessage('flashsales:create')
  async flashSalesCreate(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: Record<string, unknown>,
  ) {
    try {
      const user = this.requireUser(client);
      if (!user.role.startsWith('admin')) return fail('Admins only.');
      return ok(await this.promos.createFlashSale(body));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  // ---- CMS + settings + categories CRUD (admin) --------------------------
  @SubscribeMessage('cms:list')
  async cmsList() {
    return ok(await this.cms.list());
  }

  @SubscribeMessage('cms:upsert')
  async cmsUpsert(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { key: string } & Record<string, unknown>,
  ) {
    try {
      const user = this.requireUser(client);
      if (!user.role.startsWith('admin')) return fail('Admins only.');
      return ok(await this.cms.upsert(body));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  @SubscribeMessage('settings:get')
  async settingsGet() {
    return ok(await this.settings.all());
  }

  @SubscribeMessage('settings:set')
  async settingsSet(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { key: string; value: string },
  ) {
    try {
      const user = this.requireUser(client);
      if (!user.role.startsWith('admin')) return fail('Admins only.');
      return ok(await this.settings.set(body.key, body.value));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  @SubscribeMessage('categories:create')
  async categoriesCreate(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: Record<string, unknown>,
  ) {
    try {
      const user = this.requireUser(client);
      if (!user.role.startsWith('admin')) return fail('Admins only.');
      return ok(await this.categories.create(body));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  @SubscribeMessage('categories:update')
  async categoriesUpdate(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { id: string; patch: Record<string, unknown> },
  ) {
    try {
      const user = this.requireUser(client);
      if (!user.role.startsWith('admin')) return fail('Admins only.');
      return ok(await this.categories.update(body.id, body.patch));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  @SubscribeMessage('categories:remove')
  async categoriesRemove(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { id: string },
  ) {
    try {
      const user = this.requireUser(client);
      if (!user.role.startsWith('admin')) return fail('Admins only.');
      await this.categories.remove(body.id);
      return ok({ id: body.id });
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
