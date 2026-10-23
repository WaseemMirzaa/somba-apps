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
import { parseJsonList, sellerView } from '../database/entities/seller.entity';
import type { SellerStatus } from '../database/entities/seller.entity';
import { normalizePhone } from '../common/phone/phone-hash';
import { RealtimeEmitter } from '../realtime/realtime-emitter';
import {
  ADMIN_ROLES,
  NotificationsService,
} from '../notifications/notifications.service';

/**
 * A storefront image must be a file this platform stored (`POST /api/v1/uploads` → `/uploads/<uuid>.<ext>`),
 * so sellers cannot point shoppers' browsers at arbitrary third-party URLs. null / '' clears it.
 */
export function uploadedImageUrl(value: string | null, label: string): string | null {
  if (value === null || value === '') return null;
  if (typeof value !== 'string' || value.length > 500) throw new BadRequestException(`${label} is not a valid image.`);
  let path: string;
  try {
    path = new URL(value).pathname;
  } catch {
    throw new BadRequestException(`${label} is not a valid image.`);
  }
  if (!/^\/uploads\/[0-9a-f-]{36}\.(png|jpg|webp)$/.test(path)) {
    throw new BadRequestException(`${label} must be an image uploaded through the platform.`);
  }
  return value;
}

/** What a seller must file to open (or re-open) a store. */
export interface KycInput {
  name?: unknown;
  legalName?: unknown;
  phone?: unknown;
  idNumber?: unknown;
  rccm?: unknown;
  taxNumber?: unknown;
  documentUrls?: unknown;
  acceptTerms?: unknown;
}

export interface ValidKyc {
  name: string;
  legalName: string;
  phone: string;
  idNumber: string;
  rccm: string | null;
  taxNumber: string | null;
  documentUrls: string[];
}

/** An optional, trimmed string of at most `max` characters; blank -> null. */
function optionalText(x: unknown, field: string, max: number): string | null {
  if (x === undefined || x === null) return null;
  if (typeof x !== 'string') throw new BadRequestException(`${field} must be at most ${max} characters.`);
  const t = x.trim();
  if (t === '') return null;
  if (t.length > max) throw new BadRequestException(`${field} must be at most ${max} characters.`);
  return t;
}

/** Validate the KYC payload of `sellers:register` / `sellers:resubmit`. Throws with a message safe to show. */
export function validateKyc(input: KycInput | null | undefined): ValidKyc {
  const data = input ?? {};
  const name = str(data.name, 'Store name', { min: 2, max: 100 });
  const legalName = str(data.legalName, 'Legal name', { min: 2, max: 150 });
  const rawPhone = typeof data.phone === 'string' ? data.phone.trim() : '';
  const normalised = /^\+?[0-9 ()\-.]+$/.test(rawPhone) ? normalizePhone(rawPhone) : null;
  if (!normalised) throw new BadRequestException('Enter a valid phone number (for example +243 81 234 5678).');
  const idNumber = str(data.idNumber, 'ID number', { min: 4, max: 40 });
  const rccm = optionalText(data.rccm, 'RCCM number', 60);
  const taxNumber = optionalText(data.taxNumber, 'Tax number', 60);
  const rawDocs = data.documentUrls;
  if (!Array.isArray(rawDocs) || rawDocs.length < 1 || rawDocs.length > 5) {
    throw new BadRequestException('Upload between 1 and 5 identity or business documents.');
  }
  const documentUrls: string[] = [];
  for (const u of rawDocs) {
    const url = typeof u === 'string' && u !== '' ? uploadedImageUrl(u, 'Document') : null;
    if (!url) throw new BadRequestException('Document is not a valid image.');
    if (!documentUrls.includes(url)) documentUrls.push(url);
  }
  if (data.acceptTerms !== true) throw new BadRequestException('You must accept the seller terms.');
  return { name, legalName, phone: `+${normalised}`, idNumber, rccm, taxNumber, documentUrls };
}

/** The reason an admin gives for a decision. */
function decisionReason(raw: unknown, required: boolean): string | null {
  const t = typeof raw === 'string' ? raw.trim() : '';
  if (t === '') {
    if (required) throw new BadRequestException('Enter the reason the seller will see (at least 5 characters).');
    return null;
  }
  if (required && t.length < 5) throw new BadRequestException('Enter the reason the seller will see (at least 5 characters).');
  if (t.length > 500) throw new BadRequestException('The reason must be at most 500 characters.');
  return t;
}

