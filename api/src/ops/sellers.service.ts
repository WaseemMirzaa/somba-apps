import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { oneOf, str } from '../common/validate';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Not, Repository } from 'typeorm';
import { Order, OrderItem, Payment, Payout, Product, Seller } from '../database/entities';
import { MOBILE_MONEY_METHODS } from '../payments/mobile-money.provider';
import { PaymentsService } from '../payments/payments.service';
import { SettingsService } from '../content/settings.service';
import { activePlanId, extendExpiry, parsePlans } from '../content/plans';
import type { SellerPlan } from '../content/plans';
import { pageOf } from '../common/paging';
import { ProductsService } from '../products/products.service';
import type { SellerStatus } from '../database/entities/seller.entity';
import { RealtimeEmitter } from '../realtime/realtime-emitter';
import {
  ADMIN_ROLES,
  NotificationsService,
} from '../notifications/notifications.service';

@Injectable()
export class SellersService {
  constructor(
    @InjectRepository(Seller) private readonly sellers: Repository<Seller>,
    @InjectRepository(Product) private readonly products: Repository<Product>,
    @InjectRepository(Order) private readonly orders: Repository<Order>,
    @InjectRepository(OrderItem) private readonly items: Repository<OrderItem>,
    @InjectRepository(Payout) private readonly payouts: Repository<Payout>,
    private readonly notifications: NotificationsService,
    private readonly emitter: RealtimeEmitter,
    private readonly payments: PaymentsService,
    private readonly settings: SettingsService,
    private readonly productsSvc: ProductsService,
  ) {
    // A seller-plan payment (wallet now, or mobile money once confirmed) switches the plan on.
    this.payments.registerPlanSettledHandler((payment) => this.activatePlan(payment));
  }

  list(status?: SellerStatus, paging?: unknown): Promise<Seller[]> {
    const { take, skip } = pageOf(paging);
    return this.sellers.find({
      where: status ? { status } : undefined,
      order: { createdAt: 'DESC' },
      take,
      skip,
    });
  }

  // ── Subscription plans ────────────────────────────────────────────────────
  /** The public plan list (the `sellerPlans` setting, or the built-in defaults). */
  async plans(): Promise<SellerPlan[]> {
    return parsePlans(await this.settings.get('sellerPlans'));
  }

  /** The seller as the apps see it: plus the plan that is actually in force right now. */
  withPlanState(seller: Seller) {
    return { ...seller, activePlan: activePlanId(seller) };
  }

  /**
   * Start buying a plan. Wallet: charged at once and active on return.
   * Mobile money: returns the pending payment; the plan activates when it
   * succeeds (network webhook or finance confirmation) via {@link activatePlan}.
   */
  async subscribe(
    userId: string,
    input: { plan?: unknown; method?: unknown; phone?: unknown },
  ) {
    const seller = await this.byUser(userId);
    if (!seller) throw new NotFoundException('Open a store first.');
    if (seller.status === 'rejected' || seller.status === 'suspended') {
      throw new BadRequestException('Your store is not active. Contact support.');
    }
    const plans = await this.plans();
    const plan = plans.find((p) => p.id === String(input?.plan ?? ''));
    if (!plan) throw new BadRequestException('Unknown plan.');
    if (plan.priceUsd === null) throw new BadRequestException('This plan is arranged with our sales team — please contact us.');
    if (!(plan.priceUsd > 0)) throw new BadRequestException('The free plan needs no payment.');
    const method = oneOf(input?.method, ['wallet', ...MOBILE_MONEY_METHODS] as const, 'Payment method');
    const payment = await this.payments.startPlanPayment(userId, { id: plan.id, priceUsd: plan.priceUsd }, method, input?.phone);
    const fresh = (await this.byUser(userId)) ?? seller;
    return {
      status: payment.status === 'succeeded' ? ('active' as const) : ('pending' as const),
      plan,
      payment,
      seller: this.withPlanState(fresh),
    };
  }

  /** A plan payment succeeded: switch the plan on and extend it by the plan's length. */
  private async activatePlan(payment: Payment): Promise<void> {
    const seller = await this.byUser(payment.userId);
    if (!seller || !payment.subject) return;
    const plan = (await this.plans()).find((p) => p.id === payment.subject);
    const months = plan?.months ?? 1;
    // Renewing the same plan stacks on the time left; switching plans starts a fresh period.
    const renewing = seller.plan === payment.subject && activePlanId(seller) === seller.plan;
    seller.plan = payment.subject;
    seller.planExpiresAt = extendExpiry(renewing ? seller.planExpiresAt : null, months);
    const saved = await this.sellers.save(seller);
    this.emitter.toRoles(ADMIN_ROLES, 'seller:updated', saved);
    if (saved.userId) {
      this.emitter.toUser(saved.userId, 'seller:updated', this.withPlanState(saved));
      await this.notifications.toUser(saved.userId, {
        title: 'Plan activated',
        body: `Your ${plan?.name ?? payment.subject} plan is active until ${saved.planExpiresAt?.toISOString().slice(0, 10)}.`,
        type: 'seller',
        entityId: saved.id,
      });
    }
  }

  get(id: string): Promise<Seller | null> {
    return this.sellers.findOne({ where: { id } });
  }

  byUser(userId: string): Promise<Seller | null> {
    return this.sellers.findOne({ where: { userId } });
  }

