import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Order } from '../entities/order.entity';
import { OrderItem } from '../entities/order-item.entity';
import { OrderStatus } from '../common/enums';
import { round2 } from '../common/util';
import { UpdateOrderItemStatusDto } from './dto';

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(Order) private readonly orders: Repository<Order>,
    @InjectRepository(OrderItem) private readonly items: Repository<OrderItem>,
  ) {}

  private requireSeller(sellerId?: string): string {
    if (!sellerId) throw new ForbiddenException('No seller profile');
    return sellerId;
  }

  private shapeOrder(order: Order, sellerId: string, statusFilter?: string) {
    const myItems = (order.items || []).filter(
      (it) =>
        it.seller?.id === sellerId &&
        (!statusFilter || it.fulfillmentStatus === statusFilter),
    );

    const subtotal = round2(myItems.reduce((s, it) => s + Number(it.lineTotal), 0));
    const commission = round2(
      myItems.reduce((s, it) => s + Number(it.commissionAmount), 0),
    );
    const net = round2(myItems.reduce((s, it) => s + Number(it.netToSeller), 0));

    return {
      id: order.id,
      code: order.code,
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      city: order.city,
      zone: order.zone,
      paymentMethod: order.paymentMethod,
      status: order.status,
      createdAt: order.createdAt,
      items: myItems,
      subtotalUsd: subtotal,
      commissionUsd: commission,
      netToSellerUsd: net,
    };
  }

  async list(sellerId: string | undefined, status?: string) {
    const id = this.requireSeller(sellerId);

    const orderIdsRows = await this.items
      .createQueryBuilder('it')
      .leftJoin('it.order', 'o')
      .leftJoin('it.seller', 's')
      .select('o.id', 'orderId')
      .where('s.id = :id', { id })
      .distinct(true)
      .getRawMany<{ orderId: string }>();

    const orderIds = orderIdsRows.map((r) => r.orderId).filter(Boolean);
    if (!orderIds.length) return [];

    const orders = await this.orders.find({
      where: orderIds.map((oid) => ({ id: oid })),
      order: { createdAt: 'DESC' },
    });

    return orders
      .map((o) => this.shapeOrder(o, id, status))
      .filter((o) => o.items.length > 0);
  }

  async get(sellerId: string | undefined, id: string) {
    const seller = this.requireSeller(sellerId);
    const order = await this.orders.findOne({ where: { id } });
    if (!order) throw new NotFoundException('Order not found');
    const shaped = this.shapeOrder(order, seller);
    if (!shaped.items.length) throw new NotFoundException('Order not found');
    return shaped;
  }

  async updateItemStatus(
    sellerId: string | undefined,
    itemId: string,
    dto: UpdateOrderItemStatusDto,
  ) {
    const seller = this.requireSeller(sellerId);
    const item = await this.items.findOne({ where: { id: itemId } });
    if (!item) throw new NotFoundException('Order item not found');
    if (item.seller?.id !== seller) {
      throw new ForbiddenException('Not your order item');
    }
    item.fulfillmentStatus = dto.status as OrderStatus;
    return this.items.save(item);
  }
}
