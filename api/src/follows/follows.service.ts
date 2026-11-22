import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Notification, Product, Seller, StoreFollow } from '../database/entities';
import { pageOf } from '../common/paging';
import { followerTitle, frenchNotice } from '../notifications/localize';
import { NotificationsService } from '../notifications/notifications.service';
import { RealtimeEmitter } from '../realtime/realtime-emitter';
import { ProductsService, ServedProduct } from '../products/products.service';

/** A customer follows at most this many stores. */
export const MAX_FOLLOWS = 200;
/** Notices go out in batches so a store with many followers never holds the listing change up. */
const BATCH = 100;

/** What a follower sees of a store: public fields only (never the owner's account id, address or KYC). */
export interface FollowedStore {
  id: string;
  name: string;
  logoUrl: string | null;
  bannerUrl: string | null;
  rating: number;
  badge: string;
  productCount: number;
  followedAt: Date;
}

export interface FollowState {
  sellerId: string;
  following: boolean;
  followers: number;
}

/**
 * Following a store (customer app). A follow is one row per customer and store (unique index); following twice or
 * unfollowing a store that is not followed changes nothing. When one of the store's listings becomes visible to
 * shoppers, every follower gets one notice (saved in the bell and pushed), once per product.
 */
@Injectable()
export class FollowsService implements OnModuleInit {
  private readonly logger = new Logger(FollowsService.name);

  constructor(
    @InjectRepository(StoreFollow) private readonly follows: Repository<StoreFollow>,
    @InjectRepository(Seller) private readonly sellers: Repository<Seller>,
    @InjectRepository(Product) private readonly products: Repository<Product>,
    @InjectRepository(Notification) private readonly notices: Repository<Notification>,
    private readonly notifications: NotificationsService,
    private readonly emitter: RealtimeEmitter,
    private readonly productsSvc: ProductsService,
  ) {}

  onModuleInit(): void {
    this.productsSvc.onWentLive(async (p) => void (await this.tellFollowers(p)));
  }

  /** The public store a client means: the store id, or (older listings) its owner's account id. */
  private async storeOf(ref: unknown): Promise<Seller> {
    const id = String(ref ?? '').trim();
    if (!id) throw new BadRequestException('Choose a store to follow.');
    const store = (await this.sellers.findOne({ where: { id } })) ?? (await this.sellers.findOne({ where: { userId: id } }));
    if (!store || store.status !== 'approved') throw new NotFoundException('Store not found.');
    return store;
  }

  async state(userId: string | null, ref: unknown): Promise<FollowState> {
    const store = await this.storeOf(ref);
    return this.stateOf(userId, store.id);
  }

  private async stateOf(userId: string | null, sellerId: string): Promise<FollowState> {
    const [followers, mine] = await Promise.all([
      this.follows.count({ where: { sellerId } }),
      userId ? this.follows.count({ where: { sellerId, userId } }) : Promise.resolve(0),
    ]);
    return { sellerId, following: mine > 0, followers };
  }

  /**
   * Follow (`want` true), unfollow (false) or flip (undefined). C-F1: a store owner cannot follow their own store;
   * C-F2: at most {@link MAX_FOLLOWS} stores per customer. Both are enforced here and by the unique index for duplicates.
   */
  async toggle(user: { id: string }, ref: unknown, want?: boolean): Promise<FollowState> {
    const store = await this.storeOf(ref);
    if (store.userId === user.id) throw new BadRequestException('This is your own store.');
    const existing = await this.follows.findOne({ where: { userId: user.id, sellerId: store.id } });
    const follow = want ?? !existing;
    if (follow && !existing) {
      if ((await this.follows.count({ where: { userId: user.id } })) >= MAX_FOLLOWS) {
        throw new BadRequestException(`You can follow up to ${MAX_FOLLOWS} stores. Unfollow one first.`);
      }
      try {
        await this.follows.insert({ userId: user.id, sellerId: store.id });
      } catch {
        /* a second tap at the same moment: the unique index kept it to one row */
      }
    } else if (!follow && existing) {
      await this.follows.delete({ userId: user.id, sellerId: store.id });
    }
    const state = await this.stateOf(user.id, store.id);
    // The customer's other devices follow along.
    this.emitter.toUser(user.id, 'follows:updated', state);
    return state;
  }

