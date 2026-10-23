import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import {
  DeliveryTask,
  Hub,
  Order,
  OrderItem,
  OrderStatus,
  Payment,
  PaymentMethod,
  Seller,
  User,
} from '../database/entities';
import { ProductsService } from '../products/products.service';
import type { PricedProduct } from '../products/products.service';
import { pageOf } from '../common/paging';
import {
  ADMIN_ROLES,
  NotificationsService,
} from '../notifications/notifications.service';
import { RealtimeEmitter } from '../realtime/realtime-emitter';
import { PaymentsService } from '../payments/payments.service';
import { randomInt } from 'crypto';
import { WalletService } from '../wallet/wallet.service';
import { PromosService } from '../content/promos.service';
import { SettingsService } from '../content/settings.service';
import { DeliveryService } from '../delivery/delivery.service';
import { checkVariant, storedVariantGroups } from '../common/variants/variants';
import { DELIVERY_DAYS, estimatedDeliveryDate } from '../common/delivery/estimate';
import { linesBySeller, sellerUserId } from './order-sellers';
import { parseZones, zoneForAddress } from '../common/zones/zone-match';

/**
 * An order line is EITHER a reference to a seeded product (`productId`, which
 * decrements stock) OR a snapshot (`name` + `priceUsd`) so any storefront —
 * even one on its own mock catalog — can check out for real. `qty` is required
 * in both cases.
 */
export interface OrderLineInput {
  productId?: string;
  name?: string;
  priceUsd?: number;
  qty: number;
  variant?: string;
}

export interface CreateOrderInput {
  items: OrderLineInput[];
  paymentMethod: PaymentMethod;
  zoneId?: string;
  deliveryFeeUsd?: number;
  shippingAddress?: string; // JSON string; encrypted at rest
  /** Mobile-money subscriber number that will approve the charge. */
  paymentPhone?: string;
  /** Promo code; validated and applied by the SERVER (the app only previews it). */
  promoCode?: string;
}

/** The rider the customer may phone: only while the parcel is on its way. */
export interface RiderContact {
  name: string;
  phone: string | null;
}
const RIDER_VISIBLE: readonly string[] = ['shipped', 'out_for_delivery'];

const OPS_ROOMS = [...ADMIN_ROLES, 'warehouse_staff'];
const ORDER_STATUSES: readonly string[] = ['pending', 'confirmed', 'processing', 'shipped', 'out_for_delivery', 'delivered', 'cancelled', 'returned'];

/** The only forward step an operator may take by hand (cancelling goes through `cancel`). */
const NEXT_STATUS: Partial<Record<OrderStatus, OrderStatus>> = {
  pending: 'confirmed',
  confirmed: 'processing',
  processing: 'shipped',
  shipped: 'out_for_delivery',
  out_for_delivery: 'delivered',
  delivered: 'returned',
};

