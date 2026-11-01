import { ConnectedSocket, MessageBody, SubscribeMessage, WebSocketGateway } from '@nestjs/websockets';
import type { Socket } from 'socket.io';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { User } from '../database/entities';
import { callerLocale } from '../common/locale';
import { CampaignsService } from '../flows/campaigns.service';
import { CouponsService } from '../content/coupons.service';
import { PromosService } from '../content/promos.service';
import { SellerOrdersService } from '../orders/seller-orders.service';
import { AuditService } from '../ops/audit.service';
import { limitSocket } from '../common/socket-limit';
import { sellerContext } from '../sellers/seller-context';
import type { SellerContext } from '../sellers/seller-context';
import type { SellerPermission } from '../sellers/seller-permissions';
import { PlanGateService } from '../sellers/plan-gate';
import { ProductImportService } from './product-import.service';

type SocketUser = { id: string; role: string; name: string };
type AuthedSocket = Socket & { data: { user?: { id: string; role: string; name?: string } } };

const ok = <T>(data: T) => ({ ok: true as const, data });
const fail = (error: string) => ({ ok: false as const, error });

/** Who may run marketing: flash-sale decisions, campaign review. */
const CONTENT_ROLES = ['admin', 'admin_marketing'];

/**
 * Commerce events that live outside RealtimeGateway (same Socket.IO server, same handshake auth): campaign
 * tracking and submission, flash-sale edits / nominations, store coupons, bulk product import, and the seller's paged
 * order list. See docs/contracts/commerce.md for every payload.
 */
@WebSocketGateway({ cors: { origin: true, credentials: true } })
export class CommerceGateway {
  constructor(
    private readonly campaigns: CampaignsService,
    private readonly promos: PromosService,
    private readonly coupons: CouponsService,
    private readonly imports: ProductImportService,
    private readonly sellerOrders: SellerOrdersService,
    private readonly audit: AuditService,
    private readonly planGate: PlanGateService,
    @InjectDataSource() private readonly ds: DataSource,
  ) {}

  private user(client: AuthedSocket): SocketUser {
    limitSocket(client);
    const u = client.data?.user;
    if (!u || u.role === 'guest') throw new Error('Sign in to continue.');
    return { id: u.id, role: u.role, name: u.name ?? '' };
  }

  /**
   * The store the caller works for (the owner, or a team member whose role has `permission`): services key everything by
   * the owner's account, so they get `ctx.actor`. A suspended store keeps `write: false` calls only.
   */
  private async seller(client: AuthedSocket, permission: SellerPermission, write = true): Promise<SellerContext> {
    return sellerContext(this.user(client), permission, { write });
  }

  private marketing(client: AuthedSocket): SocketUser {
    const u = this.user(client);
    if (!CONTENT_ROLES.includes(u.role)) throw new Error('Not allowed.');
    return u;
  }