/** Seller fields shoppers must never see (KYC, moderation bookkeeping, owner/payout details). */
const PRIVATE_SELLER_KEYS = [
  'userId',
  'pickupAddress',
  'planExpiresAt',
  'legalName',
  'phone',
  'idNumber',
  'rccm',
  'taxNumber',
  'documentUrls',
  'termsAcceptedAt',
  'kycSubmittedAt',
  'statusReason',
  'statusChangedAt',
  'suspendedListingIds',
] as const;

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

  /** Admin list: includes KYC and the last decision reason (documentUrls parsed). */
  async list(status?: SellerStatus, paging?: unknown) {
    const { take, skip } = pageOf(paging);
    const rows = await this.sellers.find({
      where: status ? { status } : undefined,
      order: { createdAt: 'DESC' },
      take,
      skip,
    });
    return rows.map((r) => sellerView(r));
  }

  /** Admin: one store with its KYC. */
  async getForAdmin(id: string) {
    const seller = await this.sellers.findOne({ where: { id } });
    if (!seller) throw new NotFoundException('Seller not found.');
    return this.withPlanState(seller);
  }

  // ── Subscription plans ────────────────────────────────────────────────────
  /** The public plan list (the `sellerPlans` setting, or the built-in defaults). */
  async plans(): Promise<SellerPlan[]> {
    return parsePlans(await this.settings.get('sellerPlans'));
  }

  /** The seller as the apps see it: plus the plan that is actually in force right now. */
  withPlanState(seller: Seller) {
    return { ...sellerView(seller), activePlan: activePlanId(seller) };
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
    this.emitter.toRoles(ADMIN_ROLES, 'seller:updated', sellerView(saved));
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

  /** Open a store: KYC is mandatory. A user who already has a store gets it back unchanged. */
  async register(user: { id: string; name: string }, data: KycInput) {
    const existing = await this.byUser(user.id);
    if (existing) return this.withPlanState(existing);
    const kyc = validateKyc(data);
    const now = new Date();
    const seller = await this.sellers.save(
      this.sellers.create({
        name: kyc.name,
        userId: user.id,
        status: 'pending',
        badge: 'bronze',
        ...this.kycColumns(kyc),
        termsAcceptedAt: now,
        kycSubmittedAt: now,
      }),
    );
    this.emitter.toRoles(ADMIN_ROLES, 'seller:updated', sellerView(seller));
    this.emitter.toUser(user.id, 'seller:updated', this.withPlanState(seller));
    await this.notifications.toRole('admin_moderation', {
      title: 'New seller application',
      body: seller.name,
      type: 'seller',
      entityId: seller.id,
    });
    return this.withPlanState(seller);
  }

  private kycColumns(kyc: ValidKyc) {
    return {
      legalName: kyc.legalName,
      phone: kyc.phone,
      idNumber: kyc.idNumber,
      rccm: kyc.rccm,
      taxNumber: kyc.taxNumber,
      documentUrls: JSON.stringify(kyc.documentUrls),
    };
  }

  /**
   * File the KYC again: allowed for a rejected store, or a pending store that never
   * filed one (opened before KYC existed). Puts the store back in the moderation queue.
   */
  async resubmit(userId: string, data: KycInput) {
    const seller = await this.byUser(userId);
    if (!seller) throw new NotFoundException('Open a store first.');
    const legacyPending = seller.status === 'pending' && !seller.kycSubmittedAt;
    if (seller.status !== 'rejected' && !legacyPending) {
      if (seller.status === 'suspended') throw new BadRequestException('A suspended store cannot resubmit; contact support.');
      if (seller.status === 'approved') throw new BadRequestException('Your store is already approved.');
      throw new BadRequestException('Your application is already under review.');
    }
    const kyc = validateKyc(data);
    const now = new Date();
    Object.assign(seller, this.kycColumns(kyc), {
      name: kyc.name,
      status: 'pending' as SellerStatus,
      statusReason: null,
      statusChangedAt: now,
      termsAcceptedAt: now,
      kycSubmittedAt: now,
    });
    const saved = await this.sellers.save(seller);
    this.emitter.toRoles(ADMIN_ROLES, 'seller:updated', sellerView(saved));
    this.emitter.toUser(userId, 'seller:updated', this.withPlanState(saved));
    await this.notifications.toRole('admin_moderation', {
      title: 'Seller resubmitted',
      body: saved.name,
      type: 'seller',
      entityId: saved.id,
    });
    return this.withPlanState(saved);
  }

  /** A seller edits their own store profile (name). */
  async updateProfile(
    userId: string,
    patch: { name?: string; pickupAddress?: string | null; logoUrl?: string | null; bannerUrl?: string | null; description?: string | null },
  ) {
    const seller = await this.byUser(userId);
    if (!seller) throw new NotFoundException('Store not found.');
    if (patch.name != null) seller.name = str(patch.name, 'Store name', { min: 2, max: 100 });
    if (patch.pickupAddress !== undefined) {
      seller.pickupAddress = patch.pickupAddress === null || patch.pickupAddress === '' ? null : str(patch.pickupAddress, 'Pickup address', { min: 5, max: 300 });
    }
    if (patch.logoUrl !== undefined) seller.logoUrl = uploadedImageUrl(patch.logoUrl, 'Logo');
    if (patch.bannerUrl !== undefined) seller.bannerUrl = uploadedImageUrl(patch.bannerUrl, 'Banner');
    if (patch.description !== undefined) {
      seller.description = patch.description === null || patch.description.trim() === '' ? null : str(patch.description, 'Description', { min: 10, max: 1000 });
    }
    const saved = await this.sellers.save(seller);
    this.emitter.toRoles(ADMIN_ROLES, 'seller:updated', sellerView(saved));
    if (saved.userId) this.emitter.toUser(saved.userId, 'seller:updated', this.withPlanState(saved));
    return this.withPlanState(saved);
  }

  /**
   * Moderate a store. Rejecting / suspending needs a reason the seller will see; approving needs
   * a filed KYC (except reinstating a suspended legacy store). Listings a suspension / rejection
   * takes off the storefront are remembered and put back live on approval.
   */
  async setStatus(id: string, status: SellerStatus, reasonInput?: unknown) {
    const seller = await this.sellers.findOne({ where: { id } });
    if (!seller) throw new NotFoundException('Seller not found.');
    const reason = decisionReason(reasonInput, status === 'rejected' || status === 'suspended');
    if (status === 'approved' && seller.status !== 'suspended' && !seller.kycSubmittedAt && !seller.termsAcceptedAt) {
      throw new BadRequestException('This store has not submitted its KYC yet.');
    }

    const takeDown = status === 'suspended' || status === 'rejected';
    const ownerIds = [seller.id, ...(seller.userId ? [seller.userId] : [])];
    const live = takeDown ? await this.products.find({ where: { sellerId: In(ownerIds), status: 'live' } }) : [];
    const previous = parseJsonList(seller.suspendedListingIds);

    seller.status = status;
    seller.statusReason = reason;
    seller.statusChangedAt = new Date();
    if (takeDown) {
      // Recorded BEFORE the listings move, so a failure half-way never loses track of them.
      seller.suspendedListingIds = JSON.stringify([...new Set([...previous, ...live.map((p) => p.id)])]);
    }
    const toRestore = status === 'approved' && previous.length ? previous : [];
    if (status === 'approved') seller.suspendedListingIds = null;
    const saved = await this.sellers.save(seller);

    // A suspended/rejected store's listings leave the storefront straight away.
    for (const p of live) {
      p.status = 'draft';
      await this.products.save(p);
      this.emitter.toRoles(['customer', 'guest', ...ADMIN_ROLES], 'product:updated', p);
    }
    // Reinstated: bring back the listings the suspension took down, unless the seller changed them since.
    if (toRestore.length) {
      const candidates = await this.products.find({ where: { id: In(toRestore) } });
      for (const p of candidates) {
        if (p.status !== 'draft' || !p.sellerId || !ownerIds.includes(p.sellerId)) continue;
        p.status = 'live';
        await this.products.save(p);
        this.emitter.toRoles(['customer', 'guest', ...ADMIN_ROLES], 'product:updated', p);
      }
    }

    this.emitter.toRoles(ADMIN_ROLES, 'seller:updated', sellerView(saved));
    if (saved.userId) {
      this.emitter.toUser(saved.userId, 'seller:updated', this.withPlanState(saved));
      await this.notifications.toUser(saved.userId, {
        title: `Store ${status}`,
        body: `Your store "${saved.name}" is now ${status}.${reason ? ` Reason: ${reason}` : ''}`,
        type: 'seller',
        entityId: saved.id,
      });
    }
    return this.withPlanState(saved);
  }

  /** Public storefront: the seller + their live products. */
  async storefront(id: string) {
    const seller = await this.get(id);
    // Only approved stores are public; never expose the owner's user id.
    if (!seller || seller.status !== 'approved') return null;
    // Through ProductsService so shoppers see the same effective (campaign / flash) prices they are charged.
    const products = await this.productsSvc.list({ sellerId: id, status: 'live', limit: 500 });
    // Owner id, pickup address, plan expiry and everything KYC / moderation stay private.
    const publicSeller: Record<string, unknown> = { ...seller };
    for (const k of PRIVATE_SELLER_KEYS) delete publicSeller[k];
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
        .where("p.sellerId IN (:...ids) AND o.status NOT IN ('cancelled','returned') AND i.fulfilment <> 'cancelled'", { ids })
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