/** The single status an order may move to next by hand, or null when it is final (cancelled / returned). */
export function nextOrderStatus(status: OrderStatus): OrderStatus | null {
  return NEXT_STATUS[status] ?? null;
}

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(Order) private readonly orders: Repository<Order>,
    @InjectRepository(DeliveryTask)
    private readonly deliveries: Repository<DeliveryTask>,
    @InjectRepository(Seller) private readonly sellers: Repository<Seller>,
    private readonly delivery: DeliveryService,
    private readonly products: ProductsService,
    private readonly notifications: NotificationsService,
    private readonly emitter: RealtimeEmitter,
    private readonly payments: PaymentsService,
    private readonly wallet: WalletService,
    private readonly promos: PromosService,
    private readonly settings: SettingsService,
    @InjectRepository(Hub) private readonly hubs?: Repository<Hub>,
    @InjectRepository(User) private readonly users?: Repository<User>,
  ) {
    // Mobile-money confirmations arrive asynchronously (webhook): the payment
    // service tells us when an order's payment is finally settled.
    this.payments.registerOrderSettledHandler((payment, outcome) =>
      this.onPaymentSettled(payment, outcome),
    );
    // Sellers are told live about orders that contain THEIR products (redacted view).
    this.emitter.registerFanout(['order:created', 'order:updated'], (event, payload) =>
      this.pushToSellers(event, payload as Order),
    );
    // The customer (and only the customer) is told who the rider is while the parcel is on its way.
    this.emitter.registerUserView(['order:created', 'order:updated'], (userId, payload) => this.customerPush(userId, payload));
    // A rider could not deliver: re-open the order for another attempt, or
    // cancel + refund it once the limit is reached.
    this.delivery.registerFailedHandler((task, reason) => this.onDeliveryFailed(task, reason));
  }

  async create(
    customer: { id: string; name: string },
    input: CreateOrderInput,
  ): Promise<Order> {
    if (!input.items?.length) {
      throw new BadRequestException('An order needs at least one item.');
    }

    // Refuse a disabled/unavailable method BEFORE any row is written.
    await this.payments.assertMethodAllowed(input.paymentMethod);

    const MAX_QTY = 100;
    const MAX_DELIVERY_FEE = Number(process.env.MAX_DELIVERY_FEE_USD ?? 50);
    // Only dev/demo may accept prices the client invents. In production every
    // line must resolve to a live listing and is priced from OUR database.
    const allowClientPriced =
      process.env.ALLOW_CLIENT_PRICED_ITEMS === 'true' ||
      process.env.NODE_ENV !== 'production';

    // A seller may not buy their own listing (inflates sales, reviews and payouts).
    const buyerKeys = await this.sellerKeys(customer.id);

    // The platform commission in force NOW is frozen on every line (later rate changes never touch this order).
    const commissionPct = Math.min(100, Math.max(0, Number((await this.settings.get('commissionPct')) ?? 12) || 0));

    const items: OrderItem[] = [];
    const stockToReserve: { productId: string; qty: number; name: string }[] = [];
    let subtotal = 0;
    // Seller-campaign discount actually applied on the lines (flash + campaign never stack).
    let campaignDiscount = 0;
    const campaignSales = new Map<string, number>();
    // Each line's seller-set delivery time; the order's estimate is the slowest one.
    const lineDays: unknown[] = [];
    for (const line of input.items) {
      const rawQty = Number(line.qty ?? 1);
      if (!Number.isInteger(rawQty) || rawQty < 1 || rawQty > MAX_QTY) {
        throw new BadRequestException(`Quantity must be a whole number from 1 to ${MAX_QTY}.`);
      }
      const qty = rawQty;

      // Resolve to a live listing: by id, else by exact name (mobile carts send
      // name snapshots). The CLIENT'S PRICE IS NEVER TRUSTED for a real listing.
      let product = line.productId ? await this.products.get(line.productId) : null;
      if (!product && line.name) product = await this.products.findLiveByName(line.name);
      if (product && (product.status !== 'live' || !(product.price > 0))) {
        throw new BadRequestException(`"${product.name}" is not available.`);
      }
      if (product?.sellerId && buyerKeys.has(product.sellerId)) {
        throw new BadRequestException('You cannot buy your own listing.');
      }

      let name: string;
      let price: number;
      let productId: string;
      let variant: string;
      let listPrice: number | null = null;
      let campaignId: string | null = null;
      let campaignPct = 0;
      let sellerId: string | null = null;
      let sellerName: string | null = null;
      if (product) {
        sellerId = product.sellerId ?? null;
        sellerName = product.sellerName ?? null;
        // The shopper must have chosen every option the seller defined; stored in its canonical form.
        variant = checkVariant(storedVariantGroups(product.variants), line.variant, product.name);
        if (product.stock < qty) {
          throw new BadRequestException(
            product.stock > 0
              ? `Only ${product.stock} of "${product.name}" left in stock.`
              : `"${product.name}" is out of stock.`,
          );
        }
        name = product.name;
        price = product.price; // effective: the lowest of normal / flash / campaign price
        productId = product.id;
        const priced = product as PricedProduct;
        listPrice = priced.basePrice ?? product.price;
        if (priced.priceSource === 'campaign' && priced.campaignId) {
          campaignId = priced.campaignId;
          campaignPct = priced.campaignPct;
          campaignDiscount += (listPrice - price) * qty;
          campaignSales.set(campaignId, (campaignSales.get(campaignId) ?? 0) + price * qty);
        }
        stockToReserve.push({ productId: product.id, qty, name: product.name });
        lineDays.push(product.deliveryDays);
      } else if (allowClientPriced && line.name != null && line.priceUsd != null) {
        const p = Number(line.priceUsd);
        if (!Number.isFinite(p) || p <= 0 || p > 100_000) {
          throw new BadRequestException('Invalid item price.');
        }
        name = String(line.name).slice(0, 200);
        price = Number(p.toFixed(2));
        productId = `ext:${name}`;
        variant = String(line.variant ?? '').replace(/\s+/g, ' ').trim().slice(0, 200) || 'Default';
        lineDays.push(DELIVERY_DAYS.fallback);
      } else {
        throw new BadRequestException(
          'Unknown product. Refresh the catalogue and try again.',
        );
      }

      subtotal += price * qty;
      const item = new OrderItem();
      item.productId = productId;
      item.productName = name;
      item.variant = variant;
      item.qty = qty;
      item.priceUsd = price;
      item.listPriceUsd = listPrice;
      item.campaignId = campaignId;
      item.campaignPct = campaignPct;
      item.sellerId = sellerId;
      item.sellerName = sellerName;
      item.fulfilment = 'open';
      item.commissionPct = commissionPct;
      item.commissionUsd = Number(((price * qty * commissionPct) / 100).toFixed(2));
      items.push(item);
    }

    // The zone (and so the fee and the warehouse) follows the delivery address, whatever the app sent.
    const zoneId = await this.resolveZoneId(input.zoneId, input.shippingAddress);
    const deliveryFee = await this.resolveDeliveryFee(zoneId, input.deliveryFeeUsd, MAX_DELIVERY_FEE);

    let discount = 0;
    let promoCode: string | null = null;
    if (input.promoCode?.trim()) {
      const res = await this.promos.validate(input.promoCode.trim(), subtotal, customer.id);
      if (!res.ok) throw new BadRequestException(res.reason ?? 'Invalid promo code.');
      discount = Math.min(Number(res.discount.toFixed(2)), subtotal); // never below zero
      promoCode = res.code ?? null;
    }
    const total = Number((subtotal - discount + deliveryFee).toFixed(2));
    if (!(total > 0)) throw new BadRequestException('Order total must be greater than zero.');

    // Fail fast on wallet payments with insufficient funds — before creating
    // any order/delivery rows.
    if (input.paymentMethod === 'wallet') {
      const balance = await this.wallet.getBalance(customer.id);
      if (balance < total) {
        throw new BadRequestException(
          `Insufficient wallet balance ($${balance.toFixed(2)} < $${total.toFixed(2)}).`,
        );
      }
    }

    // Take the stock ATOMICALLY (the UPDATE only succeeds while enough is left),
    // so concurrent orders can never oversell. Released again on any failure.
    const reserved: { productId: string; qty: number }[] = [];
    const release = async () => {
      for (const r of reserved) await this.products.restock(r.productId, r.qty);
    };
    try {
      for (const r of stockToReserve) {
        if (!(await this.products.reserve(r.productId, r.qty))) {
          throw new BadRequestException(`"${r.name}" just sold out or has too little stock left.`);
        }
        reserved.push(r);
      }
    } catch (err) {
      await release();
      throw err;
    }

    const order = this.orders.create({
      reference: OrdersService.newReference(),
      customerId: customer.id,
      customerName: customer.name,
      status: 'pending',
      paymentMethod: input.paymentMethod,
      subtotalUsd: subtotal,
      deliveryFeeUsd: deliveryFee,
      discountUsd: discount,
      promoCode,
      campaignDiscountUsd: Number(campaignDiscount.toFixed(2)),
      totalUsd: total,
      zoneId: zoneId ?? null,
      estimatedDeliveryDate: estimatedDeliveryDate(lineDays),
      shippingAddress: input.shippingAddress ?? null,
      items,
    });
    let saved: Order;
    try {
      saved = await this.orders.save(order);
    } catch (err) {
      await release();
      throw err;
    }

    // Charge for the order. Wallet/card confirm immediately; COD stays pending
    // until the rider collects; mobile money stays pending until the subscriber
    // approves on their phone (the webhook then confirms).
    let payment;
    try {
      payment = await this.payments.processForOrder(saved, input.paymentPhone);
    } catch (err) {
      saved.status = 'cancelled'; // never leave a dangling unpaid order behind
      await this.orders.save(saved);
      await release();
      throw err;
    }
    const awaitingPayment = payment.status === 'pending' && payment.method !== 'cod';
    if (payment.status === 'succeeded') {
      saved.status = 'confirmed';
      saved = await this.orders.save(saved);
    }

    // Campaign engagement counters (best effort: never fail an order over them).
    for (const [campaignId, revenue] of campaignSales) {
      void this.products.recordCampaignSale(campaignId, revenue).catch(() => undefined);
    }

    this.emitter.toUser(customer.id, 'order:created', saved);
    if (awaitingPayment) {
      // Not fulfillable yet: ops hear about it only once the money is in.
      await this.notifications.toUser(customer.id, {
        title: 'Approve your payment',
        body: `Approve the ${payment.method.replace(/_/g, ' ')} request on your phone to confirm ${saved.reference}.`,
        type: 'order',
        entityId: saved.id,
      });
    } else {
      await this.openFulfilment(saved);
      await this.notifications.toUser(customer.id, {
        title: 'Order placed',
        body: `We received ${saved.reference}. You'll get updates here in real time.`,
        type: 'order',
        entityId: saved.id,
      });
    }

    return saved;
  }

  /** Make a paid (or COD) order visible to the warehouse, riders and admins. */
  private async openFulfilment(order: Order): Promise<void> {
    await this.announceFulfilment(order, await this.createFulfilmentTask(order));
  }

  /** The order's delivery task (unassigned), routed to the warehouse that serves its zone. */
  private async createFulfilmentTask(order: Order): Promise<DeliveryTask> {
    return this.deliveries.save(
      this.deliveries.create({
        orderId: order.id,
        orderReference: order.reference,
        status: 'unassigned',
        address: order.shippingAddress,
        zoneId: order.zoneId,
        hubId: await this.hubForZone(order.zoneId),
        codAmountUsd: order.paymentMethod === 'cod' ? order.totalUsd : 0,
        pickupAddress: await this.pickupFor(order),
        proofCode: String(randomInt(1000, 10000)),
      }),
    );
  }

  /** Tell the warehouse, riders, admins and sellers about a new delivery. */
  private async announceFulfilment(order: Order, task: DeliveryTask): Promise<void> {
    // Riders of the task's warehouse hear about the new delivery at once (no polling needed in their apps).
    this.emitTask(task);
    this.emitter.toRoles(OPS_ROOMS, 'order:created', order);
    await this.announceTask(task);
    await this.notifications.toAdmins({
      title: 'New order',
      body: `${order.reference} · $${order.totalUsd.toFixed(2)} from ${order.customerName}`,
      type: 'order',
      entityId: order.id,
    });
    // Every seller with items on the order is told, persistently, what to pack.
    try {
      for (const [sellerId, items] of await this.linesBySeller(order)) {
        const live = items.filter((i) => i.fulfilment !== 'cancelled');
        if (!live.length) continue;
        const n = live.reduce((t, i) => t + i.qty, 0);
        const subtotal = live.reduce((t, i) => t + i.priceUsd * i.qty, 0);
        await this.notifications.toUser(await this.sellerUserId(sellerId), {
          title: 'New order',
          body: `${order.reference}: ${n} item(s) to pack — $${subtotal.toFixed(2)}`,
          type: 'order',
          entityId: order.id,
        });
      }
    } catch {
      // Best effort: a notification problem must never undo a placed order.
    }
  }

  /** A task changed: ops pages, plus the riders who may take it (its warehouse's, or every rider). */
  private emitTask(task: DeliveryTask): void {
    this.emitter.toRoles(OPS_ROOMS, 'delivery:updated', task);
    this.emitter.toRiders(task.hubId ?? null, 'delivery:updated', task);
  }

  /**
   * Tell riders a delivery is waiting to be accepted: saved notice, live socket and a push to their phones. A task
   * of a warehouse goes to that warehouse's active riders (and riders not tied to one); otherwise to every rider.
   */
  private async announceTask(task: DeliveryTask): Promise<void> {
    try {
      const cod = task.codAmountUsd > 0 ? ` · collect $${task.codAmountUsd.toFixed(2)} cash` : '';
      const notice = {
        title: 'New delivery available',
        body: `${task.orderReference}${cod}. Open the app to accept it.`,
        type: 'task',
        entityId: task.id,
        extra: { orderId: task.orderId, view: 'available' },
      };
      if (task.hubId && this.users) {
        const riders = await this.users.find({
          where: [
            { role: 'rider', active: true, hubId: task.hubId },
            { role: 'rider', active: true, hubId: IsNull() },
          ],
          select: ['id'],
        });
        await this.notifications.toUsers(riders.map((r) => r.id), notice);
      } else {
        await this.notifications.toRole('rider', notice);
      }
    } catch {
      // Best effort: the task is already in the riders' queue.
    }
  }

  /** The delivery zone of an address: its saved zone when valid, else its commune. Without zones, what was sent. */
  private async resolveZoneId(sent: string | undefined, shippingAddress: string | undefined): Promise<string | undefined> {
    const zones = parseZones(await this.settings.get('deliveryZones'));
    if (!zones.length) return sent;
    let addr: { commune?: string; city?: string; zone?: string } = {};
    try {
      addr = shippingAddress ? (JSON.parse(shippingAddress) as typeof addr) : {};
    } catch {
      /* free-text address: only the sent zone can be used */
    }
    const zone = zoneForAddress({ zoneId: sent ?? addr.zone, commune: addr.commune, city: addr.city }, zones);
    return zone?.id ?? sent; // an unknown zone is refused by the fee lookup
  }

  /** The warehouse that delivers a zone; with none set, the only active warehouse (if there is exactly one). */
  private async hubForZone(zoneId: string | null): Promise<string | null> {
    const zone = parseZones(await this.settings.get('deliveryZones')).find((z) => z.id === zoneId);
    if (zone?.hubId) return zone.hubId;
    if (!this.hubs) return null;
    const active = await this.hubs.find({ where: { active: true }, select: ['id'], take: 2 });
    return active.length === 1 ? active[0].id : null;
  }

  /** The user account behind a seller id (the store row's owner; demo data may store the user id directly). */
  private sellerUserId(sellerId: string): Promise<string> {
    return sellerUserId(sellerId, this.sellers);
  }

  /** Persisted notification to every seller with live lines on the order. */
  private async notifySellers(order: Order, title: string, body: string): Promise<void> {
    try {
      for (const [sellerId, items] of await this.linesBySeller(order)) {
        if (items.every((i) => i.fulfilment === 'cancelled')) continue;
        await this.notifications.toUser(await this.sellerUserId(sellerId), { title, body, type: 'order', entityId: order.id });
      }
    } catch {
      // Best effort.
    }
  }

  /** Send each seller the redacted view (their lines only, first name, no address) of an order. */
  private async pushToSellers(event: string, order: Order): Promise<void> {
    if (!order?.items?.length) return;
    for (const [sellerId, items] of await this.linesBySeller(order)) {
      const userId = await this.sellerUserId(sellerId); // demo products may store the user id directly
      this.emitter.toUser(userId, event, OrdersService.sellerView(order, items));
    }
  }

  /** An order's lines grouped by seller (the snapshot, else the listing's current seller for old lines). */
  private linesBySeller(order: Order): Promise<Map<string, OrderItem[]>> {
    return linesBySeller(order, this.products);
  }

  /**
   * What a seller sees of an order: THEIR lines only (first name, no address),
   * their subtotal, and their package's own status — on a multi-seller order the
   * other sellers' progress is none of their business.
   */
  private static sellerView(order: Order, items: OrderItem[]) {
    const mineIds = new Set(items.map((i) => i.id));
    const live = items.filter((i) => i.fulfilment !== 'cancelled');
    const subtotal = Number(live.reduce((t, i) => t + i.priceUsd * i.qty, 0).toFixed(2));
    return {
      id: order.id,
      reference: order.reference,
      status: order.status,
      packageStatus: OrdersService.packageStatus(order, items),
      paymentMethod: order.paymentMethod,
      estimatedDeliveryDate: order.estimatedDeliveryDate ?? null,
      createdAt: order.createdAt,
      customerName: (order.customerName ?? '').split(' ')[0],
      items,
      subtotalUsd: subtotal,
      totalUsd: subtotal,
      sellerCount: new Set((order.items ?? []).map((i) => i.sellerId ?? i.productId)).size,
      // How many OTHER sellers still have to pack (no names: their business stays theirs).
      otherSellersPacking: new Set(
        (order.items ?? [])
          .filter((i) => !mineIds.has(i.id) && i.fulfilment === 'open' && !i.productId.startsWith('ext:'))
          .map((i) => i.sellerId ?? i.productId),
      ).size,
    };
  }

  /**
   * One seller's package on an order: `cancelled` when all their lines were
   * cancelled, else the furthest common step of their lines (open → ready →
   * received), and once the hub has it, the order's own delivery status.
   */
  static packageStatus(order: Pick<Order, 'status' | 'paymentMethod'>, items: Pick<OrderItem, 'fulfilment'>[]): string {
    const live = items.filter((i) => i.fulfilment !== 'cancelled');
    if (!live.length) return 'cancelled';
    if (order.status === 'cancelled' || (order.status === 'pending' && !OrdersService.fulfillable(order))) return order.status;
    if (live.every((i) => i.fulfilment === 'received')) {
      return ['shipped', 'out_for_delivery', 'delivered', 'returned'].includes(order.status) ? order.status : 'at_hub';
    }
    if (live.every((i) => i.fulfilment !== 'open')) return 'ready';
    return 'to_pack';
  }

  /**
   * Sellers may pack (or cancel) once the money is in — or right away for cash on
   * delivery, whose order stays `pending` until the rider collects at the door.
   */
  static fulfillable(order: Pick<Order, 'status' | 'paymentMethod'>): boolean {
    return ['confirmed', 'processing'].includes(order.status) || (order.status === 'pending' && order.paymentMethod === 'cod');
  }

  /**
   * The customer's view of orders: while an order is shipped / out for delivery and has a rider, it carries
   * `rider: { name, phone }` so they can call. Never for other statuses (the field is absent, not null).
   */
  async withRiders(orders: Order[]): Promise<(Order & { rider?: RiderContact })[]> {
    const ids = [...new Set(orders.filter((o) => RIDER_VISIBLE.includes(o.status) && o.riderId).map((o) => o.riderId as string))];
    if (!ids.length) return orders;
    const riders = new Map((await this.orders.manager.find(User, { where: { id: In(ids) } })).map((u) => [u.id, u]));
    return orders.map((o) => {
      const r = RIDER_VISIBLE.includes(o.status) && o.riderId ? riders.get(o.riderId) : undefined;
      return r ? Object.assign(Object.create(Object.getPrototypeOf(o)), o, { rider: { name: r.name, phone: r.phone ?? null } }) : o;
    });
  }

  /** `toUser` view of order events: the rider's contact only for the order's own customer. */
  private customerPush(userId: string, payload: unknown): unknown | Promise<unknown> {
    const o = payload as Order | null;
    if (!o || o.customerId !== userId || !o.riderId || !RIDER_VISIBLE.includes(o.status)) return payload;
    return this.withRiders([o]).then(([v]) => v);
  }

  /** Every id a seller account's listings may carry (the store id, and the user id on demo data). */
  private async sellerKeys(userId: string): Promise<Set<string>> {
    const row = await this.sellers.findOne({ where: { userId } });
    return new Set([userId, ...(row ? [row.id] : [])]);
  }

  /** Where the rider collects the parcel: the seller(s)' pickup address, else the hub. */
  private async pickupFor(order: Order): Promise<string> {
    const lines: string[] = [];
    const seen = new Set<string>();
    for (const [sellerId, items] of await this.linesBySeller(order)) {
      if (seen.has(sellerId) || items.every((i) => i.fulfilment === 'cancelled')) continue;
      seen.add(sellerId);
      const seller = (await this.sellers.findOne({ where: { id: sellerId } })) ?? (await this.sellers.findOne({ where: { userId: sellerId } }));
      lines.push(`${seller?.name ?? items[0].sellerName ?? 'Seller'} — ${seller?.pickupAddress || 'address not provided, contact the seller'}`);
    }
    if (lines.length) return lines.join(' | ');
    return (await this.settings.get('hubAddress')) || 'Somba&Teka hub';
  }

  /** The customer's handover code for an order that is on its way (null when none applies). */
  async deliveryCode(customerId: string, orderId: string): Promise<{ code: string | null; required: boolean }> {
    const order = await this.orders.findOne({ where: { id: orderId } });
    if (!order || order.customerId !== customerId) throw new NotFoundException('Order not found.');
    const required = (await this.settings.get('requireDeliveryCode')) === 'true';
    // Only once a rider is on the job; before that there is nothing to hand over.
    const onItsWay = ['processing', 'shipped', 'out_for_delivery'].includes(order.status);
    return { required, code: required && onItsWay ? await this.delivery.codeForOrder(orderId) : null };
  }

  /** The seller confirms the parcel is packed and ready for the rider. */
  async sellerReady(user: { id: string }, orderId: string): Promise<DeliveryTask> {
    const order = await this.orders.findOne({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found.');
    const keys = await this.sellerKeys(user.id);
    const groups = await this.linesBySeller(order);
    const mine = [...groups].filter(([sellerId]) => keys.has(sellerId)).flatMap(([, items]) => items);
    if (!mine.length) throw new NotFoundException('Order not found.');
    if (!OrdersService.fulfillable(order)) {
      throw new BadRequestException(`An order that is ${order.status.replace(/_/g, ' ')} cannot be marked ready.`);
    }
    const open = mine.filter((i) => i.fulfilment === 'open');
    if (!open.length && mine.every((i) => i.fulfilment === 'cancelled')) {
      throw new BadRequestException('You cancelled every item of this order: there is nothing to pack.');
    }
    if (open.length) {
      const now = new Date();
      await this.orders.manager.update(OrderItem, { id: In(open.map((i) => i.id)) }, { fulfilment: 'ready', readyAt: now });
    }
    const saved = (await this.orders.findOne({ where: { id: order.id } }))!;
    // The rider/hub is only sent once EVERY seller of the order has packed their part.
    const live = (saved.items ?? []).filter((i) => i.fulfilment !== 'cancelled' && !i.productId.startsWith('ext:'));
    const allReady = live.every((i) => i.fulfilment !== 'open');
    let task: DeliveryTask | null = null;
    if (allReady) {
      task = await this.delivery.markReady(orderId);
      if (!task) throw new BadRequestException('This order has no delivery waiting for pickup.');
    } else {
      task = await this.deliveries.findOne({ where: { orderId }, order: { createdAt: 'DESC' } });
      if (!task) throw new BadRequestException('This order has no delivery waiting for pickup.');
    }
    const sellersLeft = new Set(live.filter((i) => i.fulfilment === 'open').map((i) => i.sellerName ?? i.sellerId ?? 'Seller')).size;
    this.emitter.toUser(saved.customerId, 'order:updated', saved);
    this.emitter.toRoles(OPS_ROOMS, 'order:updated', saved);
    await this.notifications.toAdmins({
      title: allReady ? 'Parcel ready for pickup' : 'Seller package ready',
      body: allReady
        ? `${order.reference} is packed and ready.`
        : `${order.reference}: one seller's package is ready, waiting for ${sellersLeft} more seller${sellersLeft > 1 ? 's' : ''}.`,
      type: 'delivery',
      entityId: order.id,
    });
    return task;
  }

  /**
   * A seller cannot fulfil their part of an order (out of stock, damaged…): only
   * THEIR lines are cancelled — restocked, refunded on their own (prepaid → the
   * customer's wallet; COD → the amount to collect drops) — and the other
   * sellers' packages carry on. When nothing is left, the whole order is cancelled.
   */
  async sellerCancel(user: { id: string }, orderId: string, reasonRaw: string, itemIds?: string[]): Promise<unknown> {
    const reason = String(reasonRaw ?? '').trim().slice(0, 200);
    if (reason.length < 3) throw new BadRequestException('Give the customer a reason for the cancellation.');
    const order = await this.orders.findOne({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found.');
    const keys = await this.sellerKeys(user.id);
    const groups = await this.linesBySeller(order);
    const mine = [...groups].filter(([sellerId]) => keys.has(sellerId)).flatMap(([, items]) => items);
    if (!mine.length) throw new NotFoundException('Order not found.');
    if (!OrdersService.fulfillable(order)) {
      throw new BadRequestException(
        order.status === 'pending'
          ? 'Wait until the customer has paid before cancelling.'
          : `An order that is ${order.status.replace(/_/g, ' ')} can no longer be cancelled by the seller.`,
      );
    }
    const wanted = itemIds?.length ? new Set(itemIds) : null;
    const targets = mine.filter((i) => (!wanted || wanted.has(i.id)) && (i.fulfilment === 'open' || i.fulfilment === 'ready'));
    if (!targets.length) throw new BadRequestException('These items were already handed over or cancelled.');

    const everyLine = (order.items ?? []).filter((i) => i.fulfilment !== 'cancelled');
    if (targets.length === everyLine.length) {
      // Nothing would be left: cancel the whole order (stock, refund, delivery handled there).
      const cancelled = await this.cancel({ id: order.customerId, role: 'customer' }, order.id, { allowProcessing: true, bySeller: true }).catch((e: Error) => {
        throw new BadRequestException(/no longer be cancelled/.test(e.message) ? 'The rider already collected this parcel: contact support to stop it.' : e.message);
      });
      await this.orders.manager.update(OrderItem, { id: In(targets.map((i) => i.id)) }, { fulfilment: 'cancelled', cancelReason: reason });
      for (const i of cancelled.items ?? []) {
        if (targets.some((t) => t.id === i.id)) Object.assign(i, { fulfilment: 'cancelled', cancelReason: reason });
      }
      return OrdersService.sellerView(cancelled, (cancelled.items ?? []).filter((i) => targets.some((t) => t.id === i.id)));
    }

    // The promo discount is shared across lines pro rata, so a partial refund never exceeds what was paid.
    const value = targets.reduce((t, i) => t + i.priceUsd * i.qty, 0);
    const share = order.subtotalUsd > 0 ? value / order.subtotalUsd : 0;
    const refund = Number((value - (order.discountUsd ?? 0) * share).toFixed(2));
    const payment = await this.payments.forOrder(order.id);
    const prepaid = order.paymentMethod !== 'cod' && payment?.status === 'succeeded';

    const done = await this.orders.manager.transaction(async (m) => {
      // Claim the lines atomically: two concurrent cancels refund once.
      const claim = await m
        .createQueryBuilder()
        .update(OrderItem)
        .set({ fulfilment: 'cancelled', cancelReason: reason })
        .where("id IN (:...ids) AND fulfilment IN ('open','ready')", { ids: targets.map((i) => i.id) })
        .execute();
      if ((claim.affected ?? 0) !== targets.length) return false;
      if (prepaid && refund > 0) {
        const per = targets.length ? refund / value : 0;
        for (const i of targets) {
          await m.update(OrderItem, { id: i.id }, { refundedUsd: Number((i.priceUsd * i.qty * per).toFixed(2)) });
        }
        await this.wallet.apply(order.customerId, 'refund', refund, `Refund: seller cancelled part of ${order.reference}`, m);
      }
      if (order.paymentMethod === 'cod' && refund > 0) {
        // Less to collect at the door.
        const tasks = await m.find(DeliveryTask, { where: { orderId: order.id, status: In(['unassigned', 'assigned', 'picked_up', 'in_transit']) } });
        for (const t of tasks) {
          await m.update(DeliveryTask, { id: t.id }, { codAmountUsd: Math.max(0, Number((t.codAmountUsd - refund).toFixed(2))) });
        }
        if (payment && payment.status === 'pending') {
          await m.update(Payment, { id: payment.id }, { amountUsd: Math.max(0, Number((payment.amountUsd - refund).toFixed(2))) });
        }
      }
      return true;
    });
    if (!done) throw new BadRequestException('These items were just updated. Refresh and try again.');
    for (const i of targets) {
      if (!i.productId.startsWith('ext:')) await this.products.restock(i.productId, i.qty);
    }

    const saved = (await this.orders.findOne({ where: { id: order.id } }))!;
    // The remaining sellers may all be packed already: the parcel can go now.
    const live = (saved.items ?? []).filter((i) => i.fulfilment !== 'cancelled' && !i.productId.startsWith('ext:'));
    if (live.length && live.every((i) => i.fulfilment !== 'open')) await this.delivery.markReady(order.id);
    const pickup = await this.pickupFor(saved);
    await this.deliveries
      .createQueryBuilder()
      .update(DeliveryTask)
      .set({ pickupAddress: pickup })
      .where("orderId = :id AND status IN ('unassigned','assigned')", { id: order.id })
      .execute();

    this.emitter.toUser(saved.customerId, 'order:updated', saved);
    this.emitter.toRoles(OPS_ROOMS, 'order:updated', saved);
    const names = targets.map((i) => i.productName).join(', ');
    await this.notifications.toUser(saved.customerId, {
      title: 'Item cancelled by the seller',
      body: `${saved.reference}: ${names} was cancelled (${reason}).${prepaid && refund > 0 ? ` $${refund.toFixed(2)} was refunded to your wallet.` : ''} The rest of your order continues.`,
      type: 'order',
      entityId: saved.id,
    });
    await this.notifications.toAdmins({
      title: 'Seller cancelled items',
      body: `${saved.reference}: ${names} — ${reason}`,
      type: 'order',
      entityId: saved.id,
    });
    return OrdersService.sellerView(saved, (saved.items ?? []).filter((i) => mine.some((t) => t.id === i.id)));
  }

  /**
   * A delivery attempt failed. The order goes back to "confirmed" and a fresh
   * task is queued for another attempt; after DELIVERY_MAX_ATTEMPTS the order is
   * cancelled, the stock released and any prepaid money refunded.
   */
  private async onDeliveryFailed(task: DeliveryTask, reason: string): Promise<void> {
    const order = await this.orders.findOne({ where: { id: task.orderId } });
    if (!order || order.status === 'cancelled' || order.status === 'returned' || order.status === 'delivered') return;
    const max = Number(process.env.DELIVERY_MAX_ATTEMPTS ?? 3);
    if (task.attempts >= max) {
      const claim = await this.orders
        .createQueryBuilder()
        .update(Order)
        .set({ status: 'cancelled' })
        .where("id = :id AND status NOT IN ('cancelled','returned','delivered')", { id: order.id })
        .execute();
      if (!claim.affected) return;
      const saved = (await this.orders.findOne({ where: { id: order.id } }))!;
      const refunded = await this.payments.refundCancelledOrder(saved);
      for (const item of saved.items ?? []) {
        if (!item.productId.startsWith('ext:') && item.fulfilment !== 'cancelled') await this.products.restock(item.productId, item.qty);
      }
      this.emitter.toUser(saved.customerId, 'order:updated', saved);
      this.emitter.toRoles(OPS_ROOMS, 'order:updated', saved);
      await this.notifications.toUser(saved.customerId, {
        title: 'Order cancelled',
        body: `${saved.reference} could not be delivered after ${task.attempts} attempts (${reason}).${refunded > 0 ? ` $${refunded.toFixed(2)} was refunded to your wallet.` : ''}`,
        type: 'order',
        entityId: saved.id,
      });
      return;
    }
    order.status = 'confirmed';
    order.riderId = null;
    const saved = await this.orders.save(order);
    const next = await this.deliveries.save(
      this.deliveries.create({
        orderId: order.id,
        orderReference: order.reference,
        status: 'unassigned',
        address: task.address,
        zoneId: task.zoneId,
        hubId: task.hubId,
        codAmountUsd: task.codAmountUsd,
        pickupAddress: task.pickupAddress,
        proofCode: await this.delivery.getProofCode(task.id),
        readyAt: task.readyAt,
        receivedAt: task.receivedAt,
        attempts: task.attempts + 1,
      }),
    );
    this.emitter.toUser(saved.customerId, 'order:updated', saved);
    this.emitTask(next);
    this.emitter.toRoles(OPS_ROOMS, 'order:updated', saved);
    await this.announceTask(next);
    await this.notifications.toUser(saved.customerId, {
      title: 'Delivery attempt failed',
      body: `${saved.reference}: ${reason}. We will try again (attempt ${next.attempts} of ${max}). You can also cancel the order.`,
      type: 'order',
      entityId: saved.id,
    });
  }

  /** A mobile-money payment reached its final state (webhook, sandbox, or timeout). */
  private async onPaymentSettled(
    payment: { orderId: string | null; failureReason: string | null },
    outcome: 'succeeded' | 'failed',
  ): Promise<void> {
    if (!payment.orderId) return;
    const order = await this.orders.findOne({ where: { id: payment.orderId } });
    if (!order || order.status !== 'pending') return;

    if (outcome === 'succeeded') {
      // The delivery task exists before the order reads "confirmed", so whoever sees the confirmed order (the
      // customer, ops, a test) also finds its parcel in the warehouse queue.
      const task = await this.createFulfilmentTask(order);
      order.status = 'confirmed';
      const saved = await this.orders.save(order);
      await this.announceFulfilment(saved, task);
      this.emitter.toUser(saved.customerId, 'order:updated', saved);
      return;
    }

    order.status = 'cancelled';
    const saved = await this.orders.save(order);
    for (const item of saved.items ?? []) {
      // A line the seller already cancelled was restocked then.
      if (!item.productId.startsWith('ext:') && item.fulfilment !== 'cancelled') {
        await this.products.restock(item.productId, item.qty);
      }
    }
    this.emitter.toUser(saved.customerId, 'order:updated', saved);
    // Sellers saw the order as awaiting payment: the fanout tells them it is gone.
    this.emitter.toRoles(OPS_ROOMS, 'order:updated', saved);
    await this.notifications.toUser(saved.customerId, {
      title: 'Order cancelled',
      body: `${saved.reference} was cancelled: ${payment.failureReason ?? 'payment was not completed'}.`,
      type: 'order',
      entityId: saved.id,
    });
  }

  /**
   * The delivery fee comes from the admin-configured zones (`deliveryZones`
   * setting) — the client's number is ignored. Only when no zones are configured
   * (dev/demo) is a capped client fee accepted.
   */
  private async resolveDeliveryFee(zoneId: string | undefined, clientFee: unknown, max: number): Promise<number> {
    const raw = await this.settings.get('deliveryZones');
    if (raw) {
      let zones: { id: string; feeUsd: number }[] = [];
      try {
        zones = JSON.parse(raw);
      } catch {
        zones = [];
      }
      if (zones.length) {
        const z = zones.find((x) => x.id === zoneId);
        if (!z) throw new BadRequestException('Choose a valid delivery zone.');
        return Number(Number(z.feeUsd).toFixed(2));
      }
    }
    const fee = Number(clientFee ?? 0);
    if (!Number.isFinite(fee) || fee < 0 || fee > max) throw new BadRequestException('Invalid delivery fee.');
    return fee;
  }

  /**
   * Operator moves an order ONE step forward (see [nextOrderStatus]); anything else
   * is refused so a status can never skip steps or rewind. Marking it `delivered`
   * by hand also closes the open delivery task(s) and collects cash on delivery.
   */
  async updateStatus(
    orderId: string,
    status: OrderStatus,
  ): Promise<Order> {
    const order = await this.orders.findOne({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found.');
    if (!ORDER_STATUSES.includes(status)) throw new BadRequestException('Unknown order status.');
    if (status === 'cancelled') {
      throw new BadRequestException('Use cancel so stock and refunds are handled.');
    }
    const from = order.status;
    if (nextOrderStatus(from) !== status) {
      throw new BadRequestException(`Cannot move an order from ${from} to ${status}.`);
    }
    if (from === 'pending' && order.paymentMethod !== 'cod') {
      const pay = await this.payments.forOrder(order.id);
      if (pay && pay.status === 'pending') {
        throw new BadRequestException('Awaiting payment — this order cannot be fulfilled yet.');
      }
    }
    // Conditional on the status we just read: two operators clicking at once move it one step, not two.
    const claim = await this.orders
      .createQueryBuilder()
      .update(Order)
      .set({ status })
      .where('id = :id AND status = :from', { id: order.id, from })
      .execute();
    if (!claim.affected) {
      throw new BadRequestException('This order was just updated. Refresh and try again.');
    }
    const saved = (await this.orders.findOne({ where: { id: order.id } }))!;

    if (status === 'delivered') {
      // Close the delivery by hand: the open task(s) are delivered, COD is collected.
      const open = await this.deliveries.find({
        where: { orderId: saved.id, status: In(['unassigned', 'assigned', 'picked_up', 'in_transit']) },
      });
      for (const task of open) {
        task.status = 'delivered';
        task.deliveredAt = new Date();
        await this.deliveries.save(task);
        this.emitTask(task);
        if (task.riderId) this.emitter.toUser(task.riderId, 'delivery:updated', task);
      }
      await this.payments.markCollected(saved.id);
    }

    // Everyone who cares about this order hears about it instantly.
    this.emitter.toUser(saved.customerId, 'order:updated', saved);
    this.emitter.toRoles(OPS_ROOMS, 'order:updated', saved);
    if (saved.riderId) {
      this.emitter.toUser(saved.riderId, 'order:updated', saved);
    }
    await this.notifications.toUser(saved.customerId, {
      title: 'Order update',
      body: `${saved.reference} is now ${status.replace(/_/g, ' ')}.`,
      type: 'order',
      entityId: saved.id,
    });
    return saved;
  }

  /**
   * An operator cancels an order on the customer's behalf, with a reason. Works
   * until the rider has collected the parcel; the reason is stored on every live
   * line and told to the customer (and the sellers). Stock, refund and delivery
   * tasks are handled by [cancel].
   */
  async adminCancel(user: { id: string; role: string }, orderId: string, reasonRaw: string): Promise<Order> {
    const reason = String(reasonRaw ?? '').trim().slice(0, 200);
    if (reason.length < 3) throw new BadRequestException('Give a reason for the cancellation (at least 3 characters).');
    return this.cancel(user, orderId, { allowProcessing: true, reason });
  }

  /**
   * Customer cancels their own order while it's still cancellable (before it
   * ships). Restocks the items, refunds prepaid orders to the wallet, and voids
   * the delivery task.
   */
  async cancel(
    user: { id: string; role: string },
    orderId: string,
    opts: { allowProcessing?: boolean; reason?: string; bySeller?: boolean } = {},
  ): Promise<Order> {
    const order = await this.orders.findOne({ where: { id: orderId } });
    // Same answer for "missing" and "not yours" so ids can't be probed.
    if (!order || (!user.role.startsWith('admin') && order.customerId !== user.id)) {
      throw new NotFoundException('Order not found.');
    }

    // Atomic transition: of two concurrent cancels exactly one wins, so stock is
    // restored and money refunded once.
    // A rider-assigned order may still be cancelled (seller-side) as long as the parcel was not collected.
    let cancellable = "('pending','confirmed')";
    if (opts.allowProcessing && order.status === 'processing') {
      const collected = await this.deliveries.count({ where: { orderId: order.id, status: In(['picked_up', 'in_transit', 'delivered']) } });
      if (!collected) cancellable = "('pending','confirmed','processing')";
    }
    const claim = await this.orders
      .createQueryBuilder()
      .update(Order)
      .set({ status: 'cancelled' })
      .where(`id = :id AND status IN ${cancellable}`, { id: order.id })
      .execute();
    if (!claim.affected) {
      throw new BadRequestException(`Order can no longer be cancelled (status: ${order.status}).`);
    }
    // An operator's reason is kept on every line that was still live.
    if (opts.reason) {
      await this.orders.manager
        .createQueryBuilder()
        .update(OrderItem)
        .set({ cancelReason: opts.reason })
        .where("orderId = :id AND fulfilment <> 'cancelled'", { id: order.id })
        .execute();
    }
    const saved = (await this.orders.findOne({ where: { id: order.id } }))!;

    // Was the money actually received? (pending mobile money / COD: no refund due)
    const refundedUsd = await this.payments.refundCancelledOrder(saved);

    // Return reserved stock.
    for (const item of saved.items ?? []) {
      // A line the seller already cancelled was restocked then.
      if (!item.productId.startsWith('ext:') && item.fulfilment !== 'cancelled') {
        await this.products.restock(item.productId, item.qty);
      }
    }

    // Void the delivery task.
    const open = await this.deliveries.find({ where: { orderId: saved.id } });
    for (const task of open) {
      if (!['unassigned', 'assigned', 'picked_up', 'in_transit'].includes(task.status)) continue;
      task.status = 'failed';
      task.failureReason = 'Order cancelled';
      await this.deliveries.save(task);
      this.emitter.toRoles(OPS_ROOMS, 'delivery:updated', task);
      if (task.riderId) this.emitter.toUser(task.riderId, 'delivery:updated', task);
    }

    this.emitter.toUser(saved.customerId, 'order:updated', saved);
    this.emitter.toRoles(OPS_ROOMS, 'order:updated', saved);
    await this.notifications.toUser(saved.customerId, {
      title: 'Order cancelled',
      body: `${saved.reference} was cancelled${opts.reason ? ` by Somba&Teka support: ${opts.reason}` : ''}.${refundedUsd > 0 ? ` $${refundedUsd.toFixed(2)} was refunded to your wallet.` : ''}`,
      type: 'order',
      entityId: saved.id,
    });
    // The sellers who were about to pack it must know to stop (the seller who cancelled it knows).
    if (!opts.bySeller) {
      await this.notifySellers(
        saved,
        'Order cancelled',
        `${saved.reference} was cancelled${opts.reason ? ` (${opts.reason})` : user.role.startsWith('admin') ? ' by Somba&Teka' : ' by the customer'}. Do not pack it.`,
      );
    }
    return saved;
  }

  /**
   * Who sees which orders: customers/riders their own, ops everything, a seller
   * only the lines of THEIR products (no address, no customer id), everyone else
   * nothing.
   */
  async list(user: { id: string; role: string }, sellerId?: string, paging?: unknown): Promise<unknown[]> {
    const { take, skip } = pageOf(paging);
    if (user.role === 'customer') {
      return this.withRiders(await this.orders.find({ where: { customerId: user.id }, order: { createdAt: 'DESC' }, take, skip }));
    }
    if (user.role === 'rider') {
      return this.orders.find({ where: { riderId: user.id }, order: { createdAt: 'DESC' }, take, skip });
    }
    if (user.role.startsWith('admin') || user.role === 'warehouse_staff') {
      // Staff queues have always been the newest 200; an explicit limit/offset pages further back.
      const staff = pageOf(paging, { def: 200 });
      return this.orders.find({ order: { createdAt: 'DESC' }, take: staff.take, skip: staff.skip });
    }
    if (user.role === 'seller') return this.listForSeller([...new Set([sellerId ?? user.id, user.id])], { take: pageOf(paging, { def: 200 }).take, skip });
    return [];
  }

  private async listForSeller(sellerIds: string[], page: { take: number; skip: number }) {
    const ids = (await Promise.all(sellerIds.map((id) => this.products.idsBySeller(id)))).flat();
    if (!ids.length) return [];
    const mine = new Set(ids);
    // Page over ORDERS first (joining lines would page over line rows), then load their lines.
    const orderIds = (
      await this.orders
        .createQueryBuilder('o')
        .select('o.id', 'id')
        .addSelect('o.createdAt', 'createdAt')
        .innerJoin('o.items', 'i')
        .where('i.productId IN (:...ids)', { ids })
        .groupBy('o.id')
        .addGroupBy('o.createdAt')
        .orderBy('o.createdAt', 'DESC')
        .offset(page.skip)
        .limit(page.take)
        .getRawMany<{ id: string }>()
    ).map((r) => r.id);
    if (!orderIds.length) return [];
    const rows = await this.orders
      .createQueryBuilder('o')
      .innerJoinAndSelect('o.items', 'i')
      .where('o.id IN (:...orderIds)', { orderIds })
      .orderBy('o.createdAt', 'DESC')
      .getMany();
    return rows.map((o) => OrdersService.sellerView(o, (o.items ?? []).filter((i) => mine.has(i.productId))));
  }

  get(id: string): Promise<Order | null> {
    return this.orders.findOne({ where: { id } });
  }

  /** Admin/finance refund; delegates to the payments service. */
  refund(orderId: string, toWallet: boolean) {
    return this.payments.refund(orderId, toWallet);
  }

  private static newReference(): string {
    const n = Math.floor(1000 + Math.random() * 9000);
    return `SOM-${Date.now().toString().slice(-5)}${n}`.slice(0, 20);
  }
}