  // ---- campaigns -------------------------------------------------------------
  /**
   * `campaigns:track { campaignId, kind: 'view' | 'click' }`: a shopper saw / opened a promoted product. Open to
   * guests; counted only while the campaign is discounting, rate-limited per shopper. Replies `{ counted }`.
   */
  @SubscribeMessage('campaigns:track')
  async track(@ConnectedSocket() client: AuthedSocket, @MessageBody() body: { campaignId?: string; kind?: string }) {
    try {
      limitSocket(client);
      const u = client.data?.user;
      const who = !u || u.role === 'guest' ? `guest:${client.id}` : u.id;
      // Staff browsing the shop do not inflate a seller's numbers.
      if (u && u.role !== 'customer' && u.role !== 'guest') return ok({ counted: false });
      return ok(await this.campaigns.track(who, String(body?.campaignId ?? ''), body?.kind));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  /** `campaigns:submit { id }`: a seller sends a saved draft (or fixes a rejected campaign and resends it). */
  @SubscribeMessage('campaigns:submit')
  async submit(@ConnectedSocket() client: AuthedSocket, @MessageBody() body: { id?: string }) {
    try {
      return ok(await this.campaigns.submit((await this.seller(client, 'catalog')).actor, String(body?.id ?? '')));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  // ---- flash sales -------------------------------------------------------------
  /** `flashsales:update { id, patch }`: marketing edits a sale (price, dates, titles, on/off). */
  @SubscribeMessage('flashsales:update')
  async flashUpdate(@ConnectedSocket() client: AuthedSocket, @MessageBody() body: { id?: string; patch?: Record<string, unknown> }) {
    try {
      const u = this.marketing(client);
      const sale = await this.promos.updateFlashSale(String(body?.id ?? ''), body?.patch ?? {});
      await this.audit.record({ actor: u.name || u.id, role: u.role, action: 'flashsale.update', entity: 'flashsale', entityId: sale.id, detail: sale.title });
      return ok(sale);
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  /** `flashsales:delete { id }` */
  @SubscribeMessage('flashsales:delete')
  async flashDelete(@ConnectedSocket() client: AuthedSocket, @MessageBody() body: { id?: string }) {
    try {
      const u = this.marketing(client);
      const res = await this.promos.deleteFlashSale(String(body?.id ?? ''));
      await this.audit.record({ actor: u.name || u.id, role: u.role, action: 'flashsale.delete', entity: 'flashsale', entityId: res.id });
      return ok(res);
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  /** `flashsales:mine`: the sales on the signed-in store's products, and its nominations with their status. */
  @SubscribeMessage('flashsales:mine')
  async flashMine(@ConnectedSocket() client: AuthedSocket) {
    try {
      const ctx = await this.seller(client, 'catalog_read', false);
      return ok(await this.promos.flashSalesOfStore(ctx.ownerIds));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  /** `flashsales:nominate { productId, flashPrice, endsAt, startsAt?, title?, titleFr?, discount? }` */
  @SubscribeMessage('flashsales:nominate')
  async flashNominate(@ConnectedSocket() client: AuthedSocket, @MessageBody() body: Record<string, unknown>) {
    try {
      const ctx = await this.seller(client, 'catalog');
      if (ctx.seller.status !== 'approved') return fail('Your store must be approved before you can propose a flash sale.');
      await this.planGate.assert(ctx.seller, 'flashNomination');
      return ok(await this.promos.nominate(ctx.seller, body ?? {}));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  /** `flashsales:approve { id }` */
  @SubscribeMessage('flashsales:approve')
  async flashApprove(@ConnectedSocket() client: AuthedSocket, @MessageBody() body: { id?: string }) {
    try {
      const u = this.marketing(client);
      const sale = await this.promos.decide(String(body?.id ?? ''), true);
      await this.audit.record({ actor: u.name || u.id, role: u.role, action: 'flashsale.approve', entity: 'flashsale', entityId: sale.id, detail: sale.title });
      return ok(sale);
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  /** `flashsales:decline { id, reason }` */
  @SubscribeMessage('flashsales:decline')
  async flashDecline(@ConnectedSocket() client: AuthedSocket, @MessageBody() body: { id?: string; reason?: string }) {
    try {
      const u = this.marketing(client);
      const sale = await this.promos.decide(String(body?.id ?? ''), false, body?.reason);
      await this.audit.record({ actor: u.name || u.id, role: u.role, action: 'flashsale.decline', entity: 'flashsale', entityId: sale.id, detail: sale.rejectReason ?? '' });
      return ok(sale);
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  // ---- store coupons -----------------------------------------------------------
  /** `coupons:list { sellerId? }`: a seller's own coupons; marketing sees every store's. */
  @SubscribeMessage('coupons:list')
  async couponList(@ConnectedSocket() client: AuthedSocket, @MessageBody() body?: { sellerId?: string }) {
    try {
      const u = this.user(client);
      if (u.role === 'seller') return ok(await this.coupons.list((await this.seller(client, 'catalog_read', false)).actor));
      if (!CONTENT_ROLES.includes(u.role)) return fail('Not allowed.');
      return ok(await this.coupons.list(u, body?.sellerId ? String(body.sellerId) : undefined));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  /** `coupons:store { sellerId }`: PUBLIC. The coupons a store page may show (active, public, unexpired). */
  @SubscribeMessage('coupons:store')
  async couponStore(@ConnectedSocket() client: AuthedSocket, @MessageBody() body: { sellerId?: string }) {
    try {
      limitSocket(client);
      return ok(await this.coupons.publicOf(String(body?.sellerId ?? '')));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  /** `coupons:create { code, type: 'percent' | 'fixed', value, minOrder?, maxUses?, perUserLimit?, expiresAt?, isPublic?, description? }` */
  @SubscribeMessage('coupons:create')
  async couponCreate(@ConnectedSocket() client: AuthedSocket, @MessageBody() body: Record<string, unknown>) {
    try {
      const ctx = await this.seller(client, 'catalog');
      await this.planGate.assert(ctx.seller, 'coupons');
      return ok(await this.coupons.create(ctx.actor.id, body ?? {}));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  /** `coupons:update { id, patch }` */
  @SubscribeMessage('coupons:update')
  async couponUpdate(@ConnectedSocket() client: AuthedSocket, @MessageBody() body: { id?: string; patch?: Record<string, unknown> }) {
    try {
      return ok(await this.coupons.update((await this.seller(client, 'catalog')).actor.id, String(body?.id ?? ''), body?.patch ?? {}));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  /** `coupons:setActive { id, active }` */
  @SubscribeMessage('coupons:setActive')
  async couponActive(@ConnectedSocket() client: AuthedSocket, @MessageBody() body: { id?: string; active?: boolean }) {
    try {
      if (typeof body?.active !== 'boolean') return fail('Active must be true or false.');
      return ok(await this.coupons.setActive((await this.seller(client, 'catalog')).actor.id, String(body?.id ?? ''), body.active));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  /** `coupons:delete { id }`: removes an unused coupon; a used one is switched off instead (`deleted: false`). */
  @SubscribeMessage('coupons:delete')
  async couponDelete(@ConnectedSocket() client: AuthedSocket, @MessageBody() body: { id?: string }) {
    try {
      return ok(await this.coupons.remove((await this.seller(client, 'catalog')).actor.id, String(body?.id ?? '')));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  // ---- products ----------------------------------------------------------------
  /** `products:import { rows? | csv? | csvUrl?, dryRun?, sellerId? }` -> a per-row report; valid rows become pending products. */
  @SubscribeMessage('products:import')
  async productsImport(@ConnectedSocket() client: AuthedSocket, @MessageBody() body: Record<string, unknown>) {
    try {
      const u = this.user(client);
      if (u.role === 'seller') {
        const ctx = await this.seller(client, 'catalog');
        await this.planGate.assert(ctx.seller, 'bulkImport');
        return ok(await this.imports.import(ctx.actor, body ?? {}));
      }
      return ok(await this.imports.import(u, body ?? {}));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  /** `products:importTemplate`: a CSV to start from, and its column names. */
  @SubscribeMessage('products:importTemplate')
  async importTemplate(@ConnectedSocket() client: AuthedSocket) {
    try {
      const u = this.user(client);
      if (u.role === 'seller') await this.seller(client, 'catalog_read', false);
      else if (!u.role.startsWith('admin')) return fail('Sellers only.');
      return ok(this.imports.template());
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  // ---- seller orders -------------------------------------------------------------
  /** `orders:sellerList { limit?, offset?, q?, status?, from?, to?, format?: 'csv' }` -> `{ items, total, limit, offset }` (or the CSV). */
  @SubscribeMessage('orders:sellerList')
  async sellerOrderList(@ConnectedSocket() client: AuthedSocket, @MessageBody() body?: Record<string, unknown>) {
    try {
      const ctx = await this.seller(client, 'orders', false);
      const input = body ?? {};
      if (input.format === 'csv') {
        // Headings and labels in the language of whoever asked (a team member keeps their own).
        const locale = await callerLocale(this.ds.getRepository(User), ctx.user.id, input.locale);
        return ok(await this.sellerOrders.csv(ctx.actor, ctx.seller.id, { ...input, locale }));
      }
      return ok(await this.sellerOrders.page(ctx.actor, ctx.seller.id, input));
    } catch (e) {
      return fail((e as Error).message);
    }
  }
}
