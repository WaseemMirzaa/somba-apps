import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Order } from '../entities/order.entity';
import { OrderItem } from '../entities/order-item.entity';
import { Product } from '../entities/product.entity';
import { Address } from '../entities/address.entity';
import { User } from '../entities/user.entity';
import { OrderStatus, PaymentMethod, ProductStatus } from '../common/enums';
import { refCode, round2 } from '../common/util';
import { CouponsService } from './coupons.service';
import { CreateOrderDto } from './dto';

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(Order) private readonly orders: Repository<Order>,
    @InjectRepository(OrderItem) private readonly orderItems: Repository<OrderItem>,
    @InjectRepository(Product) private readonly products: Repository<Product>,
    @InjectRepository(Address) private readonly addresses: Repository<Address>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly coupons: CouponsService,
  ) {}

  /** List the signed-in customer's orders (scoped by their email). */
  async listMine(userId: string) {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    return this.orders.find({
      where: { customerEmail: user.email },
      order: { createdAt: 'DESC' },
    });
  }

  async getMine(userId: string, id: string) {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    const order = await this.orders.findOne({ where: { id, customerEmail: user.email } });
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  async create(userId: string, dto: CreateOrderDto) {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (!dto.items?.length) throw new BadRequestException('Cart is empty');

    const ids = dto.items.map((i) => i.productId);
    const found = await this.products.find({
      where: { id: In(ids) },
      relations: { seller: true, category: true },
    });
    const byId = new Map(found.map((p) => [p.id, p]));

    // Resolve delivery destination (saved address wins over inline fields).
    let addr: Partial<Address> = {
      name: dto.name ?? user.name,
      phone: dto.phone ?? user.phone,
      line: dto.line,
      city: dto.city ?? 'Kinshasa',
      zone: dto.zone ?? 'Gombe',
    };
    if (dto.addressId) {
      const saved = await this.addresses.findOne({
        where: { id: dto.addressId, user: { id: userId } },
      });
      // Use the saved address when found; otherwise keep the inline fields.
      if (saved) addr = saved;
    }

    const orderItems: OrderItem[] = [];
    let subtotal = 0;
    for (const line of dto.items) {
      const p = byId.get(line.productId);
      if (!p) throw new BadRequestException(`Product ${line.productId} not found`);
      if (p.status !== ProductStatus.LIVE) {
        throw new BadRequestException(`${p.name} is not available`);
      }
      const qty = Math.max(1, line.qty);
      const unit = Number(p.discountPrice ?? p.price);
      const lineTotal = round2(unit * qty);
      const rate = Number(p.category?.commissionRate ?? p.seller?.commissionRate ?? 12);
      const commissionAmount = round2((lineTotal * rate) / 100);
      subtotal += lineTotal;
      orderItems.push(
        this.orderItems.create({
          product: p,
          seller: p.seller,
          nameSnapshot: p.name,
          unitPrice: unit,
          qty,
          lineTotal,
          commissionRate: rate,
          commissionAmount,
          netToSeller: round2(lineTotal - commissionAmount),
          fulfillmentStatus: OrderStatus.PENDING,
        }),
      );
    }
    subtotal = round2(subtotal);

    // Coupon (optional).
    let discount = 0;
    if (dto.couponCode) {
      const res = await this.coupons.validate(dto.couponCode, subtotal).catch(() => null);
      if (res) discount = res.discount;
    }

    const deliveryFee = round2(dto.deliveryFeeUsd ?? 3);
    const total = round2(Math.max(0, subtotal - discount) + deliveryFee);

    const order = await this.orders.save(
      this.orders.create({
        code: refCode('SMB'),
        customerName: addr.name ?? user.name,
        customerEmail: user.email,
        customerPhone: addr.phone ?? user.phone,
        addressLine: addr.line,
        city: addr.city,
        zone: addr.zone,
        paymentMethod: dto.paymentMethod ?? PaymentMethod.COD,
        status: OrderStatus.PENDING,
        subtotalUsd: subtotal,
        deliveryFeeUsd: deliveryFee,
        totalUsd: total,
        items: orderItems,
      }),
    );

    // Bump each product's sold count.
    for (const line of dto.items) {
      const p = byId.get(line.productId);
      if (p) await this.products.increment({ id: p.id }, 'sold', Math.max(1, line.qty));
    }

    return order;
  }
}
