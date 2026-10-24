import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Order, Replacement, Seller } from '../database/entities';
import type { ReplacementStatus } from '../database/entities';
import {
  ADMIN_ROLES,
  NotificationsService,
} from '../notifications/notifications.service';
import { RealtimeEmitter } from '../realtime/realtime-emitter';
import { ProductsService } from '../products/products.service';
import { REPLACEMENT_NEXT, assertStep, sellerForItem, sellerKeys } from './after-sale';
import { AfterSaleNames } from './after-sale-names';

const OPS_ROLES = [...ADMIN_ROLES, 'warehouse_staff'];

/** A replacement as clients receive it: the stored fields plus the item's name in French (null when it cannot be told). `reason` / `condition` are the customer's own words and are never translated. */
export type ReplacementView = Replacement & { productNameFr: string | null };

/** Like-for-like replacements of defective/returned items. */
@Injectable()
export class ReplacementsService {
  constructor(
    @InjectRepository(Replacement)
    private readonly replacements: Repository<Replacement>,
    @InjectRepository(Order) private readonly orders: Repository<Order>,
    @InjectRepository(Seller) private readonly sellers: Repository<Seller>,
    private readonly notifications: NotificationsService,
    private readonly emitter: RealtimeEmitter,
    private readonly products: ProductsService,
    private readonly names: AfterSaleNames,
  ) {}

  /** Rows with the French name of their item, looked up for all of them at once. */
  private async serve(rows: Replacement[]): Promise<ReplacementView[]> {
    const fr = await this.names.frenchNames(rows.map((r) => ({ orderId: r.orderId, sku: r.sku, name: r.productName })));
    return rows.map((r, i) => ({ ...r, productNameFr: fr[i] }));
  }

  async list(user: { id: string; role: string }): Promise<ReplacementView[]> {
    // Ops (admin roles, warehouse) see all; a seller sees requests about their items (and any they filed);
    // everyone else only their own.
    if (user.role.startsWith('admin') || user.role === 'warehouse_staff') {
      return this.serve(await this.replacements.find({ order: { createdAt: 'DESC' }, take: 200 }));
    }
    if (user.role === 'seller') {
      const keys = await sellerKeys(user.id, this.sellers);
      return this.serve(
        await this.replacements.find({
          where: [{ sellerId: In(keys) }, { customerId: user.id }],
          order: { createdAt: 'DESC' },
          take: 500,
        }),
      );
    }
    return this.serve(await this.replacements.find({ where: { customerId: user.id }, order: { createdAt: 'DESC' }, take: 500 }));
  }

  /** The seller account behind a replacement (null when the item's seller is unknown). */
  private async sellerUserOf(rep: Pick<Replacement, 'sellerId'>): Promise<string | null> {
    if (!rep.sellerId) return null;
    const store = await this.sellers.findOne({ where: { id: rep.sellerId } });
    return store?.userId ?? rep.sellerId;
  }

  async create(
    actor: { id: string; name: string; role: string },
    input: {
      orderId: string;
      sku: string;
      productName: string;
      reason?: string;
      condition?: string;
    },
  ): Promise<ReplacementView> {
    const order = await this.orders.findOne({ where: { id: String(input?.orderId ?? '') } });
    const ops = actor.role.startsWith('admin') || actor.role === 'warehouse_staff';
    // Customers may only file for their own DELIVERED orders; ops for any.
    if (!order || (!ops && (order.customerId !== actor.id || order.status !== 'delivered'))) {
      throw new NotFoundException('Order not found or not eligible for a replacement.');
    }
    if (!String(input.sku ?? '').trim() || !String(input.productName ?? '').trim()) {
      throw new BadRequestException('Say which item needs replacing.');
    }
    const seller = await sellerForItem(order, String(input.sku).trim(), this.products, this.sellers);
    const saved = await this.replacements.save(
      this.replacements.create({
        reference: `REP-${Date.now().toString().slice(-8)}`,
        sellerId: seller?.sellerId ?? null,
        orderId: order.id,
        orderReference: order.reference,
        customerId: order.customerId,
        customerName: order.customerName,
        sku: String(input.sku).slice(0, 100),
        productName: String(input.productName).slice(0, 200),
        reason: input.reason ? String(input.reason).slice(0, 1000) : null,
        condition: input.condition ? String(input.condition).slice(0, 100) : null,
        status: 'requested',
        dispatchStatus: 'pending',
      }),
    );
    const [rep] = await this.serve([saved]);
    this.emitter.toRoles(OPS_ROLES, 'replacement:updated', rep);
    this.emitter.toUser(order.customerId, 'replacement:updated', rep);
    await this.notifications.toRole('warehouse_staff', {
      title: 'Replacement requested',
      body: `${rep.reference} · ${rep.productName}`,
      type: 'replacement',
      entityId: rep.id,
    });
    if (seller) {
      this.emitter.toUser(seller.userId, 'replacement:updated', rep);
      await this.notifications.toUser(seller.userId, {
        title: 'Replacement requested on your item',
        body: `${rep.reference} · ${order.reference} · ${rep.productName}${rep.reason ? `: ${rep.reason.slice(0, 120)}` : ''}`,
        type: 'replacement',
        entityId: rep.id,
      });
    }
    return rep;
  }

  async setStatus(id: string, status: ReplacementStatus): Promise<ReplacementView> {
    const rep = await this.replacements.findOne({ where: { id } });
    if (!rep) throw new NotFoundException('Replacement not found.');
    assertStep(REPLACEMENT_NEXT, rep.status, status);
    const patch: Partial<Replacement> = { status };
    if (status === 'allocated') patch.dispatchStatus = 'ready';
    if (status === 'dispatched') patch.dispatchStatus = 'dispatched';
    // One conditional update, so two staff clicking at once can't both move it.
    const claim = await this.replacements
      .createQueryBuilder()
      .update(Replacement)
      .set(patch)
      .where('id = :id AND status = :from', { id, from: rep.status })
      .execute();
    if (!claim.affected) throw new BadRequestException('This replacement was just updated by someone else. Refresh and try again.');
    const [saved] = await this.serve([(await this.replacements.findOne({ where: { id } }))!]);
    this.emitter.toRoles(OPS_ROLES, 'replacement:updated', saved);
    const sellerUser = await this.sellerUserOf(saved);
    if (sellerUser) {
      this.emitter.toUser(sellerUser, 'replacement:updated', saved);
      await this.notifications.toUser(sellerUser, {
        title: `Replacement ${status}`,
        body: `${saved.reference} · ${saved.orderReference} · ${saved.productName}`,
        type: 'replacement',
        entityId: saved.id,
      });
    }
    if (saved.customerId) {
      this.emitter.toUser(saved.customerId, 'replacement:updated', saved);
      await this.notifications.toUser(saved.customerId, {
        title: `Replacement ${status}`,
        body: `${saved.reference}: ${saved.productName}`,
        type: 'replacement',
        entityId: saved.id,
      });
    }
    return saved;
  }
}
