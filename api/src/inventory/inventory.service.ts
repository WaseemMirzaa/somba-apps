import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { MANUAL_REASONS, Order, OrderItem, Product, Seller } from '../database/entities';
import type { StockMovement, StockReason } from '../database/entities';
import { ProductsService } from '../products/products.service';
import type { StockChange } from '../products/products.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RealtimeEmitter } from '../realtime/realtime-emitter';
import { DEFAULT_VARIANT, checkVariant, storedVariantGroups } from '../common/variants/variants';
import { availableFor, poolOf } from '../products/variant-stock';
import { CartService } from '../cart/cart.service';

/** Orders whose units are still on their way to the customer: stock reserved for them is not sellable. */
const OPEN_ORDER = ['pending', 'confirmed', 'processing', 'shipped', 'out_for_delivery'];

export const DEFAULT_LOW_STOCK = 10;
const MAX_THRESHOLD = 100_000;

/** Did a change take a count from above the line to on or below it? (Only decreases cross downwards.) */
export function crossedDown(before: number, after: number, line: number): boolean {
  return after < before && before > line && after <= line;
}

export interface CartCheck {
  productId: string;
  variant: string;
  requested: number;
  available: number;
  ok: boolean;
  /** Why it is not ok, in words the shopper can act on. */
  reason?: string;
}

@Injectable()
export class InventoryService implements OnModuleInit {
  private readonly logger = new Logger(InventoryService.name);

  constructor(
    @InjectRepository(Product) private readonly productRepo: Repository<Product>,
    @InjectRepository(Seller) private readonly sellers: Repository<Seller>,
    @InjectRepository(OrderItem) private readonly items: Repository<OrderItem>,
    private readonly products: ProductsService,
    private readonly notifications: NotificationsService,
    private readonly emitter: RealtimeEmitter,
    private readonly cart?: CartService,
  ) {}

  onModuleInit(): void {
    this.products.onStockChange((c) => this.afterChange(c));
  }

  // ---- low stock -----------------------------------------------------------
  /** The store behind a product's `sellerId` (a store id, or on old demo data its owner's user id). */
  private storeOfProduct(sellerId: string | null): Promise<Seller | null> {
    if (!sellerId) return Promise.resolve(null);
    return this.sellers.findOne({ where: [{ id: sellerId }, { userId: sellerId }] });
  }

  /**
   * After a sale (or any decrease): tell the store ONCE when a product crosses its low-stock line, and again when it
   * runs out; tell operations too. "Once per crossing": restocking above the line re-arms it, because the next
   * decrease then crosses it again. The count used is the option's own when it has one.
   */
  private async afterChange(c: StockChange): Promise<void> {
    if (c.delta >= 0) return;
    const store = await this.storeOfProduct(c.sellerId);
    const line = Math.max(0, store?.lowStockThreshold ?? DEFAULT_LOW_STOCK);
    const before = c.entryBefore ?? c.before;
    const after = c.entryAfter ?? c.after;
    const out = before > 0 && after <= 0;
    const low = !out && crossedDown(before, after, line);
    if (!out && !low) return;
    const name = (await this.products.names([c.productId])).get(c.productId)?.name ?? 'A product';
    const label = c.variant ? `${name} (${c.variant})` : name;
    const payload = { productId: c.productId, variant: c.variant, stock: after, threshold: line, outOfStock: out };
    if (store?.userId) {
      this.emitter.toUser(store.userId, 'stock:low', payload);
      await this.notifications.toUser(store.userId, out
        ? { title: 'Out of stock', body: `${label} is out of stock. Shoppers cannot buy it until you restock.`, type: 'stock', entityId: c.productId }
        : { title: 'Low stock', body: `${label} is down to ${after} (alert at ${line}). Restock soon.`, type: 'stock', entityId: c.productId });
    }
    for (const role of ['admin', 'admin_operations']) {
      this.emitter.toRole(role, 'stock:low', { ...payload, sellerId: c.sellerId });
      await this.notifications.toRole(role, {
        title: 'Low stock alert',
        body: out ? `${label} from ${store?.name ?? 'a seller'} is out of stock.` : `${label} from ${store?.name ?? 'a seller'} is down to ${after}.`,
        type: 'stock',
        entityId: c.productId,
      });
    }
  }

