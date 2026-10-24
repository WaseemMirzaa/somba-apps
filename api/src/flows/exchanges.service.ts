import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Exchange, Order, Seller } from '../database/entities';
import type { ExchangeStatus } from '../database/entities';
import {
  ADMIN_ROLES,
  NotificationsService,
} from '../notifications/notifications.service';
import { RealtimeEmitter } from '../realtime/realtime-emitter';
import { ProductsService } from '../products/products.service';
import { EXCHANGE_NEXT, assertStep, sellerForItem, sellerKeys } from './after-sale';
import { AfterSaleNames } from './after-sale-names';

const OPS_ROLES = [...ADMIN_ROLES, 'warehouse_staff'];

/**
 * An exchange as clients receive it: the stored fields plus the two items' names in French (null when it cannot be
 * told, e.g. `toName` is what the customer typed). `reason` is the customer's own words and is never translated.
 */
export type ExchangeView = Exchange & { fromNameFr: string | null; toNameFr: string | null };

/** Exchange one purchased item for another variant/product. */
@Injectable()
export class ExchangesService {
  constructor(
    @InjectRepository(Exchange) private readonly exchanges: Repository<Exchange>,
    @InjectRepository(Order) private readonly orders: Repository<Order>,
    @InjectRepository(Seller) private readonly sellers: Repository<Seller>,
    private readonly notifications: NotificationsService,
    private readonly emitter: RealtimeEmitter,
    private readonly products: ProductsService,
    private readonly names: AfterSaleNames,
  ) {}

  /** Rows with the French names of their items, looked up for all of them at once. */
  private async serve(rows: Exchange[]): Promise<ExchangeView[]> {
    const fr = await this.names.frenchNames(
      rows.flatMap((x) => [
        { orderId: x.orderId, sku: x.fromSku, name: x.fromName },
        { orderId: x.orderId, sku: x.toSku, name: x.toName },
      ]),
    );
    return rows.map((x, i) => ({ ...x, fromNameFr: fr[2 * i], toNameFr: fr[2 * i + 1] }));
  }

  async list(user: { id: string; role: string }): Promise<ExchangeView[]> {
    if (user.role.startsWith('admin') || user.role === 'warehouse_staff') {
      return this.serve(await this.exchanges.find({ order: { createdAt: 'DESC' }, take: 200 }));
    }
    // A seller sees exchanges of their items (and any they filed as a customer).
    if (user.role === 'seller') {
      const keys = await sellerKeys(user.id, this.sellers);
      return this.serve(
        await this.exchanges.find({
          where: [{ sellerId: In(keys) }, { customerId: user.id }],
          order: { createdAt: 'DESC' },
          take: 500,
        }),
      );
    }
    return this.serve(await this.exchanges.find({ where: { customerId: user.id }, order: { createdAt: 'DESC' }, take: 500 }));
  }

  /** The seller account behind an exchange (null when the item's seller is unknown). */
  private async sellerUserOf(ex: Pick<Exchange, 'sellerId'>): Promise<string | null> {
    if (!ex.sellerId) return null;
    const store = await this.sellers.findOne({ where: { id: ex.sellerId } });
    return store?.userId ?? ex.sellerId;
  }

  async create(
    actor: { id: string; name: string; role: string },
    input: {
      orderId: string;
      fromSku: string;
      fromName: string;
      toSku: string;
      toName: string;
      priceDiffUsd?: number;
      reason?: string;
    },
  ): Promise<ExchangeView> {
    const order = await this.orders.findOne({ where: { id: String(input?.orderId ?? '') } });
    const ops = actor.role.startsWith('admin') || actor.role === 'warehouse_staff';
    if (!order || (!ops && (order.customerId !== actor.id || order.status !== 'delivered'))) {
      throw new NotFoundException('Order not found or not eligible for an exchange.');
    }
    for (const k of ['fromSku', 'fromName', 'toSku', 'toName'] as const) {
      if (!String(input[k] ?? '').trim()) throw new BadRequestException('Say which item you want to exchange and for what.');
    }
    // Customers can't set the price difference — ops settle it later.
    const diff = ops && Number.isFinite(Number(input.priceDiffUsd)) ? Math.max(-100000, Math.min(100000, Number(input.priceDiffUsd))) : 0;
    const seller = await sellerForItem(order, String(input.fromSku).trim(), this.products, this.sellers);
    const created = await this.exchanges.save(
      this.exchanges.create({
        reference: `EXC-${Date.now().toString().slice(-8)}`,
        sellerId: seller?.sellerId ?? null,
        orderId: order.id,
        orderReference: order.reference,
        customerId: order.customerId,
        customerName: order.customerName,
        fromSku: String(input.fromSku).slice(0, 100),
        fromName: String(input.fromName).slice(0, 200),
        toSku: String(input.toSku).slice(0, 100),
        toName: String(input.toName).slice(0, 200),
        priceDiffUsd: diff,
        reason: input.reason ? String(input.reason).slice(0, 1000) : null,
        status: 'requested',
      }),
    );
    const [ex] = await this.serve([created]);
    this.emitter.toRoles(OPS_ROLES, 'exchange:updated', ex);
    this.emitter.toUser(order.customerId, 'exchange:updated', ex);
    await this.notifications.toRole('warehouse_staff', {
      title: 'Exchange requested',
      body: `${ex.reference} · ${ex.fromName} → ${ex.toName}`,
      type: 'exchange',
      entityId: ex.id,
    });
    if (seller) {
      this.emitter.toUser(seller.userId, 'exchange:updated', ex);
      await this.notifications.toUser(seller.userId, {
        title: 'Exchange requested on your item',
        body: `${ex.reference} · ${order.reference}: ${ex.fromName} → ${ex.toName}`,
        type: 'exchange',
        entityId: ex.id,
      });
    }
    return ex;
  }

  async setStatus(id: string, status: ExchangeStatus): Promise<ExchangeView> {
    const ex = await this.exchanges.findOne({ where: { id } });
    if (!ex) throw new NotFoundException('Exchange not found.');
    assertStep(EXCHANGE_NEXT, ex.status, status);
    const claim = await this.exchanges
      .createQueryBuilder()
      .update(Exchange)
      .set({ status })
      .where('id = :id AND status = :from', { id, from: ex.status })
      .execute();
    if (!claim.affected) throw new BadRequestException('This exchange was just updated by someone else. Refresh and try again.');
    const [saved] = await this.serve([(await this.exchanges.findOne({ where: { id } }))!]);
    this.emitter.toRoles(OPS_ROLES, 'exchange:updated', saved);
    const sellerUser = await this.sellerUserOf(saved);
    if (sellerUser) {
      this.emitter.toUser(sellerUser, 'exchange:updated', saved);
      await this.notifications.toUser(sellerUser, {
        title: `Exchange ${status}`,
        body: `${saved.reference} · ${saved.orderReference}: ${saved.fromName} → ${saved.toName}`,
        type: 'exchange',
        entityId: saved.id,
      });
    }
    if (saved.customerId) {
      this.emitter.toUser(saved.customerId, 'exchange:updated', saved);
      await this.notifications.toUser(saved.customerId, {
        title: `Exchange ${status}`,
        body: `${saved.reference}: ${saved.fromName} → ${saved.toName}`,
        type: 'exchange',
        entityId: saved.id,
      });
    }
    return saved;
  }
}