  async register(
    user: { id: string; name: string },
    data: { name?: string },
  ): Promise<Seller> {
    const existing = await this.byUser(user.id);
    if (existing) return existing;
    const seller = await this.sellers.save(
      this.sellers.create({
        name: str(data?.name ?? user.name, 'Store name', { min: 2, max: 100 }),
        userId: user.id,
        status: 'pending',
        badge: 'bronze',
      }),
    );
    this.emitter.toRoles(ADMIN_ROLES, 'seller:updated', seller);
    await this.notifications.toRole('admin_moderation', {
      title: 'New seller application',
      body: seller.name,
      type: 'seller',
      entityId: seller.id,
    });
    return seller;
  }

  /** A seller edits their own store profile (name). */
  async updateProfile(
    userId: string,
    patch: { name?: string; pickupAddress?: string | null },
  ): Promise<Seller> {
    const seller = await this.byUser(userId);
    if (!seller) throw new NotFoundException('Store not found.');
    if (patch.name != null) seller.name = str(patch.name, 'Store name', { min: 2, max: 100 });
    if (patch.pickupAddress !== undefined) {
      seller.pickupAddress = patch.pickupAddress === null || patch.pickupAddress === '' ? null : str(patch.pickupAddress, 'Pickup address', { min: 5, max: 300 });
    }
    const saved = await this.sellers.save(seller);
    this.emitter.toRoles(ADMIN_ROLES, 'seller:updated', saved);
    if (saved.userId) this.emitter.toUser(saved.userId, 'seller:updated', saved);
    return saved;
  }

  async setStatus(id: string, status: SellerStatus): Promise<Seller> {
    const seller = await this.sellers.findOne({ where: { id } });
    if (!seller) throw new NotFoundException('Seller not found.');
    seller.status = status;
    const saved = await this.sellers.save(seller);
    // A suspended/rejected store's listings leave the storefront straight away.
    if (status === 'suspended' || status === 'rejected') {
      const owned = await this.products.find({ where: [{ sellerId: saved.id, status: 'live' }, ...(saved.userId ? [{ sellerId: saved.userId, status: 'live' as const }] : [])] });
      for (const p of owned) {
        p.status = 'draft';
        await this.products.save(p);
        this.emitter.toRoles(['customer', 'guest', ...ADMIN_ROLES], 'product:updated', p);
      }
    }
    this.emitter.toRoles(ADMIN_ROLES, 'seller:updated', saved);
    if (saved.userId) {
      this.emitter.toUser(saved.userId, 'seller:updated', saved);
      await this.notifications.toUser(saved.userId, {
        title: `Store ${status}`,
        body: `Your store "${saved.name}" is now ${status}.`,
        type: 'seller',
        entityId: saved.id,
      });
    }
    return saved;
  }

  /** Public storefront: the seller + their live products. */
  async storefront(id: string) {
    const seller = await this.get(id);
    // Only approved stores are public; never expose the owner's user id.
    if (!seller || seller.status !== 'approved') return null;
    // Through ProductsService so shoppers see the same effective (campaign / flash) prices they are charged.
    const products = await this.productsSvc.list({ sellerId: id, status: 'live', limit: 500 });
    const { userId: _owner, pickupAddress: _pickup, planExpiresAt: _exp, plan: _plan, ...publicSeller } = seller;
    void _owner;
    void _pickup;
    void _exp;
    void _plan;
    // The plan in force is public (a "Pro seller" badge); the expiry date is not.
    return { seller: { ...publicSeller, plan: activePlanId(seller) }, products };
  }

  /**
   * Seller dashboard KPIs for the signed-in seller, from grouped SQL (no table
   * is loaded into memory). `orders` / `revenue` count lines of this seller's
   * products on orders that were not cancelled or returned.
   */
  async stats(sellerId: string) {
    const seller = await this.sellers.findOne({ where: { id: sellerId } });
    // Demo products may carry the owner's user id instead of the store id.
    const ids = [sellerId, ...(seller?.userId ? [seller.userId] : [])];
    const [products, sales, payoutRows] = await Promise.all([
      this.products.count({ where: { sellerId: In(ids), status: Not('removed') } }),
      this.items
        .createQueryBuilder('i')
        .innerJoin(Order, 'o', 'o.id = i.orderId')
        .innerJoin(Product, 'p', 'p.id = i.productId')
        .select('COUNT(DISTINCT o.id)', 'orders')
        .addSelect('COALESCE(SUM(i.priceUsd * i.qty), 0)', 'revenue')
        .where("p.sellerId IN (:...ids) AND o.status NOT IN ('cancelled','returned')", { ids })
        .getRawOne<{ orders: string; revenue: string }>(),
      this.payouts
        .createQueryBuilder('x')
        .select('x.status', 'status')
        .addSelect('COUNT(*)', 'n')
        .addSelect('COALESCE(SUM(x.amountUsd), 0)', 'amount')
        .where('x.sellerId IN (:...ids)', { ids })
        .groupBy('x.status')
        .getRawMany<{ status: string; n: string; amount: string }>(),
    ]);
    const by = (st: string) => payoutRows.find((r) => r.status === st);
    return {
      products,
      orders: Number(sales?.orders ?? 0),
      revenue: Number(Number(sales?.revenue ?? 0).toFixed(2)),
      paidOut: Number(Number(by('paid')?.amount ?? 0).toFixed(2)),
      pendingPayouts: Number(by('requested')?.n ?? 0),
    };
  }
}