  // ---- who may touch a product --------------------------------------------
  private async ownedProduct(user: { id: string; role: string }, productId: string): Promise<Product> {
    const product = await this.products.getRaw(String(productId ?? ''));
    if (!product || product.status === 'removed') throw new NotFoundException('Product not found.');
    if (user.role.startsWith('admin')) return product;
    const seller = await this.sellers.findOne({ where: { userId: user.id } });
    if (user.role !== 'seller' || !(product.sellerId === user.id || (seller && product.sellerId === seller.id))) {
      throw new NotFoundException('Product not found.'); // same answer for "missing" and "not yours"
    }
    return product;
  }

  // ---- adjust --------------------------------------------------------------
  /**
   * `inventory:adjust`: add or remove `delta` units (never "set to N": it composes with sales happening at the same
   * time). `variant` names the option; leave it out to move the product's shared pool / total. `by` is who really
   * acted (a team member acts as the store owner but is the one named in the ledger).
   */
  async adjust(user: { id: string; role: string }, input: { productId?: unknown; variant?: unknown; delta?: unknown; reason?: unknown; note?: unknown }, by: string = user.id) {
    const product = await this.ownedProduct(user, String(input.productId ?? ''));
    const delta = typeof input.delta === 'number' ? input.delta : Number(input.delta);
    if (!Number.isInteger(delta) || delta === 0 || Math.abs(delta) > 1_000_000) {
      throw new BadRequestException('Enter a whole number of units to add or remove (not zero).');
    }
    const reason = (input.reason === undefined || input.reason === null || input.reason === '' ? 'manual_adjust' : String(input.reason)) as StockReason;
    if (!MANUAL_REASONS.includes(reason)) throw new BadRequestException(`Reason must be one of: ${MANUAL_REASONS.join(', ')}.`);
    const groups = storedVariantGroups(product.variants);
    let variant: string | null = null;
    if (input.variant !== undefined && input.variant !== null && String(input.variant).trim() !== '' && String(input.variant) !== DEFAULT_VARIANT) {
      if (!groups.length) throw new BadRequestException('This product has no options.');
      variant = checkVariant(groups, input.variant, product.name); // C-CM2: only a real option can be adjusted
    }
    const note = typeof input.note === 'string' && input.note.trim() ? input.note.trim().slice(0, 200) : null;
    const change = await this.products.adjustStock(product.id, delta, { variant, reason, actorId: by, note });
    const fresh = await this.products.getRaw(product.id);
    return { productId: product.id, stock: fresh?.stock ?? change.after, variantStock: fresh?.variantStock ?? null, variant, delta, reason, stockAfter: change.after };
  }

  async movements(user: { id: string; role: string }, input: { productId?: unknown; limit?: unknown; offset?: unknown }) {
    const product = await this.ownedProduct(user, String(input.productId ?? ''));
    const take = Math.min(200, Math.max(1, Math.floor(Number(input.limit) || 50)));
    const skip = Math.max(0, Math.floor(Number(input.offset) || 0));
    const { items, total } = await this.products.movementsOf(product.id, { take, skip });
    return { productId: product.id, total, limit: take, offset: skip, items: items.map(InventoryService.movementView) };
  }

  private static movementView(m: StockMovement) {
    return { id: m.id, productId: m.productId, variant: m.variant, delta: m.delta, stockAfter: m.stockAfter, reason: m.reason, orderId: m.orderId, actorId: m.actorId, note: m.note, createdAt: m.createdAt };
  }

