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
}

const OPS_ROOMS = [...ADMIN_ROLES, 'warehouse_staff'];

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
  ) {}

  async create(
    customer: { id: string; name: string },
    input: CreateOrderInput,
  ): Promise<Order> {
    if (!input.items?.length) {
      throw new BadRequestException('An order needs at least one item.');
    }

    const MAX_QTY = 100;
    const MAX_DELIVERY_FEE = Number(process.env.MAX_DELIVERY_FEE_USD ?? 50);
    // Only dev/demo may accept prices the client invents. In production every
    // line must resolve to a live listing and is priced from OUR database.
    const allowClientPriced =
      process.env.ALLOW_CLIENT_PRICED_ITEMS === 'true' ||
      process.env.NODE_ENV !== 'production';

    const items: OrderItem[] = [];
    const stockToReserve: { productId: string; qty: number }[] = [];
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
      if (product && product.status !== 'live') {
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
        stockToReserve.push({ productId: product.id, qty });
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

    const deliveryFee = Number(input.deliveryFeeUsd ?? 0);
    if (!Number.isFinite(deliveryFee) || deliveryFee < 0 || deliveryFee > MAX_DELIVERY_FEE) {
      throw new BadRequestException('Invalid delivery fee.');
    }
    const total = Number((subtotal + deliveryFee).toFixed(2));

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

    const order = this.orders.create({
      reference: OrdersService.newReference(),
      customerId: customer.id,
      customerName: customer.name,
      status: 'pending',
      paymentMethod: input.paymentMethod,
      subtotalUsd: subtotal,
      deliveryFeeUsd: deliveryFee,
      totalUsd: total,
      zoneId: input.zoneId ?? null,
      shippingAddress: input.shippingAddress ?? null,
      items,
    });
    let saved = await this.orders.save(order);

    // Charge for the order. Prepaid methods confirm immediately; COD stays
    // pending until the rider collects on delivery.
    const payment = await this.payments.processForOrder(saved);
    if (payment.status === 'succeeded') {
      saved.status = 'confirmed';
      saved = await this.orders.save(saved);
    }

    // Reserve stock only for lines that resolved to a real seeded product.
    for (const reserve of stockToReserve) {
      await this.products.decrementStock(reserve.productId, reserve.qty);
    }

    // Create an unassigned delivery task so the warehouse/riders see it.
    await this.deliveries.save(
      this.deliveries.create({
        orderId: saved.id,
        orderReference: saved.reference,
        status: 'unassigned',
        address: saved.shippingAddress,
        zoneId: saved.zoneId,
        codAmountUsd: saved.paymentMethod === 'cod' ? saved.totalUsd : 0,
      }),
    );

    // Push the new order live to the customer AND every ops dashboard.
    this.emitter.toUser(customer.id, 'order:created', saved);
    this.emitter.toRoles(OPS_ROOMS, 'order:created', saved);
    await this.notifications.toAdmins({
      title: 'New order',
      body: `${saved.reference} · $${saved.totalUsd.toFixed(2)} from ${customer.name}`,
      type: 'order',
      entityId: saved.id,
    });
    await this.notifications.toUser(customer.id, {
      title: 'Order placed',
      body: `We received ${saved.reference}. You'll get updates here in real time.`,
      type: 'order',
      entityId: saved.id,
    });

    return saved;
  }

  async updateStatus(
    orderId: string,
    status: OrderStatus,
  ): Promise<Order> {
    const order = await this.orders.findOne({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found.');
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
    if (!order) throw new NotFoundException('Order not found.');
    if (user.role === 'customer' && order.customerId !== user.id) {
      throw new BadRequestException('You can only cancel your own orders.');
    }
    if (!['pending', 'confirmed'].includes(order.status)) {
      throw new BadRequestException(
        `Order can no longer be cancelled (status: ${order.status}).`,
      );
    }

    order.status = 'cancelled';
    const saved = await this.orders.save(order);

    // Return reserved stock.
    for (const item of saved.items ?? []) {
      if (!item.productId.startsWith('ext:')) {
        await this.products.restock(item.productId, item.qty);
      }
    }

    // Refund prepaid orders to the wallet (COD never charged).
    if (saved.paymentMethod !== 'cod' && saved.status !== 'pending') {
      await this.wallet.refund(
        saved.customerId,
        saved.totalUsd,
        `Refund for cancelled order ${saved.reference}`,
      );
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
      body: `${saved.reference} was cancelled.${saved.paymentMethod !== 'cod' ? ' Refund credited to your wallet.' : ''}`,
      type: 'order',
      entityId: saved.id,
    });
    return saved;
  }

  async list(user: { id: string; role: string }): Promise<Order[]> {
    if (user.role === 'customer') {
      return this.orders.find({
        where: { customerId: user.id },
        order: { createdAt: 'DESC' },
      });
    }
    if (user.role === 'rider') {
      return this.orders.find({
        where: { riderId: user.id },
        order: { createdAt: 'DESC' },
      });
    }
    // Admin / warehouse see everything.
    return this.orders.find({ order: { createdAt: 'DESC' }, take: 200 });
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
