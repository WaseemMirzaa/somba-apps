import { Logger, UseInterceptors } from '@nestjs/common';
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
import { WsThrottleInterceptor } from './ws-throttle.interceptor';
import { oneOf, str } from '../common/validate';
import { pageOf } from '../common/paging';
import { asLocale } from '../common/locale';
import { activePlanId } from '../content/plans';
import { clampDays } from '../ops/analytics.util';
import { cleanListing, materialTextChange } from '../products/products.service';
import type { ListingInput } from '../products/products.service';
import { TranslationService } from '../translation/translation.service';
import { SellerPlatformKit } from '../sellers/seller-kit';
import { touchesStorefront } from '../sellers/storefront.service';
import type { SellerContext } from '../sellers/seller-context';
import { Server, Socket } from 'socket.io';
import { AuthService } from '../auth/auth.service';
import { DeliveryService } from '../delivery/delivery.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PushService } from '../notifications/push.service';
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
import { notServedFields } from '../geo/geo.service';
import { ReviewsService } from '../content/reviews.service';
import { WishlistService } from '../content/wishlist.service';
import { SupportService } from '../content/support.service';
import { PromosService } from '../content/promos.service';
import { CmsService } from '../content/cms.service';
import { SettingsService } from '../content/settings.service';
import { SellersService } from '../ops/sellers.service';
import type { KycInput as SellerKycBody } from '../ops/sellers.service';
import { AnalyticsService } from '../ops/analytics.service';
import { AuditService } from '../ops/audit.service';
import { FraudService } from '../ops/fraud.service';
import { CustomersService } from '../ops/customers.service';
import { BroadcastsService } from '../ops/broadcasts.service';
import { RolesService } from '../ops/roles.service';
import { WarehouseService } from '../warehouse/warehouse.service';
import { LogisticsService } from '../logistics/logistics.service';
import type { Actor } from '../logistics/logistics.service';
import { tierOf } from '../logistics/tiers';
import { RiderService } from '../warehouse/rider.service';
import { CampaignsService } from '../flows/campaigns.service';
import { ReplacementsService } from '../flows/replacements.service';
import { ExchangesService } from '../flows/exchanges.service';
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

/** Validate a positive money amount (USD), rounded to cents. Throws otherwise. */
/** Which admin sub-roles may use which feature (least privilege). */
const GROUPS = {
  config: ['admin', 'admin_finance', 'admin_operations'],
  content: ['admin', 'admin_marketing'],
  catalog: ['admin', 'admin_operations', 'admin_marketing'],
  people: ['admin', 'admin_support', 'admin_operations', 'admin_finance'],
  insight: ['admin', 'admin_operations', 'admin_finance'],
  audit: ['admin', 'admin_operations'],
  fraud: ['admin', 'admin_finance', 'admin_operations', 'admin_moderation'],
  /** Money screens: confirm/decline payments, finance dashboard. */
  finance: ['admin', 'admin_finance'],
  /** Hide / restore customer reviews. */
  moderate: ['admin', 'admin_operations', 'admin_moderation'],
  /** Hub directory (create / edit / deactivate). */
  hubs: ['admin', 'admin_operations'],
  /** Operators who move orders by hand and cancel them on a customer's behalf. */
  orderOps: ['admin', 'admin_operations'],
} as const;
const ALL_ROLES = ['customer', 'seller', 'admin', 'admin_operations', 'admin_finance', 'admin_support', 'admin_marketing', 'admin_moderation', 'warehouse_staff', 'rider'] as const;

function assertAmount(x: unknown): number {
  const n = typeof x === 'number' ? x : Number(x);
  if (!Number.isFinite(n) || n <= 0 || n > 1_000_000) {
    throw new Error('Amount must be a positive number.');
  }
  return Number(n.toFixed(2));
}

/**
 * The single real-time surface of the app. After a one-shot REST login, every
 * client opens ONE socket (JWT in the handshake) and does all reads, writes,
 * and live updates here — no repeated HTTP polling. Handlers return acks for
 * request/response; the server pushes events into user/role rooms for updates.
 */