  // ---- threshold -----------------------------------------------------------
  /** `inventory:settings`: read the store's low-stock line; with `lowStockThreshold` set it. */
  async settings(user: { id: string; role: string }, input?: { lowStockThreshold?: unknown; sellerId?: unknown }) {
    const seller = await this.storeFor(user, input?.sellerId);
    if (input && input.lowStockThreshold !== undefined) {
      const n = typeof input.lowStockThreshold === 'number' ? input.lowStockThreshold : Number(input.lowStockThreshold);
      if (!Number.isInteger(n) || n < 0 || n > MAX_THRESHOLD) throw new BadRequestException(`The low-stock alert must be a whole number from 0 to ${MAX_THRESHOLD.toLocaleString('en-US')}.`);
      seller.lowStockThreshold = n;
      await this.sellers.update({ id: seller.id }, { lowStockThreshold: n });
      if (seller.userId) this.emitter.toUser(seller.userId, 'inventory:settings', { lowStockThreshold: n });
    }
    return { lowStockThreshold: seller.lowStockThreshold ?? DEFAULT_LOW_STOCK };
  }

  private async storeFor(user: { id: string; role: string }, sellerId?: unknown): Promise<Seller> {
    const seller = user.role.startsWith('admin') && sellerId
      ? await this.sellers.findOne({ where: { id: String(sellerId) } })
      : await this.sellers.findOne({ where: { userId: user.id } });
    if (!seller) throw new BadRequestException(user.role.startsWith('admin') ? 'Choose a store (sellerId).' : 'Open a store first.');
    return seller;
  }

  // ---- overview ------------------------------------------------------------
  /**
   * `inventory:overview`: the store's products with what is on hand, split by option, what is reserved by open
   * orders, and whether each is low or out. Paged; `q` searches the name and SKU; `low: true` keeps only the ones at
   * or below the line.
   */
  async overview(user: { id: string; role: string }, input: { sellerId?: unknown; q?: unknown; low?: unknown; limit?: unknown; offset?: unknown } = {}) {
    const seller = await this.storeFor(user, input.sellerId);
    const line = seller.lowStockThreshold ?? DEFAULT_LOW_STOCK;
    const take = Math.min(200, Math.max(1, Math.floor(Number(input.limit) || 50)));
    const skip = Math.max(0, Math.floor(Number(input.offset) || 0));
    const keys = [seller.id, ...(seller.userId ? [seller.userId] : [])];
    const qb = this.productRepo.createQueryBuilder('p').where("p.sellerId IN (:...keys) AND p.status <> 'removed'", { keys });
    const q = typeof input.q === 'string' ? input.q.trim().slice(0, 100) : '';
    if (q) qb.andWhere('(LOWER(p.name) LIKE :q OR LOWER(p.sku) LIKE :q)', { q: `%${q.toLowerCase()}%` });
    if (input.low === true) qb.andWhere('p.stock <= :line', { line });
    const [rows, total] = await qb.orderBy('p.stock', 'ASC').addOrderBy('p.name', 'ASC').take(take).skip(skip).getManyAndCount();
    const reserved = new Map<string, number>();
    if (rows.length) {
      const sums = await this.items
        .createQueryBuilder('i')
        .innerJoin(Order, 'o', 'o.id = i.orderId')
        .select('i.productId', 'productId')
        .addSelect('COALESCE(SUM(i.qty), 0)', 'qty')
        .where("i.productId IN (:...ids) AND o.status IN (:...open) AND i.fulfilment <> 'cancelled'", { ids: rows.map((r) => r.id), open: OPEN_ORDER })
        .groupBy('i.productId')
        .getRawMany<{ productId: string; qty: string }>();
      for (const s of sums) reserved.set(s.productId, Number(s.qty));
    }
    const summaryRows = await this.productRepo
      .createQueryBuilder('p')
      .select('COUNT(*)', 'products')
      .addSelect('COALESCE(SUM(p.stock), 0)', 'units')
      .addSelect('COALESCE(SUM(CASE WHEN p.stock <= 0 THEN 1 ELSE 0 END), 0)', 'out')
      .addSelect('COALESCE(SUM(CASE WHEN p.stock > 0 AND p.stock <= :line THEN 1 ELSE 0 END), 0)', 'low')
      .where("p.sellerId IN (:...keys) AND p.status <> 'removed'", { keys, line })
      .getRawOne<{ products: string; units: string; out: string; low: string }>();
    return {
      lowStockThreshold: line,
      total,
      limit: take,
      offset: skip,
      summary: { products: Number(summaryRows?.products ?? 0), units: Number(summaryRows?.units ?? 0), outOfStock: Number(summaryRows?.out ?? 0), lowStock: Number(summaryRows?.low ?? 0) },
      items: rows.map((p) => ({
        productId: p.id,
        name: p.name,
        sku: p.sku,
        image: p.image,
        status: p.status,
        stock: p.stock,
        variantStock: p.variantStock,
        pool: poolOf(p.stock, p.variantStock),
        reserved: reserved.get(p.id) ?? 0,
        low: p.stock > 0 && p.stock <= line,
        outOfStock: p.stock <= 0,
      })),
    };
  }

