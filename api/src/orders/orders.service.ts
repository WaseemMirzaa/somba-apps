import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Not, QueryFailedError, Repository } from 'typeorm';
import {
  DeliveryTask,
  Hub,
  ItemFulfilment,
  Order,
  OrderItem,
  OrderRequest,
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
import { CodReceipt, PaymentsService } from '../payments/payments.service';
import { recordRefund } from '../payments/refund-ledger';
import type { RefundKind } from '../database/entities';
import { WalletService } from '../wallet/wallet.service';
import { PromosService } from '../content/promos.service';
import { CouponsService } from '../content/coupons.service';
import { SettingsService } from '../content/settings.service';
import { DeliveryService } from '../delivery/delivery.service';
import { DEFAULT_VARIANT, checkVariant, hasNoOptions, localizeVariantLabel, storedVariantGroups } from '../common/variants/variants';
import { createHash, randomUUID } from 'crypto';
import { availableFor } from '../products/variant-stock';
import { cityOf, sellerTracking } from './seller-tracking';
import type { HubName, SellerTracking } from './seller-tracking';
import { TranslationService } from '../translation/translation.service';
import { MAX_HANDLING_DAYS, assertStoreOpen, storeForListing } from '../sellers/storefront';
import { prepDaysOf, handlingDaysOf } from '../common/delivery/estimate';
import { DEFAULT_LINE_PREP, estimateOrder } from '../logistics/order-estimate';
import type { EstimateLine } from '../logistics/order-estimate';
import { linesBySeller, sellerUserId } from './order-sellers';
import { paymentMethodLabel } from '../common/payment-method';
import { LogisticsService } from '../logistics/logistics.service';
import { RoutingService } from '../logistics/routing.service';
import type { Route } from '../logistics/routing.service';
import { CUSTOMER_KINDS, isCustomerKind, isOrderFlow } from '../logistics/leg-rules';
import { PART_DELIVERED, anyDelivered, isPartiallyDelivered, lineShareUsd } from '../common/delivery/split';
import { ORDER_HUB_SQL, hubsOfOrder, orderHubParams, pushOrderToOps } from '../logistics/hub-scope';
import { parseAddressPin } from '../common/geo/geo';
import { inRoleGroup } from '../common/role-groups';
import { ORDER_ACCESS_DENIED, OrderAudience, orderAudienceOf, withoutAddress } from '../common/order-access';

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
  /** @deprecated Ignored: zones are gone, the warehouse and the fee come from the map pin. */
  zoneId?: string;
  /** @deprecated Ignored: the server charges exactly the fee `delivery:quote` returns. */
  deliveryFeeUsd?: number;
  shippingAddress?: string; // JSON string; encrypted at rest
  /** Mobile-money subscriber number that will approve the charge. */
  paymentPhone?: string;
  /** Promo code; validated and applied by the SERVER (the app only previews it). */
  promoCode?: string;
  /**
   * Idempotency key of this checkout attempt (C-01): a UUID the app makes once per attempt and resends unchanged on
   * every retry of it. The same key from the same customer always means the same order: never a second order or a
   * second charge. Optional for older apps (they get a short de-duplication window on an identical cart instead).
   */
  clientRequestId?: string;
}

/** What `orders:byRequest` knows about a checkout attempt. */
export interface OrderRequestState {
  /** none = never arrived (safe to send again with the same key); processing = still running; placed = an order exists; failed = its payment failed. */
  state: 'none' | 'processing' | 'placed' | 'failed';
  order?: Order;
}

/** A key the app may send: a UUID, or any 8-64 letters, digits, '-' and '_' (C-01). */
const CLIENT_REQUEST_ID = /^[A-Za-z0-9_-]{8,64}$/;
/** How long a request waits for an earlier one with the same key to finish before saying "still processing". */
export const ORDER_REPLAY = { waitMs: Number(process.env.ORDER_REPLAY_WAIT_MS ?? 30_000) };
const REPLAY_POLL_MS = 150;
/** A claim this old whose request never finished belongs to a request that died (process restart): it is taken over. */
const ABANDONED_CLAIM_MS = 2 * 60_000;
/**
 * Older apps send no key. An identical cart (same lines, payment method, phone, address and code) from the same
 * customer is then treated as the same attempt only WHILE THE FIRST ONE IS STILL RUNNING: the old app gives up after
 * 8 s and the shopper taps again, while the server may still be waiting 15-30 s on the payment provider. A request
 * that arrives after the first one has finished is a new order: the shopper cancelled and ordered again, or bought the
 * same thing twice on purpose, and must not be handed the earlier (maybe cancelled) order back.
 */
export const STILL_PROCESSING = 'Your order is still being processed. Check My orders in a moment before trying again.';
export const PREVIOUS_ATTEMPT_FAILED = 'This checkout did not go through and nothing was charged. Please place the order again.';

/** An earlier request with the same key is still running: the outcome is not known yet (ack `code: 'order_processing'`). */
export class OrderStillProcessingException extends BadRequestException {
  readonly code = 'order_processing';
  constructor() {
    super(STILL_PROCESSING);
  }
}

const isDuplicateKey = (e: unknown): boolean =>
  e instanceof QueryFailedError && /UNIQUE|Duplicate entry|ER_DUP_ENTRY|SQLITE_CONSTRAINT/i.test(String((e as Error).message));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The rider the customer may phone: only while the parcel is on its way. */