@UseInterceptors(WsThrottleInterceptor)
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
    private readonly push: PushService,
    private readonly wallet: WalletService,
    private readonly payments: PaymentsService,
    private readonly payouts: PayoutsService,
    private readonly disputes: DisputesService,
    private readonly categories: CategoriesService,
    private readonly addresses: AddressesService,
    private readonly reviews: ReviewsService,
    private readonly wishlist: WishlistService,
    private readonly support: SupportService,
    private readonly promos: PromosService,
    private readonly cms: CmsService,
    private readonly settings: SettingsService,
    private readonly sellersSvc: SellersService,
    private readonly analytics: AnalyticsService,
    private readonly audit: AuditService,
    private readonly fraud: FraudService,
    private readonly customers: CustomersService,
    private readonly broadcasts: BroadcastsService,
    private readonly roles: RolesService,
    private readonly warehouse: WarehouseService,
    private readonly rider: RiderService,
    private readonly campaigns: CampaignsService,
    private readonly replacements: ReplacementsService,
    private readonly exchanges: ExchangesService,
    private readonly translations: TranslationService,
    private readonly kit: SellerPlatformKit,
    private readonly logistics: LogisticsService,
    private readonly emitter: RealtimeEmitter,
    private readonly throttle: WsThrottleInterceptor,
  ) {}

  /**
   * The warehouse a request is limited to: riders and warehouse staff belong to exactly one and see only that one;
   * admins see everything unless they ask for one warehouse.
   */
  private async hubScope(user: SocketUser, requested?: string | null): Promise<string | null> {
    if (this.isAdmin(user.role)) return requested ? String(requested) : null;
    if (user.role !== 'rider' && user.role !== 'warehouse_staff') return null;
    const hubId = (await this.users.findById(user.id))?.hubId ?? null;
    if (!hubId) throw new Error('Your account is not linked to a warehouse. Ask an administrator.');
    return hubId;
  }

  /** The caller as the warehouse desk sees them (warehouse and tier come from the database, not the socket). */
  private async deskActor(user: SocketUser): Promise<Actor> {
    if (this.isAdmin(user.role)) return { id: user.id, role: user.role, name: user.name, hubId: null, tier: null };
    const row = await this.users.findById(user.id);
    if (user.role !== 'warehouse_staff' || !row?.hubId) throw new Error('Your account is not linked to a warehouse. Ask an administrator.');
    return { id: user.id, role: user.role, name: user.name, hubId: row.hubId, tier: tierOf(row.warehouseTier) };
  }

  private isOps(role: string) {
    return role.startsWith('admin') || role === 'warehouse_staff';
  }

  private isAdmin(role: string) {
    return role.startsWith('admin');
  }

  /** Is the user's role in the given least-privilege group? */
  private can(role: string, group: keyof typeof GROUPS) {
    return (GROUPS[group] as readonly string[]).includes(role);
  }

  /** Drop every open socket of a user (after suspension / role change / password reset). */
  private kick(userId: string) {
    this.server?.in(RealtimeEmitter.userRoom(userId)).disconnectSockets(true);
  }

  /**
   * Verification policy: with the public setting `requireVerifiedForCheckout`
   * on, an account must have a verified phone OR email before it can place an
   * order or top up its wallet.
   */
  private async assertVerifiedForCheckout(userId: string): Promise<void> {
    if ((await this.settings.get('requireVerifiedForCheckout')) !== 'true') return;
    const user = await this.users.findById(userId);
    if (user && (user.phoneVerified || user.emailVerified)) return;
    throw new Error('Verify your phone number or email address first: open Profile > Verification, confirm a code or link, then try again.');
  }

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
      this.auth.assertNotSuspended(user);

      const socketUser: SocketUser = {
        id: user.id,
        role: user.role,
        name: user.name,
      };
      client.data.user = socketUser;
      await client.join(RealtimeEmitter.userRoom(user.id));
      await client.join(RealtimeEmitter.roleRoom(user.role));
      // Warehouse staff follow the tasks of their own warehouse (`task:updated` goes to this room).
      if (user.role === 'warehouse_staff' && user.hubId) await client.join(RealtimeEmitter.hubRoom(user.hubId));
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
    this.throttle.release(client.id);
  }

  /**
   * The store a seller-role account acts for (owner or team member), enforcing the team role; admins get their own
   * (none). Throws a message safe to show. See docs/contracts/seller-platform.md.
   */
  private async sellerFor(user: SocketUser, permission: Parameters<SellerPlatformKit['orNull']>[1], opts?: { write?: boolean }) {
    if (user.role === 'seller') return (await this.kit.ctx.resolve(user, permission, opts)).seller;
    return this.sellersSvc.byUser(user.id);
  }

  /** The identity services key a seller's data by: the store owner's account (a team member acts as the owner), else the caller. */
  private async sellerActor(user: SocketUser, permission: Parameters<SellerPlatformKit['orNull']>[1], opts?: { write?: boolean }): Promise<{ id: string; name: string; role: string }> {
    if (user.role !== 'seller') return user;
    const ctx = await this.kit.orNull(user, permission, opts);
    return ctx ? ctx.actor : user;
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
  async productsList(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { category?: string; categoryId?: string; status?: string; limit?: number; offset?: number },
  ) {
    // Admins may filter by any status; everyone else only ever sees LIVE listings
    // (plus a seller's own drafts), whatever they ask for. The filtering happens in
    // the query, and `limit` / `offset` page the result (default 500). The category
    // filter takes an id, or a name in either language (older apps send the English name).
    const user = client.data.user;
    const role = user?.role ?? 'guest';
    const { take, skip } = pageOf(body);
    const category = typeof body?.category === 'string' ? body.category : undefined;
    const categoryId = typeof body?.categoryId === 'string' ? body.categoryId : undefined;
    if (this.isAdmin(role)) return ok(await this.products.list({ category, categoryId, status: body?.status, limit: take, offset: skip }));
    if (role === 'seller') {
      // A seller's catalogue is THEIR store's listings (drafts included): for the owner and for the team members
      // who work with the catalogue (resolved through the seller context). Other stores' products never appear.
      const ctx = await this.kit.ctx.resolve(user!, 'catalog_read', { write: false }).catch(() => null);
      if (ctx) {
        const ownerIds = [...new Set([user!.id, ...ctx.ownerIds])];
        return ok(await this.products.list({ category, categoryId, status: typeof body?.status === 'string' ? body.status : undefined, ownerIds, ownOnly: true, limit: take, offset: skip }));
      }
      // A role without the catalogue permission (finance…), or a suspended store, sees the store's LIVE listings only.
      const seat = await this.kit.ctx.membership(user!.id).catch(() => null);
      const ownerIds = seat ? [seat.seller.id, ...(seat.seller.userId ? [seat.seller.userId] : [])] : [user!.id];
      return ok(await this.products.list({ category, categoryId, status: 'live', ownerIds, ownOnly: true, limit: take, offset: skip }));
    }
    return ok(await this.products.list({ category, categoryId, liveOnly: true, limit: take, offset: skip }));
  }

  @SubscribeMessage('products:get')
  async productsGet(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { id: string },
  ) {
    const p = await this.products.get(String(body?.id ?? ''));
    const user = client.data.user;
    const role = user?.role ?? 'guest';
    if (p && p.status !== 'live' && !this.isAdmin(role)) {
      // Non-live listings are visible only to their own seller (and admins).
      const mine = role === 'seller' ? ((await this.kit.ctx.resolve(user!, 'catalog_read', { write: false }).catch(() => null))?.seller ?? null) : null;
      if (!(role === 'seller' && (p.sellerId === mine?.id || p.sellerId === user!.id))) {
        return fail('Product not found.');
      }
    }
    // Only shoppers count as a view (not the owning seller or staff, and only live listings).
    if (p && p.status === 'live' && (role === 'customer' || role === 'guest')) {
      void this.products.recordView(p.id).catch(() => undefined);
    }
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
      name?: string;
      nameFr?: string;
      description?: string;
      descriptionFr?: string;
      price: number;
      category?: string;
      categoryId?: string;
      stock?: number;
      image?: string;
      variants?: { name: string; options: string[] }[];
      variantLabels?: { en?: { name: string; options: string[] }[]; fr?: { name: string; options: string[] }[] };
      sourceLang?: 'en' | 'fr';
    },
  ) {
    try {
      const user = this.requireUser(client);
      if (user.role !== 'seller' && !user.role.startsWith('admin')) {
        return fail('Only sellers or admins can publish products.');
      }
      // Products are keyed to the Seller entity (not the user row) so seller
      // dashboards, stats, and payouts all join on the same id.
      const seller = await this.sellerFor(user, 'catalog');
      if (user.role === 'seller' && seller?.status !== 'approved') {
        return fail(
          seller?.status === 'pending'
            ? 'Your store is awaiting approval — you can list products once it is approved.'
            : 'Your store is not active. Contact support.',
        );
      }
      // New listings need the store's pickup pin (routing derives the origin warehouse from it) once the platform requires it.
      if (user.role === 'seller' && seller && (await this.settings.get('requireSellerPickupPin')) === 'true' && (seller.pickupLat == null || seller.pickupLng == null)) {
        return fail('Pin your pickup location on the map (Store settings) before listing products.');
      }
      // A store whose pickup area nobody serves yet can prepare itself but cannot put listings on sale.
      if (user.role === 'seller' && seller) await this.sellersSvc.assertPickupServed(seller);
      // The seller's plan may cap how many listings they can hold (`maxProducts`; none by default).
      if (user.role === 'seller' && seller) {
        const plan = (await this.sellersSvc.plans()).find((p) => p.id === activePlanId(seller));
        if (plan?.maxProducts && (await this.products.countForSeller(this.analytics.sellerIdsOf(seller))) >= plan.maxProducts) {
          return fail(`Your ${plan.name} plan allows ${plan.maxProducts} listings. Upgrade your plan to add more.`);
        }
      }
      const clean = cleanListing(body as ListingInput, { partial: false, allowStatus: false });
      const product = await this.products.create(clean, {
        // New listings from sellers wait for a moderator unless moderation is switched off.
        status: user.role === 'seller' && (await this.settings.get('productModeration')) !== 'false' ? 'pending' : 'live',
        sellerId: seller?.id ?? user.id,
      });
      if (product.status === 'pending') {
        await this.notifications.toAdmins({
          title: 'Product awaiting review',
          body: `${product.name} from ${product.sellerName ?? seller?.name ?? user.name} needs moderation.`,
          type: 'moderation',
          entityId: product.id,
        });
      }
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
      // The stored row (not the promotional price) is what edits are validated against.
      const existing = await this.products.get(body.id);
      if (!existing) return fail('Product not found.');
      const seller = await this.sellerFor(user, 'catalog');
      const isOwner =
        existing.sellerId === user.id ||
        (seller != null && existing.sellerId === seller.id);
      if (!isOwner && !user.role.startsWith('admin')) {
        return fail('You can only edit your own products.');
      }
      if (!user.role.startsWith('admin') && seller?.status !== 'approved' && existing.sellerId !== user.id) {
        return fail('Your store is not active.');
      }
      // Whitelisted + range-checked; only admins may change moderation status. `basePrice` is the stored price.
      const clean = cleanListing(body.patch as ListingInput, {
        partial: true,
        allowStatus: this.isAdmin(user.role),
        currentPrice: existing.basePrice,
      });
      // A seller may pause a live listing or resume a paused one; everything else
      // (approving, rejecting, un-removing) is a moderator's decision.
      const wanted = (body.patch as Record<string, unknown> | undefined)?.status;
      if (!this.isAdmin(user.role) && wanted !== undefined) {
        const pause = wanted === 'draft' && existing.status === 'live';
        const resume = wanted === 'live' && existing.status === 'draft';
        if (!pause && !resume) return fail('Only a moderator can change this listing\'s status.');
        if (resume && seller) await this.sellersSvc.assertPickupServed(seller);
        clean.columns.status = wanted as typeof existing.status;
      }
      // A live listing edited by its seller goes back to moderation when the change is material
      // (what the shopper reads or sees, in either language, or a price swing of more than 30%).
      // Admin edits are exempt, and so is anything a machine writes later (it never reaches this code).
      let requeue = false;
      if (user.role === 'seller' && existing.status === 'live' && (await this.settings.get('productModeration')) !== 'false') {
        const categoryId = clean.category ? await this.categories.resolveRef(clean.category) : undefined;
        const changed = materialTextChange(existing, clean, categoryId);
        const price = clean.columns.price;
        const bigPriceMove = price !== undefined && existing.basePrice > 0 && Math.abs(price - existing.basePrice) / existing.basePrice > 0.3;
        if (changed || bigPriceMove) {
          clean.columns.status = 'pending';
          requeue = true;
        }
      }
      const updated = await this.products.update(body.id, clean);
      if (requeue) {
        await this.notifications.toUser(user.id, {
          title: 'Changes under review',
          body: `Your changes to ${existing.name} are being reviewed`,
          type: 'moderation',
          entityId: existing.id,
        });
        await this.notifications.toAdmins({
          title: 'Product awaiting review',
          body: `${existing.name} was edited by ${existing.sellerName ?? 'a seller'} and needs moderation again.`,
          type: 'moderation',
          entityId: existing.id,
        });
      }
      if (this.isAdmin(user.role) && clean.columns.status && clean.columns.status !== existing.status && existing.sellerId) {
        const owner = await this.sellersSvc.get(existing.sellerId);
        if (owner?.userId) {
          await this.notifications.toUser(owner.userId, {
            title: clean.columns.status === 'live' ? 'Product approved' : clean.columns.status === 'rejected' ? 'Product rejected' : 'Product updated',
            body: `${existing.name} is now ${clean.columns.status}.`,
            type: 'moderation',
            entityId: existing.id,
          });
        }
      }
      return ok(updated);
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  /** The owning seller (or an admin) asks for a fresh machine translation; text they wrote themselves is kept. */
  @SubscribeMessage('products:retranslate')
  async productsRetranslate(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { id: string },
  ) {
    try {
      const user = this.requireUser(client);
      const existing = await this.products.getRaw(String(body?.id ?? ''));
      if (!existing) return fail('Product not found.');
      const seller = await this.sellerFor(user, 'catalog');
      const isOwner = existing.sellerId === user.id || (seller != null && existing.sellerId === seller.id);
      if (!isOwner && !this.isAdmin(user.role)) return fail('You can only retranslate your own products.');
      if (!this.translations.enabled) return fail('Automatic translation is not available right now.');
      return ok(await this.products.retranslate(existing.id));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  // ---- Translations (admin status, on-demand text) ----------------------
  /** Queue state of machine translation: counts by state, today's characters, the jobs that failed. */
  @SubscribeMessage('translation:status')
  async translationStatus(@ConnectedSocket() client: AuthedSocket) {
    try {
      const user = this.requireUser(client);
      if (!this.isAdmin(user.role)) return fail('Admins only.');
      return ok(await this.translations.status());
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  /** Re-queue one record (`entityType` + `entityId`), or every failed job when none is given. */
  @SubscribeMessage('translation:retry')
  async translationRetry(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body?: { entityType?: string; entityId?: string },
  ) {
    try {
      const user = this.requireUser(client);
      if (!this.isAdmin(user.role)) return fail('Admins only.');
      return ok(await this.translations.retry(body ?? {}));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  /**
   * A stored review / seller reply / question / answer in the other language. Takes a record id ONLY (never free
   * text, so a leaked client key cannot run up the translation bill); open to everyone who can read the text. // C-I5
   */
  @SubscribeMessage('translate:text')
  async translateText(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { kind?: string; id?: string; target?: string },
  ) {
    try {
      // A chat message is private to the two sides of its conversation: the chat service checks who is asking.
      if (body?.kind === 'chat_message') return ok(await this.kit.chat.translate(this.requireUser(client), body.id, body.target));
      const staff = this.can(client.data.user?.role ?? 'guest', 'moderate');
      return ok(await this.translations.translateStored(body?.kind, body?.id, body?.target, { staff }));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  // ---- Orders -------------------------------------------------------------
  @SubscribeMessage('orders:list')
  async ordersList(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body?: { limit?: number; offset?: number },
  ) {
    try {
      const user = this.requireUser(client);
      if (user.role === 'seller') {
        const ctx = await this.kit.orNull(user, 'orders', { write: false });
        // A CSV export is written in the language of whoever asked (the caller's saved language unless the request names one).
        let query: unknown = body;
        if (body && (body as { format?: unknown }).format === 'csv') {
          const asked = asLocale((body as { locale?: unknown }).locale);
          query = { ...body, locale: asked ?? asLocale((await this.users.findById(user.id))?.locale) ?? 'en' };
        }
        // A team member sees the store's orders as the owner does; an account with no store sees none.
        return ok(await this.orders.list(ctx ? ctx.actor : user, ctx?.seller.id, query));
      }
      // Warehouse staff get their own warehouse's orders only; admins get every order.
      return ok(await this.orders.list(user, undefined, body, user.role === 'warehouse_staff' ? await this.hubScope(user) : null));
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
      await this.assertVerifiedForCheckout(user.id);
      const order = await this.orders.create(
        { id: user.id, name: user.name },
        body,
      );
      // Raise a COD-risk fraud alert for large cash orders.
      if (order.paymentMethod === 'cod') {
        const cap = Number((await this.settings.get('codCapUsd')) ?? '500');
        await this.fraud.flagCodRisk(user.name, order.id, order.totalUsd, cap);
      }
      // The same view the customer's list and pushes carry (journey and warehouse names).
      return ok((await this.orders.customerViews([order]))[0] ?? order);
    } catch (e) {
      // An address nobody serves: the English message plus { areaId, areaName, areaNameEn, servedCities } to render it in either language.
      return { ...fail((e as Error).message), ...notServedFields(e) };
    }
  }

  @SubscribeMessage('orders:updateStatus')
  async ordersUpdateStatus(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { orderId: string; status: OrderStatus },
  ) {
    try {
      const user = this.requireUser(client);
      if (!this.can(user.role, 'orderOps')) return fail('Not allowed.');
      // Cancelling must restock and refund — route it through the real flow.
      if (body?.status === 'cancelled') return ok(await this.orders.cancel(user, body.orderId));
      const order = await this.orders.updateStatus(String(body?.orderId ?? ''), body?.status);
      await this.audit.record({ actor: user.name, role: user.role, action: 'order.status', entity: 'order', entityId: order.id, detail: `${order.reference} -> ${order.status}` });
      return ok(order);
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  /** An operator cancels an order with a reason (until the rider has collected the parcel). */
  @SubscribeMessage('orders:adminCancel')
  async ordersAdminCancel(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { orderId: string; reason: string },
  ) {
    try {
      const user = this.requireUser(client);
      if (!this.can(user.role, 'orderOps')) return fail('Not allowed.');
      const reason = String(body?.reason ?? '').trim().slice(0, 200);
      if (reason.length < 3) return fail('Give a reason for the cancellation (at least 3 characters).');
      const order = await this.orders.adminCancel(user, String(body?.orderId ?? ''), reason);
      await this.audit.record({ actor: user.name, role: user.role, action: 'order.cancelled', entity: 'order', entityId: order.id, detail: `${order.reference}: ${reason}` });
      return ok(order);
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  // ---- Delivery -----------------------------------------------------------
  @SubscribeMessage('delivery:list')
  async deliveryList(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body?: { limit?: number; offset?: number },
  ) {
    try {
      const user = this.requireUser(client);
      if (user.role === 'rider') {
        return ok(await this.delivery.listForRider(user.id, body));
      }
      if (!this.isOps(user.role)) return fail('Not allowed.');
      // Warehouse staff see their own warehouse's parcels (and unbound ones); admins may filter by warehouse.
      return ok(await this.delivery.listAll(body, await this.hubScope(user, (body as { hubId?: string })?.hubId)));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  @SubscribeMessage('delivery:unassigned')
  async deliveryUnassigned(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body?: { limit?: number; offset?: number },
  ) {
    try {
      // Tasks carry customers' delivery addresses: ops only. Riders have no open pool any more (the warehouse assigns).
      const user = this.requireUser(client);
      if (user.role === 'rider') return ok([]);
      if (!this.isOps(user.role)) return fail('Not allowed.');
      return ok(await this.delivery.listUnassigned(body, await this.hubScope(user, (body as { hubId?: string })?.hubId)));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  @SubscribeMessage('delivery:accept')
  async deliveryAccept(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { taskId: string },
  ) {
    try {
      const user = this.requireUser(client);
      if (user.role !== 'rider') return fail('Riders only.');
      // Riders no longer take tasks: this always answers with the "your warehouse assigns your tasks" error.
      return ok(this.delivery.accept(body?.taskId));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  @SubscribeMessage('delivery:updateStatus')
  async deliveryUpdateStatus(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { taskId: string; status: DeliveryStatus; reason?: string; code?: string },
  ) {
    try {
      const user = this.requireUser(client);
      if (user.role !== 'rider') return fail('Riders only.');
      if (!(['picked_up', 'in_transit', 'delivered', 'failed'] as string[]).includes(body?.status)) {
        return fail('Invalid delivery status.');
      }
      return ok(await this.delivery.updateStatus(body.taskId, body.status, user.id, body.reason, body.code));
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

  /** Hub staff scan a parcel in at THEIR warehouse (old name of `logistics:scanIn`); the next leg is created when due. */
  @SubscribeMessage('warehouse:receive')
  async warehouseReceive(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { taskId: string },
  ) {
    try {
      const user = this.requireUser(client);
      if (!this.isOps(user.role)) return fail('Ops only.');
      const me = await this.deskActor(user);
      const taskId = String(body?.taskId ?? '');
      const hubId = me.hubId ?? (await this.logistics.getTask(taskId)).toHubId;
      if (!hubId) return fail('This parcel is not due at a warehouse.');
      const { task } = await this.logistics.onScanIn(taskId, hubId, me);
      return ok(task);
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  /** The customer's 4-digit handover code for an order that is on its way. */
  @SubscribeMessage('orders:deliveryCode')
  async ordersDeliveryCode(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { orderId: string },
  ) {
    try {
      const user = this.requireUser(client);
      return ok(await this.orders.deliveryCode(user.id, String(body?.orderId ?? '')));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  /** A seller confirms an order containing their products is packed and ready for the rider. */
  @SubscribeMessage('orders:sellerReady')
  async ordersSellerReady(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { orderId: string },
  ) {
    try {
      const user = this.requireUser(client);
      const ctx = await this.kit.ctx.resolve(user, 'orders');
      return ok(await this.orders.sellerReady(ctx.actor, String(body?.orderId ?? '')));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  /**
   * A seller cannot fulfil (some of) THEIR lines of an order: only those lines are
   * cancelled and refunded; the other sellers' packages carry on.
   */
  @SubscribeMessage('orders:sellerCancel')
  async ordersSellerCancel(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { orderId: string; reason: string; itemIds?: string[] },
  ) {
    try {
      const user = this.requireUser(client);
      const ctx = await this.kit.ctx.resolve(user, 'orders');
      const itemIds = Array.isArray(body?.itemIds) ? body.itemIds.map(String).slice(0, 100) : undefined;
      return ok(await this.orders.sellerCancel(ctx.actor, String(body?.orderId ?? ''), String(body?.reason ?? ''), itemIds));
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

  /**
   * Top up the wallet through mobile money. Returns the PENDING payment; the
   * wallet is credited only when the network confirms (wallet:updated push).
   */
  @SubscribeMessage('wallet:topup')
  async walletTopup(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { amountUsd: number; method?: string; phone?: string },
  ) {
    try {
      const user = this.requireUser(client);
      await this.assertVerifiedForCheckout(user.id);
      const amount = assertAmount(body?.amountUsd);
      return ok(await this.payments.startTopUp(user.id, amount, String(body?.method ?? ''), body?.phone));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  // ---- Payments -----------------------------------------------------------
  @SubscribeMessage('payments:list')
  async paymentsList(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body?: { limit?: number; offset?: number },
  ) {
    try {
      const user = this.requireUser(client);
      return ok(await this.payments.list(user, body));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  @SubscribeMessage('payments:status')
  async paymentsStatus(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { reference: string },
  ) {
    try {
      const user = this.requireUser(client);
      return ok(await this.payments.status(user, String(body?.reference ?? '')));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  /** Finance confirms a pending mobile-money payment by hand (manual provider / fallback). */
  @SubscribeMessage('payments:confirm')
  async paymentsConfirm(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { reference: string },
  ) {
    try {
      const user = this.requireUser(client);
      if (user.role !== 'admin' && user.role !== 'admin_finance') return fail('Only admin/finance can confirm payments.');
      const paid = await this.payments.decideManually(String(body?.reference ?? ''), 'succeeded');
      await this.audit.record({ actor: user.name, role: user.role, action: 'payment.confirmed', entity: 'payment', entityId: paid.id, detail: paid.reference });
      return ok(paid);
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  @SubscribeMessage('payments:decline')
  async paymentsDecline(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { reference: string; reason?: string },
  ) {
    try {
      const user = this.requireUser(client);
      if (user.role !== 'admin' && user.role !== 'admin_finance') return fail('Only admin/finance can decline payments.');
      const res = await this.payments.decideManually(String(body?.reference ?? ''), 'failed', body?.reason);
      await this.audit.record({ actor: user.name, role: user.role, action: 'payment.declined', entity: 'payment', entityId: res.id, detail: res.reference });
      return ok(res);
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  /** The refund ledger (every refund of every payment, newest first): admin / finance only. `{ limit?, offset? }`. */
  @SubscribeMessage('payments:refunds')
  async paymentsRefunds(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body?: { limit?: number; offset?: number },
  ) {
    try {
      const user = this.requireUser(client);
      return ok(await this.payments.refundLog(user, body));
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
      const toWallet = body?.toWallet !== false;
      const payment = await this.orders.refund(String(body?.orderId ?? ''), toWallet);
      const { amountUsd: amount, refundTo } = payment.refund; // what THIS refund paid back (payment.refundedUsd is the running total)
      await this.audit.record({ actor: user.name, role: user.role, action: 'orders:refund', entity: 'order', entityId: String(body.orderId), detail: `${payment.orderReference ?? ''} $${amount.toFixed(2)} to ${refundTo === 'phone' ? 'phone (pawaPay)' : 'wallet'}` });
      return ok(payment);
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  // ---- Payouts (seller ⇄ finance) -----------------------------------------
  @SubscribeMessage('payouts:list')
  async payoutsList(@ConnectedSocket() client: AuthedSocket) {
    try {
      const user = this.requireUser(client);
      return ok(await this.payouts.list(await this.sellerActor(user, 'finance', { write: false })));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  /** What the signed-in seller can withdraw right now (and how it is computed). */
  @SubscribeMessage('payouts:available')
  async payoutsAvailable(@ConnectedSocket() client: AuthedSocket) {
    try {
      const user = this.requireUser(client);
      const ctx = await this.kit.ctx.resolve(user, 'finance', { write: false });
      return ok(await this.payouts.available(ctx.actor.id));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  @SubscribeMessage('payouts:request')
  async payoutsRequest(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { amountUsd: number; method?: string; account?: string },
  ) {
    try {
      const user = this.requireUser(client);
      const ctx = await this.kit.ctx.resolve(user, 'finance');
      const store = ctx.seller;
      if (store.status !== 'approved') return fail('Your store must be approved before you can request payouts.');
      const amount = assertAmount(body?.amountUsd);
      let method = body.method;
      let account = body.account;
      if (!ctx.isOwner && method !== 'wallet') {
        // Staff pay out to the account the owner saved; only the owner can name another destination.
        if (!store.payoutMethod || !store.payoutAccount) return fail('The store owner has not saved a payout account yet.');
        method = store.payoutMethod;
        account = store.payoutAccount;
      }
      const owner = ctx.isOwner ? user : await this.users.findById(ctx.actor.id);
      return ok(
        await this.payouts.request(
          { id: ctx.actor.id, name: owner?.name ?? store.name },
          amount,
          method,
          account,
        ),
      );
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  @SubscribeMessage('payouts:approve')
  async payoutsApprove(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { payoutId: string; providerRef?: string },
  ) {
    try {
      const user = this.requireUser(client);
      if (user.role !== 'admin' && user.role !== 'admin_finance') {
        return fail('Only admin/finance can approve payouts.');
      }
      const paid = await this.payouts.approve(body.payoutId, body.providerRef);
      await this.audit.record({ actor: user.name, role: user.role, action: 'payout.paid', entity: 'payout', entityId: paid.id, detail: `${paid.reference} $${paid.amountUsd} ref ${paid.providerRef ?? 'wallet'}` });
      return ok(paid);
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  /** Pay a mobile-money payout through pawaPay (it is `sending` until pawaPay confirms). */
  @SubscribeMessage('payouts:send')
  async payoutsSend(@ConnectedSocket() client: AuthedSocket, @MessageBody() body: { payoutId: string }) {
    try {
      const user = this.requireUser(client);
      if (user.role !== 'admin' && user.role !== 'admin_finance') return fail('Only admin/finance can send payouts.');
      const sent = await this.payouts.sendWithPawapay(String(body?.payoutId ?? ''));
      await this.audit.record({ actor: user.name, role: user.role, action: 'payout.sent', entity: 'payout', entityId: sent.id, detail: `${sent.reference} $${sent.amountUsd} via pawaPay ${sent.providerRef ?? ''}` });
      return ok(sent);
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  /** What the finance screens can offer: the mobile-money provider, refunds to the phone, pawaPay payouts. */
  @SubscribeMessage('payments:provider')
  async paymentsProvider(@ConnectedSocket() client: AuthedSocket) {
    try {
      const user = this.requireUser(client);
      if (user.role !== 'admin' && user.role !== 'admin_finance') return fail('Finance only.');
      const provider = this.payments.providerName;
      return ok({ provider, phoneRefunds: provider === 'pawapay', pawapayPayouts: this.payouts.canSendWithPawapay });
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

  /** Settlement statement of a payout (lines + totals). A seller: their own payouts; admin / admin_finance: any. */
  @SubscribeMessage('payouts:statement')
  async payoutsStatement(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { payoutId: string },
  ) {
    try {
      const user = this.requireUser(client);
      return ok(await this.payouts.statement(String(body?.payoutId ?? ''), await this.sellerActor(user, 'finance', { write: false }) as typeof user));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  /** Approve several payouts at once; each succeeds or fails on its own (per-item results). */
  @SubscribeMessage('payouts:approveBatch')
  async payoutsApproveBatch(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { items: { payoutId: string; providerRef?: string }[] },
  ) {
    try {
      const user = this.requireUser(client);
      if (user.role !== 'admin' && user.role !== 'admin_finance') {
        return fail('Only admin/finance can approve payouts.');
      }
      const results = await this.payouts.approveBatch(Array.isArray(body?.items) ? body.items : []);
      for (const r of results) {
        if (!r.ok || !r.payout) continue;
        await this.audit.record({ actor: user.name, role: user.role, action: 'payout.paid', entity: 'payout', entityId: r.payout.id, detail: `${r.payout.reference} $${r.payout.amountUsd} ref ${r.payout.providerRef ?? 'wallet'} (batch)` });
      }
      return ok(results);
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

  // ---- Promotions & flash sales ------------------------------------------
  @SubscribeMessage('promos:list')
  async promosList(@ConnectedSocket() client: AuthedSocket) {
    return ok(await this.promos.list(this.can(client.data.user?.role ?? 'guest', 'content')));
  }

  @SubscribeMessage('promos:validate')
  async promosValidate(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { code: string; subtotalUsd: number; items?: { productId: string; qty?: number }[] },
  ) {
    try {
      const user = this.requireUser(client);
      // A store coupon discounts only that store's lines: price the cart here (the same effective prices checkout uses).
      let lines: { productId: string; sellerId: string | null; priceUsd: number; qty: number }[] | undefined;
      if (Array.isArray(body?.items) && body.items.length) {
        lines = [];
        for (const it of body.items.slice(0, 100)) {
          const p = await this.products.get(String(it?.productId ?? ''));
          if (p) lines.push({ productId: p.id, sellerId: p.sellerId ?? null, priceUsd: p.price, qty: Math.max(1, Math.floor(Number(it?.qty) || 1)) });
        }
      }
      return ok(await this.promos.validate(String(body?.code ?? ''), Number(body?.subtotalUsd), user.id, lines));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  @SubscribeMessage('promos:create')
  async promosCreate(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: Record<string, unknown>,
  ) {
    try {
      const user = this.requireUser(client);
      if (!this.can(user.role, 'content')) return fail('Not allowed.');
      const promo = await this.promos.create(body);
      await this.audit.record({ actor: user.name, role: user.role, action: 'promo.create', entity: 'promo', entityId: promo.id, detail: promo.code });
      return ok(promo);
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  /** Switch a promo code on or off (marketing / admin). */
  @SubscribeMessage('promos:setActive')
  async promosSetActive(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { id: string; active: boolean },
  ) {
    try {
      const user = this.requireUser(client);
      if (!this.can(user.role, 'content')) return fail('Not allowed.');
      if (typeof body?.active !== 'boolean') return fail('Active must be true or false.');
      const promo = await this.promos.setActive(String(body?.id ?? ''), body.active);
      if (!promo) return fail('Promo not found.');
      await this.audit.record({ actor: user.name, role: user.role, action: body.active ? 'promo.activate' : 'promo.deactivate', entity: 'promo', entityId: promo.id, detail: promo.code });
      return ok(promo);
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  /** Shoppers: the active flash sales. With `{ all: true }` and the content permission: every sale, newest first. */
  @SubscribeMessage('flashsales:list')
  async flashSalesList(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body?: { all?: boolean; upcoming?: boolean },
  ) {
    const all = body?.all === true && this.can(client.data.user?.role ?? 'guest', 'content');
    return ok(await this.promos.listFlashSales(all, { upcoming: body?.upcoming === true }));
  }

  /** End a flash sale now. */
  @SubscribeMessage('flashsales:end')
  async flashSalesEnd(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { id: string },
  ) {
    try {
      const user = this.requireUser(client);
      if (!this.can(user.role, 'content')) return fail('Not allowed.');
      const sale = await this.promos.endFlashSale(String(body?.id ?? ''));
      await this.audit.record({ actor: user.name, role: user.role, action: 'flashsale.end', entity: 'flashsale', entityId: sale.id, detail: sale.title });
      return ok(sale);
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  @SubscribeMessage('flashsales:create')
  async flashSalesCreate(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: Record<string, unknown>,
  ) {
    try {
      const user = this.requireUser(client);
      if (!this.can(user.role, 'content')) return fail('Not allowed.');
      return ok(await this.promos.createFlashSale(body));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  // ---- CMS + settings + categories CRUD (admin) --------------------------
  @SubscribeMessage('cms:list')
  async cmsList(@ConnectedSocket() client: AuthedSocket) {
    return ok(await this.cms.list(this.can(client.data.user?.role ?? 'guest', 'content')));
  }

  @SubscribeMessage('cms:upsert')
  async cmsUpsert(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { key: string } & Record<string, unknown>,
  ) {
    try {
      const user = this.requireUser(client);
      if (!this.can(user.role, 'content')) return fail('Not allowed.');
      return ok(await this.cms.upsert(body));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  @SubscribeMessage('settings:get')
  async settingsGet(@ConnectedSocket() client: AuthedSocket) {
    // Everyone may read the public pricing/checkout settings; the rest is admin-only.
    const role = client.data.user?.role ?? 'guest';
    return ok(this.can(role, 'config') ? await this.settings.all() : await this.settings.publicView());
  }

  @SubscribeMessage('settings:set')
  async settingsSet(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { key: string; value: string },
  ) {
    try {
      const user = this.requireUser(client);
      if (!this.can(user.role, 'config')) return fail('Not allowed.');
      const all = await this.settings.set(String(body?.key ?? ''), body?.value);
      await this.audit.record({ actor: user.name, role: user.role, action: 'settings.set', entity: 'setting', entityId: body.key, detail: String(all[body.key]).slice(0, 200) });
      return ok(all);
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
      if (!this.can(user.role, 'catalog')) return fail('Not allowed.');
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
      if (!this.can(user.role, 'catalog')) return fail('Not allowed.');
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
      if (!this.can(user.role, 'catalog')) return fail('Not allowed.');
      await this.categories.remove(body.id);
      return ok({ id: body.id });
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  // ---- Sellers ------------------------------------------------------------
  @SubscribeMessage('sellers:list')
  async sellersList(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { status?: string; limit?: number; offset?: number },
  ) {
    try {
      const user = this.requireUser(client);
      if (!this.isAdmin(user.role)) return fail('Admins only.');
      return ok(await this.sellersSvc.list(body?.status as never, body));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  /** Admin: one store with its KYC (documentUrls parsed). */
  @SubscribeMessage('sellers:get')
  async sellersGet(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { id: string },
  ) {
    try {
      const user = this.requireUser(client);
      if (!this.isAdmin(user.role)) return fail('Admins only.');
      return ok(await this.sellersSvc.getForAdmin(String(body?.id ?? '')));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  @SubscribeMessage('sellers:storefront')
  async sellersStorefront(@MessageBody() body: { id: string }) {
    const s = await this.sellersSvc.storefront(body.id);
    return s ? ok(s) : fail('Store not found.');
  }

  @SubscribeMessage('sellers:register')
  async sellersRegister(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: SellerKycBody,
  ) {
    try {
      const user = this.requireUser(client);
      if (user.role !== 'seller') return fail('Only seller accounts can open a store.');
      const staff = await this.kit.ctx.membership(user.id);
      if (staff && staff.member !== 'owner') return fail('You work for a store as staff. Leave its team before opening your own store.');
      return ok(
        await this.sellersSvc.register({ id: user.id, name: user.name }, staff ? body : await this.kit.kycBody(user.id, body)),
      );
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  /** A rejected store (or a legacy pending one with no KYC) files its KYC again. */
  @SubscribeMessage('sellers:resubmit')
  async sellersResubmit(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: SellerKycBody,
  ) {
    try {
      const user = this.requireUser(client);
      // allowSuspended: the service explains why a suspended store cannot resubmit.
      const ctx = await this.kit.ctx.resolve(user, 'account', { allowSuspended: true });
      return ok(await this.sellersSvc.resubmit(ctx.actor.id, await this.kit.kycBody(ctx.actor.id, body)));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  @SubscribeMessage('sellers:setStatus')
  async sellersSetStatus(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { id: string; status: 'approved' | 'rejected' | 'suspended' | 'pending'; reason?: string },
  ) {
    try {
      const user = this.requireUser(client);
      if (!['admin', 'admin_moderation', 'admin_operations'].includes(user.role)) return fail('Not allowed.');
      oneOf(body?.status, ['approved', 'rejected', 'suspended', 'pending'] as const, 'Status');
      const seller = await this.sellersSvc.setStatus(body.id, body.status, body.reason);
      await this.audit.record({
        actor: user.name,
        role: user.role,
        action: `seller:${body.status}`,
        entity: 'seller',
        entityId: body.id,
        detail: seller.statusReason ?? undefined,
      });
      return ok(seller);
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  @SubscribeMessage('sellers:stats')
  async sellersStats(@ConnectedSocket() client: AuthedSocket) {
    try {
      const user = this.requireUser(client);
      const seller = (await this.kit.orNull(user, 'insight', { write: false }))?.seller;
      const sellerId = seller?.id;
      if (!sellerId) return ok({ products: 0, orders: 0, revenue: 0, paidOut: 0, pendingPayouts: 0 });
      return ok(await this.sellersSvc.stats(sellerId));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  /** The signed-in seller's own store entity (id, rating, status, badge). */
  @SubscribeMessage('sellers:mine')
  async sellersMine(@ConnectedSocket() client: AuthedSocket) {
    try {
      const user = this.requireUser(client);
      return ok(await this.kit.mine(user));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  /** Public: the seller subscription plans (from the `sellerPlans` setting). */
  @SubscribeMessage('sellers:plans')
  async sellersPlans() {
    return ok(await this.sellersSvc.plans());
  }

  /**
   * A seller buys a plan: wallet is charged now; mobile money returns a pending
   * payment and the plan activates when it succeeds (webhook or finance confirm).
   */
  @SubscribeMessage('sellers:subscribe')
  async sellersSubscribe(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { plan: string; method: string; phone?: string },
  ) {
    try {
      const user = this.requireUser(client);
      const ctx = await this.kit.ctx.resolve(user, 'account', { allowSuspended: true });
      return ok(await this.sellersSvc.subscribe(ctx.actor.id, body ?? ({} as never)));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  // ---- Analytics ----------------------------------------------------------
  @SubscribeMessage('analytics:admin')
  async analyticsAdmin(@ConnectedSocket() client: AuthedSocket) {
    try {
      const user = this.requireUser(client);
      if (!this.can(user.role, 'insight')) return fail('Not allowed.');
      return ok(await this.analytics.adminStats());
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  @SubscribeMessage('analytics:warehouse')
  async analyticsWarehouse(@ConnectedSocket() client: AuthedSocket, @MessageBody() body?: { hubId?: string }) {
    try {
      const user = this.requireUser(client);
      if (!this.isAdmin(user.role) && user.role !== 'warehouse_staff') {
        return fail('Staff only.');
      }
      // Staff see their own warehouse's figures; admins see all, or one warehouse when they ask.
      return ok(await this.analytics.warehouseStats(await this.hubScope(user, body?.hubId)));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  /** Daily revenue + order counts for the last `days` days (default 7, max 90), zero-filled. */
  @SubscribeMessage('analytics:revenue')
  async analyticsRevenue(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body?: { days?: number },
  ) {
    try {
      const user = this.requireUser(client);
      if (!this.can(user.role, 'insight')) return fail('Not allowed.');
      return ok(await this.analytics.revenueSeries(body?.days));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  /** Finance dashboard: GMV, commission, refunds, payouts, receivables, 30-day series. admin / admin_finance only. */
  @SubscribeMessage('analytics:finance')
  async analyticsFinance(@ConnectedSocket() client: AuthedSocket) {
    try {
      const user = this.requireUser(client);
      if (!this.can(user.role, 'finance')) return fail('Not allowed.');
      return ok(await this.analytics.financeStats());
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  /**
   * Seller analytics. A seller always gets THEIR OWN store (any sellerId sent is
   * ignored); admin / ops / finance must pass the `sellerId` of the store.
   */
  @SubscribeMessage('analytics:seller')
  async analyticsSeller(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body?: { days?: number; sellerId?: string; top?: number },
  ) {
    try {
      const user = this.requireUser(client);
      let seller;
      if (user.role === 'seller') {
        seller = (await this.kit.ctx.resolve(user, 'insight', { write: false })).seller;
      } else if (this.can(user.role, 'insight')) {
        seller = body?.sellerId ? await this.sellersSvc.get(String(body.sellerId)) : null;
        if (!seller) return fail('Choose a store (sellerId).');
      } else {
        return fail('Not allowed.');
      }
      return ok(await this.analytics.sellerStats(seller, clampDays(body?.days, 30), Number(body?.top) || 5));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  // ---- Audit / fraud / customers / broadcasts / roles (admin) ------------
  @SubscribeMessage('audit:list')
  async auditList(@ConnectedSocket() client: AuthedSocket) {
    try {
      const user = this.requireUser(client);
      if (!this.can(user.role, 'audit')) return fail('Not allowed.');
      return ok(await this.audit.list());
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  @SubscribeMessage('fraud:list')
  async fraudList(@ConnectedSocket() client: AuthedSocket) {
    try {
      const user = this.requireUser(client);
      if (!this.can(user.role, 'fraud')) return fail('Not allowed.');
      return ok(await this.fraud.list());
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  @SubscribeMessage('fraud:setStatus')
  async fraudSetStatus(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { id: string; status: 'open' | 'reviewed' | 'blocked' },
  ) {
    try {
      const user = this.requireUser(client);
      if (!this.can(user.role, 'fraud')) return fail('Not allowed.');
      oneOf(body?.status, ['open', 'reviewed', 'blocked'] as const, 'Status');
      return ok(await this.fraud.setStatus(body.id, body.status));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  @SubscribeMessage('customers:list')
  async customersList(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body?: { limit?: number; offset?: number },
  ) {
    try {
      const user = this.requireUser(client);
      if (!this.can(user.role, 'people')) return fail('Not allowed.');
      return ok(await this.customers.list(body));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  @SubscribeMessage('customers:setActive')
  async customersSetActive(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { id: string; active: boolean },
  ) {
    try {
      const user = this.requireUser(client);
      if (user.role !== 'admin' && user.role !== 'admin_support') return fail('Not allowed.');
      const active = body?.active === true;
      await this.customers.setActive(String(body?.id ?? ''), active, user.id);
      await this.audit.record({ actor: user.name, role: user.role, action: active ? 'user.reactivate' : 'user.suspend', entity: 'user', entityId: body.id });
      if (!active) this.kick(body.id); // suspended people lose their live sockets immediately
      return ok({ id: body.id, active });
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  @SubscribeMessage('broadcasts:list')
  async broadcastsList(@ConnectedSocket() client: AuthedSocket) {
    try {
      const user = this.requireUser(client);
      if (!this.can(user.role, 'content')) return fail('Not allowed.');
      return ok(await this.broadcasts.list());
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  @SubscribeMessage('broadcasts:send')
  async broadcastsSend(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { title: string; body: string; audience?: string },
  ) {
    try {
      const user = this.requireUser(client);
      if (!this.can(user.role, 'content')) return fail('Not allowed.');
      return ok(await this.broadcasts.send(user.name, body));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  @SubscribeMessage('roles:defs')
  async rolesDefs() {
    return ok(this.roles.defs());
  }

  /** Move a rider or warehouse staff member to a (different) warehouse. They always belong to one. */
  @SubscribeMessage('roles:setHub')
  async rolesSetHub(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { userId: string; hubId: string | null },
  ) {
    try {
      const user = this.requireUser(client);
      if (!this.can(user.role, 'hubs')) return fail('Not allowed.');
      const out = await this.roles.setHub(String(body?.userId ?? ''), body?.hubId ? String(body.hubId) : null);
      await this.audit.record({ actor: user.name, role: user.role, action: 'staff.hub', entity: 'user', entityId: out.id, detail: out.hubId ?? 'none' });
      // Reconnect them so their sockets join the new warehouse's rooms.
      this.kick(out.id);
      return ok(out);
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  /** A rider's home warehouse (profile). */
  @SubscribeMessage('rider:assignment')
  async riderAssignment(@ConnectedSocket() client: AuthedSocket) {
    try {
      const user = this.requireUser(client);
      if (user.role !== 'rider') return fail('Riders only.');
      return ok(await this.rider.assignment(user.id));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  @SubscribeMessage('roles:staff')
  async rolesStaff(@ConnectedSocket() client: AuthedSocket) {
    try {
      const user = this.requireUser(client);
      if (user.role !== 'admin') return fail('Super admin only.');
      return ok(await this.roles.staff());
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  @SubscribeMessage('roles:setRole')
  async rolesSetRole(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { id: string; role: string; hubId?: string | null },
  ) {
    try {
      const user = this.requireUser(client);
      if (user.role !== 'admin') return fail('Super admin only.');
      const role = oneOf(body?.role, ALL_ROLES, 'Role');
      const id = String(body?.id ?? '');
      if (id === user.id) return fail('You cannot change your own role.');
      await this.roles.setRole(id, role, body?.hubId ? String(body.hubId) : null);
      await this.audit.record({ actor: user.name, role: user.role, action: 'role.set', entity: 'user', entityId: id, detail: role });
      this.kick(id); // old privileges must not survive on an open socket
      return ok({ id, role });
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  /**
   * `staff:setActive { userId, active }`: the super admin switches a rider or a warehouse employee off or on. Off means no
   * sign-in, no open sockets, never offered as a driver, and not counted as a rider by the area routing (UC-8).
   */
  @SubscribeMessage('staff:setActive')
  async staffSetActive(@ConnectedSocket() client: AuthedSocket, @MessageBody() body: { userId?: string; active?: boolean }) {
    try {
      const user = this.requireUser(client);
      if (user.role !== 'admin') return fail('Super admin only.');
      if (typeof body?.active !== 'boolean') return fail('Active must be true or false.');
      const id = String(body?.userId ?? '');
      const done = await this.roles.setStaffActive(id, body.active);
      await this.audit.record({ actor: user.name, role: user.role, action: body.active ? 'staff.reactivate' : 'staff.deactivate', entity: 'user', entityId: id, detail: `${done.role} ${done.email}` });
      if (!body.active) this.kick(id); // switched-off people lose their live sockets immediately
      return ok(done);
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  /** Active riders (for dispatch screens: assign a task or build a batch). */
  @SubscribeMessage('warehouse:riders')
  async warehouseRiders(@ConnectedSocket() client: AuthedSocket, @MessageBody() body?: { hubId?: string }) {
    try {
      const user = this.requireUser(client);
      if (!this.isOps(user.role)) return fail('Ops only.');
      return ok(await this.rider.activeRiders(await this.hubScope(user, body?.hubId)));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  /** Super admin creates a rider / warehouse / admin sub-role account (temporary password returned once). */
  @SubscribeMessage('roles:createStaff')
  async rolesCreateStaff(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { email: string; name: string; role: string; phone?: string; hubId?: string; warehouseTier?: string },
  ) {
    try {
      const user = this.requireUser(client);
      if (user.role !== 'admin') return fail('Super admin only.');
      const role = oneOf(body?.role, ['rider', 'warehouse_staff', 'admin_operations', 'admin_finance', 'admin_support', 'admin_marketing', 'admin_moderation'] as const, 'Role');
      const email = str(body?.email, 'Email', { max: 200 }).toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail('Enter a valid email.');
      const created = await this.roles.createStaff({
        email,
        name: str(body?.name, 'Name', { min: 2, max: 100 }),
        role,
        phone: body?.phone ? str(body.phone, 'Phone', { max: 30 }) : null,
        hubId: body?.hubId ? String(body.hubId) : null,
        warehouseTier: body?.warehouseTier ? String(body.warehouseTier) : null,
      });
      await this.audit.record({ actor: user.name, role: user.role, action: 'staff.created', entity: 'user', entityId: created.id, detail: `${role} ${email}` });
      return ok(created);
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  // ---- Warehouse (staff/admin) -------------------------------------------
  @SubscribeMessage('warehouse:hubs')
  async whHubs(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body?: { activeOnly?: boolean },
  ) {
    try {
      if (!this.isOps(this.requireUser(client).role)) return fail('Staff only.');
      return ok(await this.warehouse.listHubs({ activeOnly: body?.activeOnly === true }));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  /** Admin / ops create (no `id`) or edit (`id`) a hub: name, city, country, capacity, address. */
  @SubscribeMessage('warehouse:saveHub')
  async whSaveHub(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: Record<string, unknown>,
  ) {
    try {
      const user = this.requireUser(client);
      if (!this.can(user.role, 'hubs')) return fail('Not allowed.');
      const hub = await this.warehouse.saveHub(body ?? {});
      await this.audit.record({ actor: user.name, role: user.role, action: body?.id ? 'hub.updated' : 'hub.created', entity: 'hub', entityId: hub.id, detail: hub.name });
      return ok(hub);
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  /** Admin / ops switch a hub on or off. */
  @SubscribeMessage('warehouse:setHubActive')
  async whSetHubActive(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { id: string; active: boolean },
  ) {
    try {
      const user = this.requireUser(client);
      if (!this.can(user.role, 'hubs')) return fail('Not allowed.');
      if (typeof body?.active !== 'boolean') return fail('Active must be true or false.');
      const hub = await this.warehouse.setHubActive(String(body?.id ?? ''), body.active);
      await this.audit.record({ actor: user.name, role: user.role, action: body.active ? 'hub.activated' : 'hub.deactivated', entity: 'hub', entityId: hub.id, detail: hub.name });
      return ok(hub);
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  @SubscribeMessage('warehouse:parcels')
  async whParcels(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { stage?: string; hubId?: string; limit?: number; offset?: number },
  ) {
    try {
      const user = this.requireUser(client);
      if (!this.isOps(user.role)) return fail('Staff only.');
      // Staff see their own warehouse's parcels; admins may look at one warehouse.
      return ok(await this.warehouse.parcels(body?.stage, body, await this.hubScope(user, body?.hubId)));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  @SubscribeMessage('warehouse:aged')
  async whAged(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body?: { hubId?: string; limit?: number; offset?: number },
  ) {
    try {
      const user = this.requireUser(client);
      if (!this.isOps(user.role)) return fail('Staff only.');
      return ok(await this.warehouse.aged(body, await this.hubScope(user, body?.hubId)));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  @SubscribeMessage('warehouse:inventory')
  async whInventory(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body?: { limit?: number; offset?: number; hubId?: string },
  ) {
    try {
      const user = this.requireUser(client);
      if (!this.isOps(user.role)) return fail('Staff only.');
      return ok(await this.warehouse.inventory(body, await this.hubScope(user, (body as { hubId?: string })?.hubId)));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  @SubscribeMessage('warehouse:batches')
  async whBatches(@ConnectedSocket() client: AuthedSocket, @MessageBody() body?: { hubId?: string }) {
    try {
      const user = this.requireUser(client);
      if (!this.isOps(user.role)) return fail('Staff only.');
      return ok(await this.warehouse.listBatches(await this.hubScope(user, body?.hubId)));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  /** Give several tasks to one rider (supervisor tier or above): same checks as `logistics:assign`, all or nothing. */
  @SubscribeMessage('warehouse:buildBatch')
  async whBuildBatch(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody()
    body: { hubId?: string; taskIds: string[]; riderId: string; riderName?: string },
  ) {
    try {
      const user = this.requireUser(client);
      if (!this.isOps(user.role)) return fail('Staff only.');
      const rider = await this.users.findById(String(body?.riderId ?? ''));
      if (!rider || rider.role !== 'rider' || !rider.active) return fail('Choose an active rider.');
      if (!Array.isArray(body.taskIds) || body.taskIds.length === 0 || body.taskIds.length > 200) return fail('Select 1–200 parcels.');
      return ok(await this.warehouse.buildBatch(await this.deskActor(user), body.taskIds.map(String), { id: rider.id, name: rider.name, hubId: rider.hubId ?? null }));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  @SubscribeMessage('warehouse:reconcile')
  async whReconcile(@ConnectedSocket() client: AuthedSocket, @MessageBody() body?: { hubId?: string }) {
    try {
      const user = this.requireUser(client);
      if (!this.isOps(user.role)) return fail('Staff only.');
      return ok(await this.warehouse.reconcile(await this.hubScope(user, body?.hubId)));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  @SubscribeMessage('warehouse:transfers')
  async whTransfers(@ConnectedSocket() client: AuthedSocket) {
    try {
      if (!this.isOps(this.requireUser(client).role)) return fail('Staff only.');
      return ok(await this.warehouse.listTransfers());
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  @SubscribeMessage('warehouse:createTransfer')
  async whCreateTransfer(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: Record<string, unknown>,
  ) {
    try {
      if (!this.isOps(this.requireUser(client).role)) return fail('Staff only.');
      return ok(await this.warehouse.createTransfer(body));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  // ---- Rider earnings -----------------------------------------------------
  @SubscribeMessage('rider:earnings')
  async riderEarnings(@ConnectedSocket() client: AuthedSocket) {
    try {
      const user = this.requireUser(client);
      return ok(await this.rider.earnings(user.id));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  /** The rider's delivery queue, enriched with order snapshots. */
  @SubscribeMessage('rider:tasks')
  async riderTasks(@ConnectedSocket() client: AuthedSocket) {
    try {
      const user = this.requireUser(client);
      if (user.role !== 'rider') return fail('Riders only.');
      return ok(await this.rider.queue(user.id));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  // ---- Marketing campaigns -----------------------------------------------
  @SubscribeMessage('campaigns:list')
  async campaignsList(@ConnectedSocket() client: AuthedSocket) {
    try {
      const user = this.requireUser(client);
      return ok(await this.campaigns.list((await this.sellerActor(user, 'catalog_read', { write: false })) as typeof user));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  @SubscribeMessage('campaigns:create')
  async campaignsCreate(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody()
    body: {
      name: string;
      nameFr?: string;
      discount?: number;
      productCount?: number;
      budgetUsd?: number;
      startDate?: string;
      endDate?: string;
      draft?: boolean;
    },
  ) {
    try {
      const user = this.requireUser(client);
      if (user.role !== 'seller' && !this.isAdmin(user.role)) {
        return fail('Only sellers or admins can create campaigns.');
      }
      if (user.role === 'seller') {
        const ctx = await this.kit.ctx.resolve(user, 'catalog');
        if (ctx.seller.status !== 'approved') return fail('Your store must be approved before you can run campaigns.');
        await this.kit.planGate.assert(ctx.seller, 'promotions');
        return ok(await this.campaigns.create(ctx.actor, body));
      }
      return ok(await this.campaigns.create(user, body));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  @SubscribeMessage('campaigns:update')
  async campaignsUpdate(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { id: string; patch: Record<string, unknown> },
  ) {
    try {
      const user = this.requireUser(client);
      if (user.role !== 'seller' && !this.isAdmin(user.role)) {
        return fail('Not allowed.');
      }
      const who = user.role === 'seller' ? (await this.kit.ctx.resolve(user, 'catalog')).actor : user;
      return ok(await this.campaigns.update(who, body.id, body.patch));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  /** The owning seller stops their campaign (any status but ended). */
  @SubscribeMessage('campaigns:withdraw')
  async campaignsWithdraw(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { id: string },
  ) {
    try {
      const user = this.requireUser(client);
      if (user.role !== 'seller') return fail('Only the seller can withdraw a campaign.');
      const ctx = await this.kit.ctx.resolve(user, 'catalog');
      return ok(await this.campaigns.withdraw(ctx.actor, String(body?.id ?? '')));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  @SubscribeMessage('campaigns:setStatus')
  async campaignsSetStatus(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody()
    body: {
      id: string;
      status: 'draft' | 'pending' | 'scheduled' | 'active' | 'ended' | 'rejected';
      reason?: string;
    },
  ) {
    try {
      const user = this.requireUser(client);
      if (!this.isAdmin(user.role)) return fail('Admins only.');
      oneOf(body?.status, ['draft', 'pending', 'scheduled', 'active', 'ended', 'rejected'] as const, 'Status');
      return ok(await this.campaigns.setStatus(body.id, body.status, body.reason));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  // ---- Warehouse exceptions ----------------------------------------------
  @SubscribeMessage('exceptions:list')
  async exceptionsList(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { status?: string },
  ) {
    try {
      const user = this.requireUser(client);
      if (!this.isOps(user.role)) return fail('Ops only.');
      return ok(await this.warehouse.listExceptions(body?.status, user.role === 'warehouse_staff' ? await this.hubScope(user) : null));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  @SubscribeMessage('exceptions:create')
  async exceptionsCreate(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody()
    body: {
      taskId?: string;
      orderReference?: string;
      type?: 'damaged' | 'missing_item' | 'wrong_item' | 'address_issue' | 'lost' | 'other';
      severity?: 'low' | 'medium' | 'high';
      hub?: string;
      notes: string;
    },
  ) {
    try {
      const user = this.requireUser(client);
      if (!this.isOps(user.role)) return fail('Ops only.');
      if (!body?.notes) return fail('notes is required.');
      return ok(await this.warehouse.createException(user.name, body, user.role === 'warehouse_staff' ? await this.hubScope(user) : null));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  @SubscribeMessage('exceptions:setStatus')
  async exceptionsSetStatus(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody()
    body: {
      id: string;
      status: 'open' | 'investigating' | 'resolved' | 'escalated';
      resolution?: string;
    },
  ) {
    try {
      const user = this.requireUser(client);
      if (!this.isOps(user.role)) return fail('Ops only.');
      return ok(
        await this.warehouse.setExceptionStatus(body.id, body.status, body.resolution, user.role === 'warehouse_staff' ? await this.hubScope(user) : null),
      );
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  // ---- Additional flows (audit gaps) -------------------------------------
  /** Customer cancels their own order (restock + refund + void delivery). */
  @SubscribeMessage('orders:cancel')
  async ordersCancel(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { orderId: string },
  ) {
    try {
      const user = this.requireUser(client);
      return ok(await this.orders.cancel(user, body.orderId));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  /** Seller/admin remove one of their listings (soft-delete). */
  @SubscribeMessage('products:delete')
  async productsDelete(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { id: string },
  ) {
    try {
      const user = this.requireUser(client);
      const existing = await this.products.get(body.id);
      if (!existing) return fail('Product not found.');
      const seller = await this.sellerFor(user, 'catalog');
      const isOwner =
        existing.sellerId === user.id ||
        (seller != null && existing.sellerId === seller.id);
      if (!isOwner && !this.isAdmin(user.role)) {
        return fail('You can only remove your own products.');
      }
      return ok(await this.products.remove(body.id));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  /** Seller updates their own store profile. */
  @SubscribeMessage('sellers:update')
  async sellersUpdate(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { name?: string; pickupAddress?: string | null; pickupLat?: number | null; pickupLng?: number | null; pickupAreaId?: string | null; logoUrl?: string | null; bannerUrl?: string | null; description?: string | null; descriptionFr?: string | null },
  ) {
    try {
      const user = this.requireUser(client);
      const ctx = await this.kit.ctx.resolve(user, 'storefront');
      // Vacation mode, handling time and policies are validated first, so a bad value saves nothing.
      if (touchesStorefront(body)) await this.kit.storefront.update(ctx, body as never);
      return ok(
        await this.sellersSvc.updateProfile(ctx.actor.id, {
          name: body?.name,
          pickupAddress: body?.pickupAddress,
          pickupLat: body?.pickupLat,
          pickupLng: body?.pickupLng,
          pickupAreaId: body?.pickupAreaId,
          logoUrl: body?.logoUrl,
          bannerUrl: body?.bannerUrl,
          description: body?.description,
          descriptionFr: body?.descriptionFr,
        }),
      );
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  // ---- Wishlist -----------------------------------------------------------
  @SubscribeMessage('wishlist:list')
  async wishlistList(@ConnectedSocket() client: AuthedSocket) {
    try {
      const user = this.requireUser(client);
      return ok(await this.wishlist.list(user.id));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  @SubscribeMessage('wishlist:toggle')
  async wishlistToggle(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { productId: string },
  ) {
    try {
      const user = this.requireUser(client);
      if (!body?.productId) return fail('productId is required.');
      return ok(await this.wishlist.toggle(user.id, body.productId));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  /** Ops assign an unassigned delivery task to a specific rider. */
  @SubscribeMessage('delivery:assign')
  async deliveryAssign(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { taskId: string; riderId: string; riderName?: string },
  ) {
    try {
      const user = this.requireUser(client);
      if (!this.isOps(user.role)) return fail('Ops only.');
      // Same rules as `logistics:assign`: supervisor tier or above, the task's warehouse, a rider who may run it.
      return ok(await this.logistics.assign(String(body?.taskId ?? ''), String(body?.riderId ?? ''), await this.deskActor(user)));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  // ---- Own account: profile, preferences, password, deletion -------------
  @SubscribeMessage('me:get')
  async meGet(@ConnectedSocket() client: AuthedSocket) {
    try {
      const user = this.requireUser(client);
      const row = await this.users.findById(user.id);
      return row ? ok(UsersService.toPublic(row)) : fail('Account not found.');
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  @SubscribeMessage('me:update')
  async meUpdate(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody()
    body: { name?: string; phone?: string | null; locale?: string; avatar?: string | null },
  ) {
    try {
      const user = this.requireUser(client);
      const saved = await this.users.updateProfile(user.id, body ?? {});
      client.data.user = { ...user, name: saved.name };
      const pub = UsersService.toPublic(saved);
      this.emitter.toUser(user.id, 'me:updated', pub);
      return ok(pub);
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  @SubscribeMessage('me:prefs')
  async mePrefs(@ConnectedSocket() client: AuthedSocket) {
    try {
      const user = this.requireUser(client);
      const row = await this.users.findById(user.id);
      return ok(UsersService.parsePrefs(row?.prefs ?? null));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  @SubscribeMessage('me:setPrefs')
  async meSetPrefs(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: Record<string, unknown>,
  ) {
    try {
      const user = this.requireUser(client);
      return ok(await this.users.setPrefs(user.id, body ?? {}));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  /** Returns FRESH tokens: other devices are signed out, this one continues. */
  @SubscribeMessage('me:changePassword')
  async meChangePassword(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { current: string; next: string },
  ) {
    try {
      const user = this.requireUser(client);
      return ok(await this.auth.changePassword(user.id, body?.current, body?.next));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  /** Customers/sellers erase their own account (staff accounts are managed by admins). */
  @SubscribeMessage('me:delete')
  async meDelete(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { password: string },
  ) {
    try {
      const user = this.requireUser(client);
      if (user.role !== 'customer' && user.role !== 'seller') {
        return fail('Staff accounts are removed by an administrator.');
      }
      if (user.role === 'seller') await this.kit.account.check(user); // open orders / unpaid earnings block closing a store
      await this.auth.deleteAccount(user.id, body?.password);
      if (user.role === 'seller') await this.kit.account.finish(user);
      await this.kit.chat.forgetBuyer(user.id);
      for (const a of await this.addresses.list(user.id)) {
        await this.addresses.remove(user.id, a.id);
      }
      await this.push.unregisterUser(user.id);
      // Let the ack flush before dropping the connection.
      setTimeout(() => client.disconnect(true), 150);
      return ok({ deleted: true });
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  // ---- Push (FCM) device registry ----------------------------------------
  /** Register this device's FCM token so the backend can push to a closed app. */
  @SubscribeMessage('devices:register')
  async devicesRegister(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody()
    body: { token: string; platform?: 'android' | 'ios' | 'web'; app?: 'customer' | 'rider' | 'web' },
  ) {
    try {
      const user = this.requireUser(client);
      await this.push.register(user, body);
      return ok({ registered: true, pushEnabled: this.push.enabled });
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  /** Forget this device's token (call on logout). */
  @SubscribeMessage('devices:unregister')
  async devicesUnregister(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { token: string },
  ) {
    try {
      const user = this.requireUser(client);
      await this.push.unregister(body.token, user.id);
      return ok({ unregistered: true });
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  /** Send a test notice to the caller: proves in-app delivery now, and push once Firebase is configured. */
  @SubscribeMessage('devices:test')
  async devicesTest(@ConnectedSocket() client: AuthedSocket) {
    try {
      const user = this.requireUser(client);
      return ok(await this.notifications.test(user));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

}
