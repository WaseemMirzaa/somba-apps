import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThanOrEqual, Repository } from 'typeorm';
import { Seller } from '../entities/seller.entity';
import { Product } from '../entities/product.entity';
import { OrderItem } from '../entities/order-item.entity';
import { Payout } from '../entities/payout.entity';
import { OrderStatus, PayoutStatus, ProductStatus } from '../common/enums';
import { round2 } from '../common/util';

@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(Seller) private readonly sellers: Repository<Seller>,
    @InjectRepository(Product) private readonly products: Repository<Product>,
    @InjectRepository(OrderItem) private readonly items: Repository<OrderItem>,
    @InjectRepository(Payout) private readonly payouts: Repository<Payout>,
  ) {}

  private requireSeller(sellerId?: string): string {
    if (!sellerId) throw new ForbiddenException('No seller profile');
    return sellerId;
  }

  async overview(sellerId: string | undefined) {
    const id = this.requireSeller(sellerId);
    const seller = await this.sellers.findOne({ where: { id } });
    if (!seller) throw new NotFoundException('Seller not found');

    const [totalProducts, liveProducts, pendingProducts] = await Promise.all([
      this.products.count({ where: { seller: { id } } }),
      this.products.count({ where: { seller: { id }, status: ProductStatus.LIVE } }),
      this.products.count({ where: { seller: { id }, status: ProductStatus.PENDING } }),
    ]);

    const totalOrders = await this.items.count({ where: { seller: { id } } });

    const deliveredItems = await this.items.find({
      where: { seller: { id }, fulfillmentStatus: OrderStatus.DELIVERED },
    });
    const revenue = round2(
      deliveredItems.reduce((s, it) => s + Number(it.netToSeller), 0),
    );

    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const ordersThisWeek = await this.items.count({
      where: { seller: { id }, order: { createdAt: MoreThanOrEqual(weekAgo) } },
      relations: { order: true },
    });

    const pending = await this.payouts.find({
      where: [
        { seller: { id }, status: PayoutStatus.REQUESTED },
        { seller: { id }, status: PayoutStatus.APPROVED },
      ],
    });
    const pendingPayouts = round2(
      pending.reduce((s, p) => s + Number(p.amountUsd), 0),
    );

    const recentItems = await this.items.find({
      where: { seller: { id } },
      order: { order: { createdAt: 'DESC' } },
      relations: { order: true, product: true },
      take: 5,
    });
    const recentOrders = recentItems.map((it) => ({
      orderCode: it.order?.code,
      product: it.nameSnapshot,
      qty: it.qty,
      status: it.fulfillmentStatus,
      net: round2(Number(it.netToSeller)),
      date: it.order?.createdAt,
    }));

    return {
      totalProducts,
      liveProducts,
      pendingProducts,
      totalOrders,
      revenue,
      ordersThisWeek,
      rating: Number(seller.rating),
      healthScore: seller.healthScore,
      balance: round2(Number(seller.balanceUsd)),
      pendingPayouts,
      recentOrders,
    };
  }
}
