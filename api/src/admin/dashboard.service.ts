import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Seller } from '../entities/seller.entity';
import { Product } from '../entities/product.entity';
import { Order } from '../entities/order.entity';
import { OrderItem } from '../entities/order-item.entity';
import { Payout } from '../entities/payout.entity';
import { Dispute } from '../entities/dispute.entity';
import {
  DisputeStatus,
  OrderStatus,
  PayoutStatus,
  ProductStatus,
  SellerStatus,
} from '../common/enums';
import { round2 } from '../common/util';

@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(Seller) private readonly sellers: Repository<Seller>,
    @InjectRepository(Product) private readonly products: Repository<Product>,
    @InjectRepository(Order) private readonly orders: Repository<Order>,
    @InjectRepository(OrderItem) private readonly items: Repository<OrderItem>,
    @InjectRepository(Payout) private readonly payouts: Repository<Payout>,
    @InjectRepository(Dispute) private readonly disputes: Repository<Dispute>,
  ) {}

  async overview() {
    const gmvRow = await this.orders
      .createQueryBuilder('o')
      .select('COALESCE(SUM(o.totalUsd), 0)', 'sum')
      .getRawOne<{ sum: string }>();

    const ordersCount = await this.orders.count();
    const deliveredCount = await this.orders.count({
      where: { status: OrderStatus.DELIVERED },
    });
    const sellersActive = await this.sellers.count({
      where: { status: SellerStatus.ACTIVE },
    });
    const sellersPending = await this.sellers.count({
      where: { status: SellerStatus.PENDING },
    });
    const productsLive = await this.products.count({
      where: { status: ProductStatus.LIVE },
    });
    const productsPending = await this.products.count({
      where: { status: ProductStatus.PENDING },
    });

    const commissionRow = await this.items
      .createQueryBuilder('i')
      .leftJoin('i.order', 'o')
      .select('COALESCE(SUM(i.commissionAmount), 0)', 'sum')
      .where('o.status = :status', { status: OrderStatus.DELIVERED })
      .getRawOne<{ sum: string }>();

    const payoutsDueRow = await this.payouts
      .createQueryBuilder('p')
      .select('COALESCE(SUM(p.amountUsd), 0)', 'sum')
      .where('p.status IN (:...statuses)', {
        statuses: [PayoutStatus.REQUESTED, PayoutStatus.APPROVED],
      })
      .getRawOne<{ sum: string }>();

    const disputesOpen = await this.disputes.count({
      where: { status: DisputeStatus.OPEN },
    });

    const recentOrdersRows = await this.orders.find({
      order: { createdAt: 'DESC' },
      take: 8,
    });
    const recentOrders = recentOrdersRows.map((o) => ({
      code: o.code,
      customer: o.customerName,
      total: round2(o.totalUsd),
      status: o.status,
      date: o.createdAt,
    }));

    const topSellerRows = await this.items
      .createQueryBuilder('i')
      .leftJoin('i.order', 'o')
      .leftJoin('i.seller', 's')
      .select('s.id', 'sellerId')
      .addSelect('s.storeName', 'storeName')
      .addSelect('COUNT(DISTINCT o.id)', 'orders')
      .addSelect('COALESCE(SUM(i.netToSeller), 0)', 'revenue')
      .where('o.status = :status', { status: OrderStatus.DELIVERED })
      .andWhere('s.id IS NOT NULL')
      .groupBy('s.id')
      .addGroupBy('s.storeName')
      .orderBy('revenue', 'DESC')
      .limit(5)
      .getRawMany<{
        sellerId: string;
        storeName: string;
        orders: string;
        revenue: string;
      }>();
    const topSellers = topSellerRows.map((r) => ({
      storeName: r.storeName,
      orders: parseInt(r.orders, 10),
      revenue: round2(parseFloat(r.revenue)),
    }));

    return {
      gmv: round2(parseFloat(gmvRow?.sum ?? '0')),
      ordersCount,
      deliveredCount,
      sellersActive,
      sellersPending,
      productsLive,
      productsPending,
      commissionRevenue: round2(parseFloat(commissionRow?.sum ?? '0')),
      payoutsDue: round2(parseFloat(payoutsDueRow?.sum ?? '0')),
      disputesOpen,
      recentOrders,
      topSellers,
    };
  }
}