export interface RiderContact {
  name: string;
  phone: string | null;
}
const RIDER_VISIBLE: readonly string[] = ['shipped', 'out_for_delivery'];

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
    private readonly translations?: TranslationService,
    private readonly logisticsSvc?: LogisticsService,
    private readonly routingSvc?: RoutingService,
    private readonly coupons?: CouponsService,
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

  private get logistics(): LogisticsService {
    return this.logisticsSvc as LogisticsService;
  }

  private get routing(): RoutingService {
    return this.routingSvc as RoutingService;
  }

  /** Place an order (see {@link place}); returns the order, also when it is the replay of an earlier request. */
  async create(
    customer: { id: string; name: string },
    input: CreateOrderInput,
  ): Promise<Order> {
    return (await this.place(customer, input)).order;
  }

  /**
   * Place an order, idempotently (C-01). The checkout attempt is claimed FIRST with an insert on `order_requests`
   * (primary key = customer + key), so of N concurrent requests with one key exactly one does the work and charges;
   * the others wait for it and get the same order back (`replayed`). A refusal before any order was written frees the
   * key again (the shopper can fix the cart and retry); a payment that failed is remembered so a retry with the same
   * key reports it instead of making another cancelled order.
   */
  async place(
    customer: { id: string; name: string },
    input: CreateOrderInput,
    opts: { dedupWithoutKey?: boolean } = {},
  ): Promise<{ order: Order; replayed: boolean }> {
    const claim = this.requestKeyOf(customer.id, input, !!opts.dedupWithoutKey);
    const orderId = randomUUID(); // known before the order exists, so a waiting duplicate knows which order to look for
    if (claim) {
      const earlier = await this.claimRequest(customer.id, claim.key, orderId, claim.auto);
      if (earlier) return { order: earlier, replayed: true };
    }
    const progress = { written: false };
    try {
      const order = await this.createClaimed(customer, input, orderId, claim && !claim.auto ? claim.clientRequestId : null, progress);
      if (claim) await this.finishRequest(customer.id, claim.key, orderId, 'placed');
      return { order, replayed: false };
    } catch (err) {
      if (claim) {
        const row = progress.written ? await this.orders.findOne({ where: { id: orderId } }) : null;
        if (row && row.status !== 'cancelled') await this.finishRequest(customer.id, claim.key, orderId, 'placed'); // it exists (a later step failed)
        else if (row && !claim.auto) await this.finishRequest(customer.id, claim.key, orderId, 'failed');
        else await this.requests.delete({ customerId: customer.id, requestKey: claim.key, orderId });
      }
      throw err;
    }
  }

  /** What became of a checkout attempt, by the key the app sent (`orders:byRequest`): the app asks this after a timeout. */
  async findByRequest(customerId: string, clientRequestId: unknown): Promise<OrderRequestState> {
    const id = String(clientRequestId ?? '').trim();
    if (!CLIENT_REQUEST_ID.test(id)) throw new BadRequestException('Invalid checkout reference. Please try again.');
    const claim = await this.requests.findOne({ where: { customerId, requestKey: `k:${id}` } });
    const order = await this.orders.findOne({ where: claim ? { id: claim.orderId } : { customerId, clientRequestId: id } });
    if (!claim) return order ? { state: 'placed', order } : { state: 'none' };
    if (claim.outcome === 'failed') return order ? { state: 'failed', order } : { state: 'failed' };
    if (claim.outcome === 'placed' && order) return { state: 'placed', order };
    return { state: 'processing' };
  }

  private get requests(): Repository<OrderRequest> {
    return this.orders.manager.getRepository(OrderRequest);
  }

  /**
   * The claim key of a request: the app's own key, or (an older app on the socket, `dedupWithoutKey`) a fingerprint of
   * the cart. Server-side callers (the demo seed) place identical carts on purpose and pass neither.
   */
  private requestKeyOf(customerId: string, input: CreateOrderInput, dedupWithoutKey: boolean): { key: string; auto: boolean; clientRequestId: string } | null {
    if (input.clientRequestId != null && input.clientRequestId !== '') {
      const id = String(input.clientRequestId).trim();
      if (!CLIENT_REQUEST_ID.test(id)) throw new BadRequestException('Invalid checkout reference. Please try again.');
      return { key: `k:${id}`, auto: false, clientRequestId: id };
    }
    if (!dedupWithoutKey || !Array.isArray(input.items) || !input.items.length) return null; // (no items: refused below anyway)
    const lines = input.items
      .map((l) => [l?.productId ?? '', l?.name ?? '', l?.priceUsd ?? '', l?.qty ?? '', l?.variant ?? ''].map(String).join('\u0001'))
      .sort();
    const fp = createHash('sha256')
      .update(JSON.stringify([customerId, lines, input.paymentMethod ?? '', input.paymentPhone ?? '', input.shippingAddress ?? '', String(input.promoCode ?? '').trim().toUpperCase()]))
      .digest('hex');
    return { key: `fp:${fp}`, auto: true, clientRequestId: '' };
  }

  /**
   * Claim a checkout attempt. Returns null when THIS request owns it (go ahead), or the order of the earlier request
   * with the same key once that one has finished. Throws {@link PREVIOUS_ATTEMPT_FAILED} when the earlier one's payment
   * failed, and {@link STILL_PROCESSING} when it is still running after `ORDER_REPLAY.waitMs`.
   */
  private async claimRequest(customerId: string, key: string, orderId: string, auto: boolean): Promise<Order | null> {
    const deadline = Date.now() + ORDER_REPLAY.waitMs;
    let waited = false; // this request saw the earlier one still running
    for (;;) {
      try {
        await this.requests.insert({ customerId, requestKey: key, orderId, startedAt: new Date(), finishedAt: null, outcome: null });
        return null;
      } catch (e) {
        if (!isDuplicateKey(e)) throw e;
      }
      const row = await this.requests.findOne({ where: { customerId, requestKey: key } });
      if (!row) continue; // the earlier request gave its key back (refused before writing an order): ours now
      const takeOver = () => this.requests.delete({ customerId, requestKey: key, orderId: row.orderId }); // only THAT claim
      if (row.outcome) {
        // An older app's identical cart is the same attempt only for a request that WAITED for the first one to finish
        // (a double tap or retry while it ran). One that arrives afterwards is a new order.
        if (auto && !waited) {
          await takeOver();
          continue;
        }
        const order = await this.orders.findOne({ where: { id: row.orderId } });
        if (row.outcome === 'failed' || !order) throw new BadRequestException(PREVIOUS_ATTEMPT_FAILED);
        return order;
      }
      if (Date.now() - new Date(row.startedAt).getTime() > ABANDONED_CLAIM_MS) {
        const order = await this.orders.findOne({ where: { id: row.orderId } });
        if (order && order.status !== 'cancelled') return order;
        if (order && !auto) throw new BadRequestException(PREVIOUS_ATTEMPT_FAILED); // its key is on that order for good
        await takeOver();
        continue;
      }
      if (Date.now() >= deadline) throw new OrderStillProcessingException();
      waited = true;
      await sleep(REPLAY_POLL_MS);
    }
  }

  private async finishRequest(customerId: string, key: string, orderId: string, outcome: 'placed' | 'failed'): Promise<void> {
    await this.requests.update({ customerId, requestKey: key, orderId }, { outcome, finishedAt: new Date() });
  }

  /** The order itself, once its attempt is claimed: `orderId` is fixed in advance, `progress.written` says whether the row exists. */
  private async createClaimed(
    customer: { id: string; name: string },
    input: CreateOrderInput,
    orderId: string,
    clientRequestId: string | null,
    progress: { written: boolean },
  ): Promise<Order> {
    if (!input.items?.length) {
      throw new BadRequestException('An order needs at least one item.');
    }

    // Refuse a disabled/unavailable method BEFORE any row is written.
    await this.payments.assertMethodAllowed(input.paymentMethod);

    const MAX_QTY = 100;
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
    // The French name / option label each line carries, written next to the order as a snapshot (plan §2.1).
    const frSnapshots: ({ name?: string; variant?: string } | undefined)[] = [];
    const stockToReserve: { productId: string; qty: number; name: string; variant: string }[] = [];
    let subtotal = 0;
    // Seller-campaign discount actually applied on the lines (flash + campaign never stack).
    let campaignDiscount = 0;
    const campaignSales = new Map<string, number>();
    // The discount each campaign gave on this order (counts against its budget).
    const campaignSpend = new Map<string, number>();
    // Each line's preparation (and its store's handling): the estimate is the slowest SELLER's prep + handling + route.
    const estimateLines: EstimateLine[] = [];
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
      // A store on vacation takes no new orders (its orders in flight carry on); its handling time counts in the estimate.
      const store = product?.sellerId ? await storeForListing(this.sellers, product.sellerId) : null;
      assertStoreOpen(store);

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
        // Units of THIS option: its own count when the seller split stock by option, else the shared pool. Lines of
        // the same option in one order draw on the same units.
        const onHand = availableFor(product.stock, product.variantStock, variant === DEFAULT_VARIANT ? null : variant);
        const already = stockToReserve.filter((r) => r.productId === product.id && r.variant === variant).reduce((t, r) => t + r.qty, 0);
        if (onHand - already < qty) {
          const left = Math.max(0, onHand - already);
          const what = variant === DEFAULT_VARIANT ? `"${product.name}"` : `"${product.name}" (${variant})`;
          throw new BadRequestException(left > 0 ? `Only ${left} of ${what} left in stock.` : `${what} is out of stock.`);
        }
        name = product.name;
        // A French that is just the English fallback (translation still pending) is not frozen into the order.
        const settled = product.translationStatus === 'done' || product.nameFr !== product.name;
        const variantFr = localizeVariantLabel(variant, storedVariantGroups(product.variants), product.variantLabels.fr);
        frSnapshots.push({ name: settled ? product.nameFr : undefined, variant: variantFr !== variant || product.translationStatus === 'done' ? variantFr : undefined });
        price = product.price; // effective: the lowest of normal / flash / campaign price
        productId = product.id;
        const priced = product as PricedProduct;
        listPrice = priced.basePrice ?? product.price;
        if (priced.priceSource === 'campaign' && priced.campaignId) {
          campaignId = priced.campaignId;
          campaignPct = priced.campaignPct;
          campaignDiscount += (listPrice - price) * qty;
          campaignSales.set(campaignId, (campaignSales.get(campaignId) ?? 0) + price * qty);
          campaignSpend.set(campaignId, (campaignSpend.get(campaignId) ?? 0) + (listPrice - price) * qty);
        }
        stockToReserve.push({ productId: product.id, qty, name: product.name, variant });
        estimateLines.push({ sellerId: product.sellerId ?? null, prepDays: prepDaysOf(product.prepDays, product.deliveryDays), handlingDays: handlingDaysOf(store?.handlingDays, MAX_HANDLING_DAYS) });
      } else if (allowClientPriced && line.name != null && line.priceUsd != null) {
        const p = Number(line.priceUsd);
        if (!Number.isFinite(p) || p <= 0 || p > 100_000) {
          throw new BadRequestException('Invalid item price.');
        }
        frSnapshots.push(undefined);
        name = String(line.name).slice(0, 200);
        price = Number(p.toFixed(2));
        productId = `ext:${name}`;
        variant = String(line.variant ?? '').replace(/\s+/g, ' ').trim().slice(0, 200) || 'Default';
        estimateLines.push({ sellerId: null, prepDays: DEFAULT_LINE_PREP, handlingDays: 0 });
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

    // The warehouse and the fee follow the map pin of the delivery address and the sellers on the order, whatever
    // the app sent: the server charges exactly what `delivery:quote` shows.
    const route = await this.routeFor(input.shippingAddress, items);
    const deliveryFee = route.feeUsd;
    const estimate = estimateOrder(route, estimateLines);

    let discount = 0;
    let promoCode: string | null = null;
    if (input.promoCode?.trim()) {
      // A store coupon needs the lines (it discounts only that store's); a platform code ignores them.
      const res = await this.promos.validate(
        input.promoCode.trim(),
        subtotal,
        customer.id,
        items.map((i) => ({ productId: i.productId, sellerId: i.productId.startsWith('ext:') ? null : i.sellerId, priceUsd: i.priceUsd, qty: i.qty })),
      );
      if (!res.ok) throw new BadRequestException(res.reason ?? 'Invalid promo code.');
      discount = Math.min(Number(res.discount.toFixed(2)), subtotal); // never below zero
      promoCode = res.code ?? null;
      // A store coupon is paid by the store: each line carries its share, and the commission is charged after it.
      if (res.lineDiscounts) {
        items.forEach((item, i) => {
          const share = res.lineDiscounts![i] ?? 0;
          item.couponDiscountUsd = share;
          item.commissionUsd = Number((((item.priceUsd * item.qty - share) * item.commissionPct) / 100).toFixed(2));
        });
      }
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
    // `orderId` is known before the order exists, so the stock ledger can name it.
    const reserved: { productId: string; qty: number; variant: string }[] = [];
    const release = async () => {
      for (const r of reserved) await this.products.restock(r.productId, r.qty, { variant: r.variant, orderId, reason: 'cancel_restock' });
    };
    try {
      for (const r of stockToReserve) {
        if (!(await this.products.reserve(r.productId, r.qty, { variant: r.variant, orderId, reason: 'sale' }))) {
          throw new BadRequestException(`"${r.name}" just sold out or has too little stock left.`);
        }
        reserved.push(r);
      }
    } catch (err) {
      await release();
      throw err;
    }

    const order = this.orders.create({
      id: orderId,
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
      destinationHubId: route.destinationHubId,
      destinationAreaId: route.destinationAreaId,
      originHubIds: route.originHubIds,
      originBySeller: route.originBySeller,
      routeBySeller: route.routeBySeller,
      estimatedDeliveryDate: estimate.date,
      deliveryMode: estimate.deliveryMode,
      shippingAddress: input.shippingAddress ?? null,
      clientRequestId,
      items,
    });
    let saved: Order;
    try {
      // The order and its other-language names are one transaction: a line never exists without its snapshot.
      saved = await this.orders.manager.transaction(async (m) => {
        // C-03: the code's limits are checked again under a lock on the promo row, FIRST in this transaction, and the
        // order is written before the lock is released: concurrent checkouts can never use a code more than allowed.
        if (promoCode) await this.promos.assertRedeemableIn(m, promoCode, customer.id);
        const row = await m.save(order);
        const rows: { entityId: string; field: string; locale: string; value: string }[] = [];
        // `orders.create` copied the lines into entities of its own: the saved ones (with ids) are on the row.
        (row.items ?? items).forEach((item, i) => {
          const snap = frSnapshots[i];
          if (snap?.name) rows.push({ entityId: item.id, field: 'productName', locale: 'fr', value: snap.name });
          if (snap?.variant && !hasNoOptions(item.variant)) rows.push({ entityId: item.id, field: 'variant', locale: 'fr', value: snap.variant });
          item.productNameFr = snap?.name ?? item.productName;
          item.variantFr = hasNoOptions(item.variant) ? null : (snap?.variant ?? item.variant); // no options -> null, never "Default"
        });
        await this.translations?.snapshot(m, rows);
        return row;
      });
    } catch (err) {
      await release();
      throw err;
    }
    progress.written = true;

    // Charge for the order. Wallet confirms immediately; COD stays pending
    // until the rider collects; mobile money stays pending until the subscriber
    // approves on their phone, and a Stripe card until the customer completes
    // the card sheet (the webhook then confirms). Without Stripe (non-production
    // only) the card is a mock that confirms at once.
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
      void this.products.recordCampaignSale(campaignId, revenue, campaignSpend.get(campaignId) ?? 0).catch(() => undefined);
    }

    this.emitter.toUser(customer.id, 'order:created', saved);
    void this.alertRouteFallback(saved, route);
    if (awaitingPayment) {
      // Not fulfillable yet: ops hear about it only once the money is in.
      // A card has no request on a phone: the customer finishes it in the card sheet.
      const card = payment.method === 'stripe_card';
      await this.notifications.toUser(customer.id, {
        title: card ? 'Complete your payment' : 'Approve your payment',
        body: card
          ? `Complete the card payment to confirm ${saved.reference}.`
          : `Approve the ${paymentMethodLabel(payment.method)} request on your phone to confirm ${saved.reference}.`,
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

  /** Make a paid (or COD) order visible: the pickup legs are planned, then admins, warehouses and sellers are told. */
  private async openFulfilment(order: Order): Promise<void> {
    await this.logistics.planOrder(order);
    await this.announceOrder(order);
  }

  /** Tell the warehouse, admins and sellers about a new order. (The pickup tasks tell their own warehouse's staff.) */
  private async announceOrder(order: Order): Promise<void> {
    pushOrderToOps(this.emitter, 'order:created', order);
    await this.notifications.toAdmins({
      title: 'New order',
      body: `${order.reference} · $${order.totalUsd.toFixed(2)} from ${order.customerName}`,
      type: 'order',
      entityId: order.id,
    }, 'orderOps'); // Operations (and the super admin) run orders; the other departments do not open them from here
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

  /**
   * The route and fee of an order: nearest warehouse (with riders) to the customer's map pin as the destination, the
   * origin warehouse of each seller, and base + per-km + transfer fee. With `requirePinnedAddress` on, an address
   * without a pin is refused; otherwise it falls back to a warehouse of the same city (and admins are alerted).
   */
  private async routeFor(shippingAddress: string | undefined, items: OrderItem[]): Promise<Route> {
    if (!parseAddressPin(shippingAddress).point && (await this.settings.get('requirePinnedAddress')) === 'true') {
      throw new BadRequestException('Pin your delivery address on the map.');
    }
    return this.routing.route({ shippingAddress, sellerIds: items.map((i) => i.sellerId ?? null) });
  }

  /**
   * The order needs a human's attention: the address has no map pin (the fee uses no distance), or the warehouse that
   * covers its area (delivery or a seller's pickup) has no active rider and another one stands in, or nobody has a rider.
   * Admins and the staff of the warehouses involved are told.
   */
  private async alertRouteFallback(order: Order, route: Route): Promise<void> {
    try {
      const tell = async (notice: { title: string; body: string }, hubIds: (string | null)[]) => {
        const n = { ...notice, type: 'order' as const, entityId: order.id };
        await this.notifications.toAdmins(n, 'logisticsDesk');
        const staff = new Set<string>();
        for (const id of new Set(hubIds.filter((x): x is string => !!x))) for (const u of await this.logistics.staffIds(id)) staff.add(u);
        if (staff.size) await this.notifications.toUsers([...staff], n);
      };
      if (!route.pinned) {
        await tell(
          { title: 'Address without a map pin', body: `${order.reference}: the delivery address has no map pin, so it was routed to ${route.destinationHub.name}.` },
          [route.destinationHubId],
        );
      }
      const stands = [
        { fallback: route.fallback, hubId: route.destinationHubId, hubName: route.destinationHub.name, coveringId: route.coveringHubId, coveringName: route.coveringHubName },
        ...route.origins.map((o) => ({ fallback: o.fallback, hubId: o.hubId, hubName: o.hubName, coveringId: o.coveringHubId, coveringName: o.coveringHubName })),
      ].filter((s) => s.fallback);
      if (stands.some((s) => s.fallback === 'no_riders')) {
        const s = stands.find((x) => x.fallback === 'no_riders') as (typeof stands)[number];
        await tell(
          { title: 'No warehouse with riders', body: `${order.reference}: no warehouse has an active rider, so it was routed to ${s.hubName}. Add riders there.` },
          stands.filter((x) => x.fallback === 'no_riders').map((x) => x.hubId),
        );
      }
      // Lanes exist but none connects two of the warehouses the parcels must travel between: they go direct.
      for (const u of route.unconnected) {
        await tell(
          { title: 'Warehouses not connected', body: `${order.reference}: no lane connects ${u.fromHubName} to ${u.toHubName}, so the parcel goes direct.` },
          [u.fromHubId, u.toHubId],
        );
      }
      for (const s of stands.filter((x) => x.fallback === 'city' || x.fallback === 'nearest')) {
        await tell(
          { title: 'Warehouse without riders', body: `${order.reference}: ${s.coveringName ?? 'the covering warehouse'} has no active rider, so ${s.hubName} will handle it. Add riders to ${s.coveringName ?? 'the covering warehouse'}.` },
          [s.hubId, s.coveringId],
        );
      }
    } catch {
      // Best effort.
    }
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
    // Every placement / cancellation of an order passes through here: a coupon it carries has a new use count.
    if (order?.promoCode) this.coupons?.usageChanged(order.promoCode);
    if (!order?.items?.length) return;
    for (const [sellerId, items] of await this.linesBySeller(order)) {
      const userId = await this.sellerUserId(sellerId); // demo products may store the user id directly
      const mine = await sellerTracking(this.orders.manager, [order.id], [sellerId, userId]).catch(() => new Map<string, SellerTracking>());
      this.emitter.toUser(userId, event, OrdersService.sellerView(order, items, { tracking: mine.get(order.id) ?? null }));
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
  static sellerView(order: Order, items: OrderItem[], extra: { tracking?: SellerTracking | null } = {}) {
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
      // Coarse place only (the city); the street, the number and the contact stay private.
      city: cityOf(order.shippingAddress),
      // The journey of the parcel from the delivery tasks (rider first name, legs, times); null when none exists yet.
      tracking: extra.tracking ?? null,
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
  static packageStatus(order: Pick<Order, 'status' | 'paymentMethod'>, items: (Pick<OrderItem, 'fulfilment'> & Partial<Pick<OrderItem, 'deliveredAt'>>)[]): string {
    const live = items.filter((i) => i.fulfilment !== 'cancelled');
    if (!live.length) return 'cancelled';
    if (order.status === 'cancelled' || (order.status === 'pending' && !OrdersService.fulfillable(order))) return order.status;
    // A split order delivers each seller's parcel on its own: this seller's package is delivered once all their lines reached the customer.
    if (live.every((i) => !!i.deliveredAt)) return 'delivered';
    if (live.every((i) => i.fulfilment === 'received')) {
      // 'shipped' means every parcel is at a warehouse: the package is still "at hub" until the delivery rider is on the road.
      return ['out_for_delivery', 'delivered', 'returned'].includes(order.status) ? order.status : 'at_hub';
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
    // The rider is shown only while a customer leg (delivery or express) is on the road (picked up or in transit), whatever the order's status:
    // after a partial leg is delivered the order still reads shipped / out for delivery, but nobody is on the road. The order-status rule
    // is only the fallback for orders whose customer legs are all legacy (`sellerIds` null, made before split delivery) or not planned yet.
    const candidates = orders.filter((o) => !['cancelled', 'returned', 'delivered'].includes(o.status));
    const onRoad = candidates.length
      ? await this.orders.manager.find(DeliveryTask, { where: { orderId: In(candidates.map((o) => o.id)), kind: In([...CUSTOMER_KINDS]) }, select: ['id', 'orderId', 'riderId', 'status', 'sellerIds'], order: { createdAt: 'DESC' } })
      : [];
    const legRider = new Map<string, string>();
    const modern = new Set<string>(); // orders that have a customer leg that knows its sellers
    for (const t of onRoad) {
      if (t.sellerIds) modern.add(t.orderId);
      if (t.riderId && ['picked_up', 'in_transit'].includes(t.status) && !legRider.has(t.orderId)) legRider.set(t.orderId, t.riderId);
    }
    const riderOf = (o: Order): string | null => legRider.get(o.id) ?? (!modern.has(o.id) && RIDER_VISIBLE.includes(o.status) ? o.riderId : null);
    const ids = [...new Set(orders.map(riderOf).filter((x): x is string => !!x))];
    if (!ids.length) return orders;
    const riders = new Map((await this.orders.manager.find(User, { where: { id: In(ids) } })).map((u) => [u.id, u]));
    return orders.map((o) => {
      const id = riderOf(o);
      const r = id ? riders.get(id) : undefined;
      return r ? Object.assign(Object.create(Object.getPrototypeOf(o)), o, { rider: { name: r.name, phone: r.phone ?? null } }) : o;
    });
  }

  /**
   * What a customer gets of their orders: `withRiders` (the rider's contact while it is on the road), plus the parcel's
   * journey as `tracking` (the same shape the seller gets, with the warehouses named on each leg: `fromHub` / `toHub`)
   * and `hubs: { destination, origins, bySeller }` (names, so the app need not infer the route; `bySeller` maps each seller id of the
   * lines to the warehouse that collects from them, because `origins` follows no line order). `tracking` is null before the
   * first delivery task exists. Never carries a phone, an address or the handover code of anyone else.
   */
  async customerViews(orders: Order[]): Promise<(Order & { rider?: RiderContact; tracking: SellerTracking | null; partiallyDelivered: boolean; hubs: { destination: HubName | null; origins: HubName[]; bySeller: Record<string, HubName> } })[]> {
    const withRider = await this.withRiders(orders);
    if (!orders.length) return [];
    const hubIds = [...new Set(orders.flatMap((o) => hubsOfOrder(o)))];
    const names = new Map<string, HubName>();
    // Orders placed before `originBySeller` existed: read it back from their pickup legs.
    const pickups = new Map<string, Record<string, string>>();
    if (this.hubs) {
      const taskHubs = await this.orders.manager.find(DeliveryTask, { where: { orderId: In(orders.map((o) => o.id)) }, select: ['id', 'orderId', 'kind', 'sellerId', 'fromHubId', 'toHubId'] }).catch(() => [] as DeliveryTask[]);
      for (const t of taskHubs) if (t.kind === 'pickup' && t.sellerId && t.toHubId) pickups.set(t.orderId, { ...(pickups.get(t.orderId) ?? {}), [t.sellerId]: t.toHubId });
      const wanted = new Set([...hubIds, ...Object.values(Object.fromEntries([...pickups].flatMap(([, m]) => Object.entries(m)))), ...taskHubs.flatMap((t) => [t.fromHubId, t.toHubId]).filter((x): x is string => typeof x === 'string')]);
      if (wanted.size) for (const h of await this.hubs.find({ where: { id: In([...wanted]) } }).catch(() => [] as Hub[])) names.set(h.id, { id: h.id, name: h.name, city: h.city ?? null });
    }
    const tracking = await sellerTracking(this.orders.manager, orders.map((o) => o.id), undefined, { hubs: names }).catch(() => new Map<string, SellerTracking>());
    return withRider.map((o) =>
      Object.assign(Object.create(Object.getPrototypeOf(o)), o, {
        tracking: tracking.get(o.id) ?? null,
        // Some live line reached the customer while another has not (a split order between its legs). A fully delivered order is simply delivered.
        partiallyDelivered: isPartiallyDelivered(o.items),
        hubs: {
          destination: (o.destinationHubId && names.get(o.destinationHubId)) || null,
          origins: (Array.isArray(o.originHubIds) ? o.originHubIds : []).map((id) => names.get(id)).filter((h): h is HubName => !!h),
          bySeller: Object.fromEntries(
            Object.entries(o.originBySeller ?? pickups.get(o.id) ?? {})
              .map(([sellerId, hubId]) => [sellerId, names.get(hubId)] as const)
              .filter((e): e is [string, HubName] => !!e[1]),
          ),
        },
      }),
    );
  }

  /** `toUser` view of order events: the journey and the rider's contact, only for the order's own customer. */
  private customerPush(userId: string, payload: unknown): unknown | Promise<unknown> {
    const o = payload as Order | null;
    if (!o || o.customerId !== userId || !o.id) return payload;
    return this.customerViews([o]).then(([v]) => v);
  }

  /** Every id a seller account's listings may carry (the store id, and the user id on demo data). */
  private async sellerKeys(userId: string): Promise<Set<string>> {
    const row = await this.sellers.findOne({ where: { userId } });
    return new Set([userId, ...(row ? [row.id] : [])]);
  }

  /** The customer's handover code for an order that is on its way (null when none applies). */
  async deliveryCode(customerId: string, orderId: string): Promise<{ code: string | null; required: boolean }> {
    const order = await this.orders.findOne({ where: { id: orderId } });
    if (!order || order.customerId !== customerId) throw new NotFoundException('Order not found.');
    const required = (await this.settings.get('requireDeliveryCode')) === 'true';
    // While a customer leg is open (a split order has one at a time, each with its own code); nothing to hand over once the order is over.
    const over = ['cancelled', 'returned', 'delivered'].includes(order.status);
    return { required, code: required && !over ? await this.delivery.codeForOrder(orderId) : null };
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
    // This seller's pickup is ready for the warehouse's rider; the other sellers' pickups are independent.
    const live = (saved.items ?? []).filter((i) => i.fulfilment !== 'cancelled' && !i.productId.startsWith('ext:'));
    const allReady = live.every((i) => i.fulfilment !== 'open');
    const task = await this.logistics.markSellerReady(orderId, [...keys]);
    if (!task) throw new BadRequestException('This order has no delivery waiting for pickup.');
    const sellersLeft = new Set(live.filter((i) => i.fulfilment === 'open').map((i) => i.sellerName ?? i.sellerId ?? 'Seller')).size;
    this.emitter.toUser(saved.customerId, 'order:updated', saved);
    pushOrderToOps(this.emitter, 'order:updated', saved);
    await this.notifications.toAdmins({
      title: allReady ? 'Parcel ready for pickup' : 'Seller package ready',
      body: allReady
        ? `${order.reference} is packed and ready.`
        : `${order.reference}: one seller's package is ready, waiting for ${sellersLeft} more seller${sellersLeft > 1 ? 's' : ''}.`,
      type: 'delivery',
      entityId: order.id,
    }, 'logisticsDesk');
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

    const { done, refund, prepaid } = await this.cancelLines(order, targets, reason, { from: ['open', 'ready'], kind: 'seller_cancel', memo: `Refund: seller cancelled part of ${order.reference}` });
    if (!done) throw new BadRequestException('These items were just updated. Refresh and try again.');

    const saved = (await this.orders.findOne({ where: { id: order.id } }))!;
    // A seller with nothing left to send has no parcel to collect; the other parcels may now be complete.
    if (!(saved.items ?? []).some((i) => mine.some((m) => m.id === i.id) && i.fulfilment !== 'cancelled')) {
      await this.logistics.onSellerCancelled(order.id, [...keys]);
    }

    this.emitter.toUser(saved.customerId, 'order:updated', saved);
    pushOrderToOps(this.emitter, 'order:updated', saved);
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
    }, 'orderOps');
    return OrdersService.sellerView(saved, (saved.items ?? []).filter((i) => mine.some((t) => t.id === i.id)));
  }

  /**
   * Cancel some lines of an order and settle them on their own (taken out of `sellerCancel`, shared with a delivery that was given up):
   *  - claim the lines atomically, from the fulfilment states in `from`: two concurrent cancels refund once;
   *  - prepaid: refund their value less their share of the promo discount to the customer's wallet (recorded and capped like every refund);
   *  - cash on delivery: the payment, still pending, asks for that much less, and the open customer leg's cash is worked out again;
   *  - restock them.
   * Returns `done: false` when another request cancelled them first. The caller tells the people involved.
   */
  private async cancelLines(
    order: Order,
    targets: OrderItem[],
    reason: string,
    opts: { from: ItemFulfilment[]; kind: RefundKind; memo: string },
  ): Promise<{ done: boolean; refund: number; prepaid: boolean }> {
    // The promo discount is shared across lines pro rata, so a partial refund never exceeds what was paid.
    const value = targets.reduce((t, i) => t + i.priceUsd * i.qty, 0);
    const refund = lineShareUsd(order, value);
    const payment = await this.payments.forOrder(order.id);
    const prepaid = order.paymentMethod !== 'cod' && payment?.status === 'succeeded';

    const done = await this.orders.manager.transaction(async (m) => {
      // Claim the lines atomically: two concurrent cancels refund once.
      const claim = await m
        .createQueryBuilder()
        .update(OrderItem)
        .set({ fulfilment: 'cancelled', cancelReason: reason })
        .where('id IN (:...ids) AND fulfilment IN (:...from)', { ids: targets.map((i) => i.id), from: opts.from })
        .execute();
      if ((claim.affected ?? 0) !== targets.length) return false;
      if (prepaid && payment && refund > 0) {
        const per = targets.length ? refund / value : 0;
        for (const i of targets) {
          await m.update(OrderItem, { id: i.id }, { refundedUsd: Number((i.priceUsd * i.qty * per).toFixed(2)) });
        }
        // C-refund: recorded and capped like every refund (a payment already refunded cannot be refunded again here).
        await recordRefund(m, { payment, amountUsd: refund, to: 'wallet', kind: opts.kind, memo: opts.memo });
        await this.wallet.apply(order.customerId, 'refund', refund, opts.memo, m);
      }
      if (order.paymentMethod === 'cod' && refund > 0 && payment && payment.status === 'pending') {
        // Less to collect at the door.
        await m.update(Payment, { id: payment.id }, { amountUsd: Math.max(0, Number((payment.amountUsd - refund).toFixed(2))) });
      }
      return true;
    });
    if (!done) return { done, refund, prepaid };
    if (order.paymentMethod === 'cod' && refund > 0) await this.logistics.recomputeCod(order.id);
    for (const i of targets) {
      if (!i.productId.startsWith('ext:')) await this.products.restock(i.productId, i.qty, { variant: i.variant, orderId: order.id, reason: 'cancel_restock' });
    }
    return { done, refund, prepaid };
  }

  /**
   * A delivery attempt failed. The order goes back to "confirmed" and a fresh
   * task is queued for another attempt; after DELIVERY_MAX_ATTEMPTS the order is
   * cancelled, the stock released and any prepaid money refunded.
   */
  private async onDeliveryFailed(task: DeliveryTask, reason: string): Promise<void> {
    // Legs of returns, replacements and exchanges never cancel the order: retry, then hand the case to staff.
    if (!isOrderFlow(task)) {
      if (this.logistics.canRetry(task)) await this.logistics.reopen(task);
      else await this.logistics.alertExhausted(task, reason);
      return;
    }
    const order = await this.orders.findOne({ where: { id: task.orderId } });
    if (!order || order.status === 'cancelled' || order.status === 'returned' || order.status === 'delivered') return;
    const max = Number(process.env.DELIVERY_MAX_ATTEMPTS ?? 3);
    // A transfer between warehouses is not the customer's problem: retry it and call staff after the limit.
    if (task.kind === 'transfer') {
      if (this.logistics.canRetry(task)) await this.logistics.reopen(task);
      else await this.logistics.alertExhausted(task, reason);
      return;
    }
    // A split order: parts of it may already be with the customer, and the leg that failed may carry only part of what is left.
    const delivered = anyDelivered(order.items);
    const completes = await this.logistics.completesOrder(task);
    // An express parcel the rider already collected is in their hands: it goes back to the warehouse (a `pickup` leg of the same rider) and a
    // normal delivery follows, whatever the attempt count. The order is never cancelled around goods on the road, and it keeps its status.
    const collected = task.kind === 'express' && !!task.pickedUpAt;
    if (task.attempts >= max && !collected) {
      if (delivered || !completes) {
        await this.giveUpLeg(order, task, reason);
        return;
      }
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
        if (!item.productId.startsWith('ext:') && item.fulfilment !== 'cancelled') await this.products.restock(item.productId, item.qty, { variant: item.variant, orderId: saved.id, reason: 'cancel_restock' });
      }
      await this.logistics.voidOrderTasks(saved.id);
      this.emitter.toUser(saved.customerId, 'order:updated', saved);
      pushOrderToOps(this.emitter, 'order:updated', saved);
      await this.notifications.toUser(saved.customerId, {
        title: 'Order cancelled',
        body: `${saved.reference} could not be delivered after ${task.attempts} attempts (${reason}).${refunded > 0 ? ` $${refunded.toFixed(2)} was refunded to your wallet.` : ''}`,
        type: 'order',
        entityId: saved.id,
      });
      return;
    }
    // Back to "confirmed" (the customer may still cancel; the re-opened leg moves the order forward again). A leg that does not finish
    // the order, or an order that is partly delivered, keeps its status: the order is further along than this one leg, and cannot be cancelled.
    const keepStatus = delivered || !completes || collected;
    if (!keepStatus) order.status = 'confirmed';
    order.riderId = null;
    const saved = await this.orders.save(order);
    const next = await this.logistics.reopen(task);
    this.emitter.toUser(saved.customerId, 'order:updated', saved);
    pushOrderToOps(this.emitter, 'order:updated', saved);
    await this.notifications.toUser(saved.customerId, {
      title: 'Delivery attempt failed',
      body: `${saved.reference}: ${reason}. We will try again (attempt ${collected ? Math.min(max, task.attempts + 1) : next.attempts} of ${max}).${keepStatus ? '' : ' You can also cancel the order.'}`,
      type: 'order',
      entityId: saved.id,
    });
  }

  /**
   * The attempts ran out on a customer leg that cannot take the whole order down with it (part of the order was delivered already,
   * or the leg carries only some sellers): ONLY its lines are cancelled (refunded, or less cash to collect, and restocked), a
   * `return_to_seller` leg per seller brings the goods back from the warehouse, and the customer is told. If nothing is left to
   * deliver, the order is delivered; otherwise the parcels still waiting are planned as usual.
   */
  private async giveUpLeg(order: Order, task: DeliveryTask, reason: string): Promise<void> {
    const lines = await this.linesOfLeg(order, task);
    const targets = lines.filter((i) => i.fulfilment !== 'cancelled' && !i.deliveredAt);
    if (targets.length) {
      const { done, refund, prepaid } = await this.cancelLines(order, targets, 'Could not be delivered', { from: ['open', 'ready', 'received'], kind: 'cancellation', memo: `Refund: part of ${order.reference} could not be delivered` });
      if (!done) return;
      await this.logistics.returnCargoToSellers(task, targets);
      const names = targets.map((i) => i.productName).join(', ');
      await this.notifications.toUser(order.customerId, {
        title: 'Items could not be delivered',
        body: `${order.reference}: ${names} could not be delivered (${reason}).${prepaid && refund > 0 ? ` $${refund.toFixed(2)} was refunded to your wallet.` : ''}`,
        type: 'order',
        entityId: order.id,
      });
    }
    // Plan what waits; an order with nothing left to deliver is delivered there and its cash is settled.
    await this.logistics.planNext(order.id);
    const saved = (await this.orders.findOne({ where: { id: order.id } }))!;
    this.emitter.toUser(saved.customerId, 'order:updated', saved);
    pushOrderToOps(this.emitter, 'order:updated', saved);
  }

  /** The lines a customer leg carries: its sellers' lines (a legacy leg carries every line). */
  private async linesOfLeg(order: Order, task: DeliveryTask): Promise<OrderItem[]> {
    if (!task.sellerIds) return order.items ?? [];
    const mine = new Set(task.sellerIds.map((k) => k ?? '_none'));
    const out: OrderItem[] = [];
    for (const [key, lines] of await this.logistics.linesBySellerKey(order)) if (mine.has(key)) out.push(...lines);
    return out;
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
      await this.logistics.planOrder(order);
      order.status = 'confirmed';
      const saved = await this.orders.save(order);
      await this.announceOrder(saved);
      this.emitter.toUser(saved.customerId, 'order:updated', saved);
      return;
    }

    // The order is cancelled FIRST and its stock put back second, on purpose: stock and orders are separate writes, and a
    // crash between them must lose a unit (visible in the stock ledger, fixed by a count) rather than release stock for an
    // order that could still be confirmed by a late payment and so oversell. The order shows "cancelled" for a few
    // milliseconds before the stock is back; anything that checks both (tests, smoke) waits for the restock.
    order.status = 'cancelled';
    const saved = await this.orders.save(order);
    for (const item of saved.items ?? []) {
      // A line the seller already cancelled was restocked then.
      if (!item.productId.startsWith('ext:') && item.fulfilment !== 'cancelled') {
        await this.products.restock(item.productId, item.qty, { variant: item.variant, orderId: saved.id, reason: 'cancel_restock' });
      }
    }
    this.emitter.toUser(saved.customerId, 'order:updated', saved);
    // Sellers saw the order as awaiting payment: the fanout tells them it is gone.
    pushOrderToOps(this.emitter, 'order:updated', saved);
    await this.notifications.toUser(saved.customerId, {
      title: 'Order cancelled',
      body: `${saved.reference} was cancelled: ${payment.failureReason ?? 'payment was not completed'}.`,
      type: 'order',
      entityId: saved.id,
    });
  }

  /**
   * Operator moves an order ONE step forward (see [nextOrderStatus]); anything else
   * is refused so a status can never skip steps or rewind. Marking it `delivered`
   * by hand also closes the open delivery task(s) and collects cash on delivery.
   */
  async updateStatus(
    orderId: string,
    status: OrderStatus,
    actor?: { id: string; name: string; role: string },
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
      const now = new Date();
      let receipt: CodReceipt | undefined;
      for (const task of open) {
        task.status = 'delivered';
        task.deliveredAt = now;
        // C-cod: the operator who closes a COD delivery by hand takes responsibility for its cash. It is recorded as collected
        // by them and settled at once (it never shows up as cash a rider holds), and it goes in the payment's audit line.
        const due = isCustomerKind(task.kind) ? Math.round(task.codAmountUsd * 100) / 100 : 0;
        if (due > 0 && actor && !task.codCollectedAt) {
          task.codCollectedUsd = due;
          task.codCollectedAt = now;
          task.codCollectedById = actor.id;
          task.codHandedOverUsd = due;
          receipt = { amountUsd: due, byId: actor.id, byName: actor.name, byRole: actor.role, at: now, taskId: task.id, source: 'admin_close' };
        }
        await this.deliveries.save(task);
        await this.logistics.emitTask(task);
      }
      // Every line that had not reached the customer has now (the order is delivered by hand): stamp them with the closing leg.
      const closer = open.find((t) => isCustomerKind(t.kind));
      await this.orders.manager.update(OrderItem, { orderId: saved.id, deliveredAt: IsNull(), fulfilment: Not('cancelled') }, { deliveredAt: now, deliveryTaskId: closer?.id ?? null });
      await this.payments.markCollected(saved.id, receipt);
    }

    // Everyone who cares about this order hears about it instantly.
    this.emitter.toUser(saved.customerId, 'order:updated', saved);
    pushOrderToOps(this.emitter, 'order:updated', saved);
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
    return this.cancel(user, orderId, { allowProcessing: true, reason, asOperator: true });
  }

  /**
   * Customer cancels their own order while it's still cancellable (before it
   * ships). Restocks the items, refunds prepaid orders to the wallet, and voids
   * the delivery task.
   */
  async cancel(
    user: { id: string; role: string },
    orderId: string,
    opts: { allowProcessing?: boolean; reason?: string; bySeller?: boolean; asOperator?: boolean } = {},
  ): Promise<Order> {
    const order = await this.orders.findOne({ where: { id: orderId } });
    // The order's own customer, or an operator on the explicit operator path (`adminCancel`, `orders:updateStatus`) — never
    // just "any admin*" (A-04). Same answer for "missing" and "not yours" so ids can't be probed.
    const operator = opts.asOperator === true && inRoleGroup(user.role, 'orderOps');
    if (!order || (!operator && order.customerId !== user.id)) {
      throw new NotFoundException('Order not found.');
    }
    // A split order whose first part already reached the customer cannot be called off: the rest is stopped by support.
    if (isPartiallyDelivered(order.items)) throw new BadRequestException(PART_DELIVERED);

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
        await this.products.restock(item.productId, item.qty, { variant: item.variant, orderId: saved.id, reason: 'cancel_restock' });
      }
    }

    // Void every open leg of the journey (the warehouses and riders following them are told).
    await this.logistics.voidOrderTasks(saved.id);

    this.emitter.toUser(saved.customerId, 'order:updated', saved);
    pushOrderToOps(this.emitter, 'order:updated', saved);
    await this.notifications.toUser(saved.customerId, {
      title: 'Order cancelled',
      body: `${saved.reference} was cancelled${opts.reason ? ` by KOMORIKO support: ${opts.reason}` : ''}.${refundedUsd > 0 ? ` $${refundedUsd.toFixed(2)} was refunded to your wallet.` : ''}`,
      type: 'order',
      entityId: saved.id,
    });
    // The sellers who were about to pack it must know to stop (the seller who cancelled it knows).
    if (!opts.bySeller) {
      await this.notifySellers(
        saved,
        'Order cancelled',
        `${saved.reference} was cancelled${opts.reason ? ` (${opts.reason})` : operator ? ' by KOMORIKO' : ' by the customer'}. Do not pack it.`,
      );
    }
    return saved;
  }

  /**
   * Who sees which orders: customers/riders their own, ops everything, a seller
   * only the lines of THEIR products (no address, no customer id), everyone else
   * nothing.
   */
  async list(user: { id: string; role: string }, sellerId?: string, paging?: unknown, hubId?: string | null): Promise<unknown[]> {
    const { take, skip } = pageOf(paging);
    if (user.role === 'customer') {
      return this.customerViews(await this.orders.find({ where: { customerId: user.id }, order: { createdAt: 'DESC' }, take, skip }));
    }
    if (user.role === 'rider') {
      return this.orders.find({ where: { riderId: user.id }, order: { createdAt: 'DESC' }, take, skip });
    }
    if (user.role.startsWith('admin') || user.role === 'warehouse_staff') {
      // An admin role sees what its department needs: operations and support the whole order, finance and moderation the order without the
      // customer's address, marketing nothing (the gateway says so; this is the same rule at the data layer).
      const audience: OrderAudience = user.role === 'warehouse_staff' ? 'full' : orderAudienceOf(user.role);
      if (audience === 'none') throw new ForbiddenException(ORDER_ACCESS_DENIED);
      const rows = await this.staffOrders(paging, hubId);
      return audience === 'full' ? rows : rows.map((o) => withoutAddress(o));
    }
    // The seller's list is paged, searched and filtered in the database (SellerOrdersService registers itself here).
    if (user.role === 'seller' && this.sellerLister) return this.sellerLister(user, sellerId, paging);
    if (user.role === 'seller') return this.listForSeller([...new Set([sellerId ?? user.id, user.id])], { take: pageOf(paging, { def: 200 }).take, skip });
    return [];
  }

  /** The staff queue: the newest 200 by default (an explicit limit/offset pages further back); one warehouse's orders when `hubId` is given. */
  private async staffOrders(paging: unknown, hubId?: string | null): Promise<Order[]> {
    const staff = pageOf(paging, { def: 200 });
    // Warehouse staff see the orders their own warehouse delivers or collects for; admins (no hub) see all.
    if (hubId) {
      const ids = (
        await this.orders
          .createQueryBuilder('o')
          .select('o.id', 'id')
          .addSelect('o.createdAt', 'createdAt')
          .where(ORDER_HUB_SQL, orderHubParams(hubId))
          .orderBy('o.createdAt', 'DESC')
          .offset(staff.skip)
          .limit(staff.take)
          .getRawMany<{ id: string }>()
      ).map((r) => r.id);
      if (!ids.length) return [];
      return this.orders.find({ where: { id: In(ids) }, order: { createdAt: 'DESC' } });
    }
    return this.orders.find({ order: { createdAt: 'DESC' }, take: staff.take, skip: staff.skip });
  }

  private sellerLister: ((user: { id: string; role: string }, sellerId: string | undefined, paging: unknown) => Promise<unknown[]>) | null = null;

  /** The seller order list (see SellerOrdersService) takes over `orders:list` for sellers: `limit`, `offset`, `q`, `status`, `from`, `to`. */
  registerSellerLister(fn: NonNullable<OrdersService['sellerLister']>): void {
    this.sellerLister = fn;
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

  /** Admin/finance refund; delegates to the payments service (which caps it and records it in the refund ledger). */
  refund(orderId: string, toWallet: boolean) {
    return this.payments.refund(orderId, toWallet);
  }

  private static newReference(): string {
    const n = Math.floor(1000 + Math.random() * 9000);
    return `SOM-${Date.now().toString().slice(-5)}${n}`.slice(0, 20);
  }
}