  /** The stores a customer follows, most recently followed first. */
  async list(userId: string, paging?: unknown): Promise<FollowedStore[]> {
    const { take, skip } = pageOf(paging);
    const rows = await this.follows.find({ where: { userId }, order: { createdAt: 'DESC', id: 'ASC' }, take, skip });
    if (!rows.length) return [];
    const stores = new Map((await this.sellers.find({ where: { id: In(rows.map((r) => r.sellerId)) } })).map((s) => [s.id, s]));
    const out: FollowedStore[] = [];
    for (const r of rows) {
      const s = stores.get(r.sellerId);
      // A store that is gone or no longer approved drops out of the list (the row stays, so it returns if reinstated).
      if (!s || s.status !== 'approved') continue;
      out.push({
        id: s.id,
        name: s.name,
        logoUrl: s.logoUrl ?? null,
        bannerUrl: s.bannerUrl ?? null,
        rating: s.rating ?? 0,
        badge: s.badge,
        productCount: await this.products.count({ where: { sellerId: In([s.id, ...(s.userId ? [s.userId] : [])]), status: 'live' } }),
        followedAt: r.createdAt,
      });
    }
    return out;
  }

  /** How many customers follow a store (for the owner's dashboard). */
  followerCount(sellerId: string): Promise<number> {
    return this.follows.count({ where: { sellerId } });
  }

  /**
   * A listing just became visible: one notice to every follower of its store, once per product (a listing that goes
   * live again after an edit does not notify twice). Returns how many followers were told.
   */
  async tellFollowers(product: Pick<ServedProduct, 'id' | 'name' | 'nameFr' | 'sellerId'>): Promise<number> {
    if (!product.sellerId) return 0;
    const store = (await this.sellers.findOne({ where: { id: product.sellerId } })) ?? (await this.sellers.findOne({ where: { userId: product.sellerId } }));
    if (!store || store.status !== 'approved') return 0;
    if (await this.notices.count({ where: { type: 'store', entityId: product.id } })) return 0;
    const followers = await this.followerIds(store);
    if (!followers.length) return 0;
    const title = 'New from a store you follow';
    const body = `${store.name}: ${product.name}`;
    // The title's French is the standard table's; the body carries the product's French name.
    const fr = { title: frenchNotice({ title, body })?.title ?? title, body: `${store.name} : ${product.nameFr || product.name}` };
    for (let i = 0; i < followers.length; i += BATCH) {
      await this.notifications
        .toUsers(followers.slice(i, i + BATCH), { title, body, type: 'store', entityId: product.id, fr })
        .catch((e) => this.logger.warn(`follower notice failed: ${(e as Error).message}`));
    }
    return followers.length;
  }
  /** The store a listing, deal or promotion belongs to (its id, or an older row's owner account id), when shoppers can see it. */
  private async approvedStore(ref: string | null | undefined): Promise<Seller | null> {
    if (!ref) return null;
    const store = (await this.sellers.findOne({ where: { id: ref } })) ?? (await this.sellers.findOne({ where: { userId: ref } }));
    return store && store.status === 'approved' ? store : null;
  }

  /** Every follower of a store, the owner excluded. */
  private async followerIds(store: Seller): Promise<string[]> {
    return (await this.follows.find({ where: { sellerId: store.id }, select: ['userId'] })).map((f) => f.userId).filter((id) => id !== store.userId);
  }

  /**
   * A store's deal started or its promotion went live: every follower gets one notice (saved in the bell and pushed, in
   * the `promo` category so Settings can mute it), once per (type, entityId) and follower. A sweep that runs again, a
   * sale that is edited, a coupon that is switched off and on, or a second instance finds the follower already told and
   * sends nothing. `deal` = a flash sale (opens the deals page); `promotion` = a seller campaign or a public coupon
   * (their entity id is `<store id>:<campaign or coupon id>`, so the notice can open the store). Returns how many were told.
   */
  async notifyFollowers(input: {
    storeRef: string | null | undefined;
    kind: 'deal' | 'promotion';
    type: 'flash' | 'campaign' | 'promo';
    sourceId: string;
    body: string;
    bodyFr: string;
  }): Promise<number> {
    const store = await this.approvedStore(input.storeRef);
    if (!store) return 0;
    const followers = await this.followerIds(store);
    if (!followers.length) return 0;
    const entityId = input.type === 'flash' ? input.sourceId : `${store.id}:${input.sourceId}`;
    const titles = followerTitle(input.kind, store.name);
    const fr = { title: titles.fr, body: input.bodyFr };
    let told = 0;
    for (let i = 0; i < followers.length; i += BATCH) {
      const chunk = followers.slice(i, i + BATCH);
      try {
        const done = new Set((await this.notices.find({ where: { type: input.type, entityId, userId: In(chunk) }, select: ['userId'] })).map((n) => n.userId));
        const todo = chunk.filter((id) => !done.has(id));
        if (!todo.length) continue;
        const title = titles.en;
        const body = input.body;
        await this.notifications.toUsers(todo, { title, body, type: input.type, entityId, fr });
        told += todo.length;
      } catch (e) {
        this.logger.warn(`follower notice failed: ${(e as Error).message}`);
      }
    }
    return told;
  }
}