  // ---- cart ----------------------------------------------------------------
  /**
   * `cart:validate`: for each line (the customer's saved cart when none are sent) how many units can really be
   * bought now. The same limits `orders:create` enforces, so a screen can warn before checkout.
   */
  async validateCart(userId: string, lines?: unknown): Promise<{ ok: boolean; lines: CartCheck[] }> {
    let input: { productId: string; variant?: string; qty: number }[];
    if (Array.isArray(lines)) input = lines.slice(0, 100) as typeof input;
    else if (this.cart) input = (await this.cart.get(userId)).lines.map((l) => ({ productId: l.productId, variant: l.variant, qty: l.qty }));
    else input = [];
    const ids = [...new Set(input.map((l) => String(l?.productId ?? '')).filter(Boolean))];
    const rows = ids.length ? await this.productRepo.find({ where: { id: In(ids) } }) : [];
    const byId = new Map(rows.map((p) => [p.id, p]));
    const wanted = new Map<string, number>();
    const out: CartCheck[] = [];
    for (const l of input) {
      const p = byId.get(String(l?.productId ?? ''));
      const requested = Math.max(1, Math.floor(Number(l?.qty) || 1));
      const rawVariant = String(l?.variant ?? DEFAULT_VARIANT);
      if (!p || p.status !== 'live') {
        out.push({ productId: String(l?.productId ?? ''), variant: rawVariant, requested, available: 0, ok: false, reason: 'This product is no longer available.' });
        continue;
      }
      let variant = rawVariant;
      try {
        variant = checkVariant(storedVariantGroups(p.variants), rawVariant, p.name);
      } catch (e) {
        out.push({ productId: p.id, variant: rawVariant, requested, available: 0, ok: false, reason: (e as Error).message });
        continue;
      }
      // Two lines of the same option share one stock: count what the cart asks for in total.
      const key = `${p.id}|${variant}`;
      const total = (wanted.get(key) ?? 0) + requested;
      wanted.set(key, total);
      const available = availableFor(p.stock, p.variantStock, variant === DEFAULT_VARIANT ? null : variant);
      const ok = total <= available;
      out.push({
        productId: p.id,
        variant,
        requested,
        available,
        ok,
        ...(ok ? {} : { reason: available > 0 ? `Only ${available} of "${p.name}"${variant === DEFAULT_VARIANT ? '' : ` (${variant})`} left in stock.` : `"${p.name}"${variant === DEFAULT_VARIANT ? '' : ` (${variant})`} is out of stock.` }),
      });
    }
    return { ok: out.every((l) => l.ok), lines: out };
  }
}
