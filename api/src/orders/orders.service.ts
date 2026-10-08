import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  DeliveryTask,
  Order,
  OrderItem,
  OrderStatus,
  PaymentMethod,
} from '../database/entities';
import { ProductsService } from '../products/products.service';
import {
  ADMIN_ROLES,
  NotificationsService,
} from '../notifications/notifications.service';
import { RealtimeEmitter } from '../realtime/realtime-emitter';
import { PaymentsService } from '../payments/payments.service';
import { WalletService } from '../wallet/wallet.service';
import { PromosService } from '../content/promos.service';
import { SettingsService } from '../content/settings.service';

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

const OPS_ROOMS = [...ADMIN_ROLES, 'warehouse_staff'];
const ORDER_STATUSES: readonly string[] = ['pending', 'confirmed', 'processing', 'shipped', 'out_for_delivery', 'delivered', 'cancelled', 'returned'];

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(Order) private readonly orders: Repository<Order>,
    @InjectRepository(DeliveryTask)
    private readonly deliveries: Repository<DeliveryTask>,
    private readonly products: ProductsService,
    private readonly notifications: NotificationsService,
    private readonly emitter: RealtimeEmitter,
    private readonly payments: PaymentsService,
    private readonly wallet: WalletService,
    private readonly promos: PromosService,
    private readonly settings: SettingsService,
  ) {
    // Mobile-money confirmations arrive asynchronously (webhook): the payment
    // service tells us when an order's payment is finally settled.
    this.payments.registerOrderSettledHandler((payment, outcome) =>
      this.onPaymentSettled(payment, outcome),
    );
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

    const items: OrderItem[] = [];
    const stockToReserve: { productId: string; qty: number; name: string }[] = [];
    let subtotal = 0;
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

      let name: string;
      let price: number;
      let productId: string;
      if (product) {
        if (product.stock < qty) {
          throw new BadRequestException(
            product.stock > 0
              ? `Only ${product.stock} of "${product.name}" left in stock.`
              : `"${product.name}" is out of stock.`,
          );
        }
        name = product.name;
        price = product.price;
        productId = product.id;
        stockToReserve.push({ productId: product.id, qty, name: product.name });
      } else if (allowClientPriced && line.name != null && line.priceUsd != null) {
        const p = Number(line.priceUsd);
        if (!Number.isFinite(p) || p <= 0 || p > 100_000) {
          throw new BadRequestException('Invalid item price.');
        }
        name = String(line.name).slice(0, 200);
        price = Number(p.toFixed(2));
        productId = `ext:${name}`;
      } else {
        throw new BadRequestException(
          'Unknown product. Refresh the catalogue and try again.',
        );
      }

      subtotal += price * qty;
      const item = new OrderItem();
      item.productId = productId;
      item.productName = name;
      item.variant = line.variant ?? 'Default';
      item.qty = qty;
      item.priceUsd = price;
      items.push(item);
    }

    const deliveryFee = await this.resolveDeliveryFee(input.zoneId, input.deliveryFeeUsd, MAX_DELIVERY_FEE);

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
      totalUsd: total,
      zoneId: input.zoneId ?? null,
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
    await this.deliveries.save(
      this.deliveries.create({
        orderId: order.id,
        orderReference: order.reference,
        status: 'unassigned',
        address: order.shippingAddress,
        zoneId: order.zoneId,
        codAmountUsd: order.paymentMethod === 'cod' ? order.totalUsd : 0,
      }),
    );
    this.emitter.toRoles(OPS_ROOMS, 'order:created', order);
    await this.notifications.toAdmins({
      title: 'New order',
      body: `${order.reference} · $${order.totalUsd.toFixed(2)} from ${order.customerName}`,
      type: 'order',
      entityId: order.id,
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
      order.status = 'confirmed';
      const saved = await this.orders.save(order);
      await this.openFulfilment(saved);
      this.emitter.toUser(saved.customerId, 'order:updated', saved);
      return;
    }

    order.status = 'cancelled';
    const saved = await this.orders.save(order);
    for (const item of saved.items ?? []) {
      if (!item.productId.startsWith('ext:')) {
        await this.products.restock(item.productId, item.qty);
      }
    }
    this.emitter.toUser(saved.customerId, 'order:updated', saved);
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
    if ((order.status as string) === 'cancelled' || (order.status as string) === 'returned') {
      throw new BadRequestException(`A ${order.status} order can no longer change.`);
    }
    if (order.status === 'delivered' && status !== 'returned') {
      throw new BadRequestException('A delivered order can only be marked returned.');
    }
    if (order.status === 'pending' && order.paymentMethod !== 'cod') {
      const pay = await this.payments.forOrder(order.id);
      if (pay && pay.status === 'pending') {
        throw new BadRequestException('Awaiting payment — this order cannot be fulfilled yet.');
      }
    }
    order.status = status;
    const saved = await this.orders.save(order);

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
   * Customer cancels their own order while it's still cancellable (before it
   * ships). Restocks the items, refunds prepaid orders to the wallet, and voids
   * the delivery task.
   */
  async cancel(
    user: { id: string; role: string },
    orderId: string,
  ): Promise<Order> {
    const order = await this.orders.findOne({ where: { id: orderId } });
    // Same answer for "missing" and "not yours" so ids can't be probed.
    if (!order || (!user.role.startsWith('admin') && order.customerId !== user.id)) {
      throw new NotFoundException('Order not found.');
    }

    // Atomic transition: of two concurrent cancels exactly one wins, so stock is
    // restored and money refunded once.
    const claim = await this.orders
      .createQueryBuilder()
      .update(Order)
      .set({ status: 'cancelled' })
      .where("id = :id AND status IN ('pending','confirmed')", { id: order.id })
      .execute();
    if (!claim.affected) {
      throw new BadRequestException(`Order can no longer be cancelled (status: ${order.status}).`);
    }
    const saved = (await this.orders.findOne({ where: { id: order.id } }))!;

    // Was the money actually received? (pending mobile money / COD: no refund due)
    const wasPaid = await this.payments.refundCancelledOrder(saved);

    // Return reserved stock.
    for (const item of saved.items ?? []) {
      if (!item.productId.startsWith('ext:')) {
        await this.products.restock(item.productId, item.qty);
      }
    }

    // Void the delivery task.
    const task = await this.deliveries.findOne({ where: { orderId: saved.id } });
    if (task && task.status !== 'delivered') {
      task.status = 'failed';
      await this.deliveries.save(task);
      this.emitter.toRoles(OPS_ROOMS, 'delivery:updated', task);
      if (task.riderId) this.emitter.toUser(task.riderId, 'delivery:updated', task);
    }

    this.emitter.toUser(saved.customerId, 'order:updated', saved);
    this.emitter.toRoles(OPS_ROOMS, 'order:updated', saved);
    await this.notifications.toUser(saved.customerId, {
      title: 'Order cancelled',
      body: `${saved.reference} was cancelled.${wasPaid ? ' Refund credited to your wallet.' : ''}`,
      type: 'order',
      entityId: saved.id,
    });
    return saved;
  }

  /**
   * Who sees which orders: customers/riders their own, ops everything, a seller
   * only the lines of THEIR products (no address, no customer id), everyone else
   * nothing.
   */
  async list(user: { id: string; role: string }, sellerId?: string): Promise<unknown[]> {
    if (user.role === 'customer') {
      return this.orders.find({ where: { customerId: user.id }, order: { createdAt: 'DESC' } });
    }
    if (user.role === 'rider') {
      return this.orders.find({ where: { riderId: user.id }, order: { createdAt: 'DESC' } });
    }
    if (user.role.startsWith('admin') || user.role === 'warehouse_staff') {
      return this.orders.find({ order: { createdAt: 'DESC' }, take: 200 });
    }
    if (user.role === 'seller') return this.listForSeller(sellerId ?? user.id);
    return [];
  }

  private async listForSeller(sellerId: string) {
    const ids = await this.products.idsBySeller(sellerId);
    if (!ids.length) return [];
    const mine = new Set(ids);
    const rows = await this.orders
      .createQueryBuilder('o')
      .innerJoinAndSelect('o.items', 'i')
      .where('i.productId IN (:...ids)', { ids })
      .orderBy('o.createdAt', 'DESC')
      .take(200)
      .getMany();
    return rows.map((o) => {
      const items = (o.items ?? []).filter((i) => mine.has(i.productId));
      const subtotal = Number(items.reduce((t, i) => t + i.priceUsd * i.qty, 0).toFixed(2));
      return {
        id: o.id,
        reference: o.reference,
        status: o.status,
        paymentMethod: o.paymentMethod,
        createdAt: o.createdAt,
        customerName: (o.customerName ?? '').split(' ')[0],
        items,
        subtotalUsd: subtotal,
        totalUsd: subtotal,
      };
    });
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
