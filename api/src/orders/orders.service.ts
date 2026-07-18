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

export interface CreateOrderInput {
  items: { productId: string; qty: number; variant?: string }[];
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
  ) {}

  async create(
    customer: { id: string; name: string },
    input: CreateOrderInput,
  ): Promise<Order> {
    if (!input.items?.length) {
      throw new BadRequestException('An order needs at least one item.');
    }

    const items: OrderItem[] = [];
    let subtotal = 0;
    for (const line of input.items) {
      const product = await this.products.get(line.productId);
      if (!product) {
        throw new BadRequestException(`Unknown product ${line.productId}`);
      }
      const qty = Math.max(1, line.qty);
      subtotal += product.price * qty;
      const item = new OrderItem();
      item.productId = product.id;
      item.productName = product.name;
      item.variant = line.variant ?? 'Default';
      item.qty = qty;
      item.priceUsd = product.price;
      items.push(item);
    }

    const deliveryFee = input.deliveryFeeUsd ?? 0;
    const order = this.orders.create({
      reference: OrdersService.newReference(),
      customerId: customer.id,
      customerName: customer.name,
      status: 'pending',
      paymentMethod: input.paymentMethod,
      subtotalUsd: subtotal,
      deliveryFeeUsd: deliveryFee,
      totalUsd: subtotal + deliveryFee,
      zoneId: input.zoneId ?? null,
      shippingAddress: input.shippingAddress ?? null,
      items,
    });
    const saved = await this.orders.save(order);

    // Reserve stock.
    for (const line of input.items) {
      await this.products.decrementStock(line.productId, Math.max(1, line.qty));
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

  private static newReference(): string {
    const n = Math.floor(1000 + Math.random() * 9000);
    return `SOM-${Date.now().toString().slice(-5)}${n}`.slice(0, 20);
  }
}
