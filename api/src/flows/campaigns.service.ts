import { BadRequestException, Injectable, NotFoundException, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { num, optStr, str } from '../common/validate';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Campaign, Product, Seller } from '../database/entities';
import type { CampaignStatus } from '../database/entities';
import {
  ADMIN_ROLES,
  NotificationsService,
} from '../notifications/notifications.service';
import { RealtimeEmitter } from '../realtime/realtime-emitter';
import { ProductsService } from '../products/products.service';
import { campaignWindow } from '../products/pricing';

/** How often campaigns are started and ended on their dates (CAMPAIGN_SWEEP_MS, 0 turns it off). */
const SWEEP_MS = Number(process.env.CAMPAIGN_SWEEP_MS ?? 5 * 60_000);

/**
 * Marketing campaigns: sellers propose, marketing/admins approve. An approved
 * campaign (`active`, inside its dates) really lowers the price of the products
 * it covers — see products/pricing.ts for the rules. `discount` is the percent off.
 */
@Injectable()
export class CampaignsService implements OnModuleInit, OnModuleDestroy {
  private sweeper: ReturnType<typeof setInterval> | null = null;

  constructor(
    @InjectRepository(Campaign) private readonly campaigns: Repository<Campaign>,
    @InjectRepository(Seller) private readonly sellers: Repository<Seller>,
    @InjectRepository(Product) private readonly productRepo: Repository<Product>,
    private readonly notifications: NotificationsService,
    private readonly emitter: RealtimeEmitter,
    private readonly products: ProductsService,
  ) {}

  onModuleInit(): void {
    if (SWEEP_MS > 0) {
      this.sweeper = setInterval(() => void this.sweep().catch(() => undefined), SWEEP_MS);
      this.sweeper.unref();
    }
  }

  onModuleDestroy(): void {
    if (this.sweeper) clearInterval(this.sweeper);
  }

  /**
   * Move campaigns along their dates: an approved campaign whose end date has passed is `ended`, and a `scheduled`
   * one whose start date has passed becomes `active`. Prices were already right (pricing reads the dates); this keeps
   * the stored status, the seller's screens and shoppers' prices in step, and tells the seller.
   */
  async sweep(now = Date.now()): Promise<number> {
    let moved = 0;
    for (const c of await this.campaigns.find({ where: { status: In(['active', 'scheduled']) } })) {
      const { from, to } = campaignWindow(c);
      let next: CampaignStatus | null = null;
      if (to !== null && now > to) next = 'ended';
      else if (c.status === 'scheduled' && from !== null && now >= from) next = 'active';
      if (!next) continue;
      // Conditional, so two API instances sweeping at once move each campaign only once.
      const claim = await this.campaigns
        .createQueryBuilder()
        .update(Campaign)
        .set({ status: next })
        .where('id = :id AND status = :from', { id: c.id, from: c.status })
        .execute();
      if (!claim.affected) continue;
      moved++;
      const saved = (await this.campaigns.findOne({ where: { id: c.id } }))!;
      await this.publish(saved, {
        title: next === 'ended' ? 'Campaign ended' : 'Campaign started',
        body: next === 'ended' ? `"${saved.name}" reached its end date; prices are back to normal.` : `"${saved.name}" is now live.`,
      });
    }
    return moved;
  }

  /** Push a campaign change to admins and the owning seller, refresh prices, and optionally notify the seller. */
  private async publish(saved: Campaign, notice: { title: string; body: string } | null): Promise<void> {
    this.emitter.toRoles(ADMIN_ROLES, 'campaign:updated', saved);
    // Prices move when a campaign starts or stops discounting: refresh shoppers' screens.
    void this.products.broadcastCampaignPrices(saved).catch(() => undefined);
    const userId = await this.ownerUserId(saved);
    if (!userId) return;
    this.emitter.toUser(userId, 'campaign:updated', saved);
    if (notice) await this.notifications.toUser(userId, { ...notice, type: 'campaign', entityId: saved.id });
  }

  /** The seller account that owns a campaign (old rows may store the user id directly). */
  private async ownerUserId(c: Campaign): Promise<string | null> {
    if (!c.sellerId) return null;
    const seller = await this.sellers.findOne({ where: { id: c.sellerId } });
    return seller?.userId ?? c.sellerId;
  }

  /** The seller stops their own campaign at any point; marketing is told. */
  async withdraw(user: { id: string; role: string }, id: string): Promise<Campaign> {
    const campaign = await this.campaigns.findOne({ where: { id } });
    if (!campaign || !(await this.owns(user, campaign))) throw new NotFoundException('Campaign not found.');
    if (campaign.status === 'ended') throw new BadRequestException('This campaign has already ended.');
    const claim = await this.campaigns
      .createQueryBuilder()
      .update(Campaign)
      .set({ status: 'ended' })
      .where('id = :id AND status = :from', { id, from: campaign.status })
      .execute();
    if (!claim.affected) throw new BadRequestException('This campaign was just changed. Refresh and try again.');
    const saved = (await this.campaigns.findOne({ where: { id } }))!;
    await this.publish(saved, null);
    await this.notifications.toRole('admin_marketing', {
      title: 'Campaign withdrawn',
      body: `${saved.sellerName ?? 'A seller'} withdrew "${saved.name}".`,
      type: 'campaign',
      entityId: saved.id,
    });
    return saved;
  }

  /** Seller sees their own campaigns; ops/admin see everything. */
  async list(user: { id: string; role: string }): Promise<Campaign[]> {
    if (user.role === 'seller') {
      const seller = await this.sellers.findOne({ where: { userId: user.id } });
      const sellerId = seller?.id ?? user.id;
      return this.campaigns.find({
        where: [{ sellerId }, { sellerId: user.id }],
        order: { createdAt: 'DESC' },
        take: 200,
      });
    }
    if (user.role.startsWith('admin')) {
      return this.campaigns.find({ order: { createdAt: 'DESC' }, take: 200 });
    }
    return [];
  }

  /** Does this campaign belong to the seller account? */
  private async owns(user: { id: string }, campaign: Campaign): Promise<boolean> {
    const seller = await this.sellers.findOne({ where: { userId: user.id } });
    return campaign.sellerId === user.id || (!!seller && campaign.sellerId === seller.id);
  }

  async create(
    user: { id: string; name: string; role?: string },
    input: {
      name: string;
      nameFr?: string;
      discount?: number;
      productCount?: number;
      budgetUsd?: number;
      startDate?: string;
      endDate?: string;
      productIds?: string[];
    },
  ): Promise<Campaign> {
    const seller = await this.sellers.findOne({ where: { userId: user.id } });
    const fields = CampaignsService.clean(input, false);
    const sellerId = seller?.id ?? user.id;
    if (input.productIds !== undefined) {
      fields.productIds = await this.checkProducts(input.productIds, user.role ?? '', sellerId, user.id);
      fields.productCount = (fields.productIds as string[]).length || fields.productCount;
    }
    const campaign = await this.campaigns.save(
      this.campaigns.create({
        reference: `CMP-${Date.now().toString().slice(-8)}`,
        sellerId,
        sellerName: seller?.name ?? user.name,
        ...fields,
        status: 'pending',
      }),
    );
    this.emitter.toRoles(ADMIN_ROLES, 'campaign:updated', campaign);
    if (seller?.userId) this.emitter.toUser(seller.userId, 'campaign:updated', campaign);
    await this.notifications.toRole('admin_marketing', {
      title: 'New campaign request',
      body: `${campaign.name} · ${campaign.discount}% off`,
      type: 'campaign',
      entityId: campaign.id,
    });
    return campaign;
  }

  /** Validated, whitelisted campaign fields. */
  private static clean(input: Record<string, unknown>, partial: boolean) {
    const out: Record<string, unknown> = {};
    const has = (k: string) => input[k] !== undefined;
    if (!partial || has('name')) out.name = str(input.name, 'Campaign name', { max: 150 });
    if (has('nameFr')) out.nameFr = optStr(input.nameFr, 'French name', 150);
    if (!partial || has('discount')) out.discount = num(input.discount ?? 0, 'Discount', { min: 0, max: 90 });
    if (!partial || has('productCount')) out.productCount = num(input.productCount ?? 0, 'Products', { min: 0, max: 100000, int: true });
    if (!partial || has('budgetUsd')) out.budgetUsd = num(input.budgetUsd ?? 0, 'Budget', { min: 0, max: 1_000_000 });
    if (has('startDate')) out.startDate = optStr(input.startDate, 'Start date', 40);
    if (has('endDate')) out.endDate = optStr(input.endDate, 'End date', 40);
    for (const k of ['startDate', 'endDate'] as const) {
      const v = out[k];
      if (typeof v === 'string' && !Number.isFinite(Date.parse(v))) throw new Error(`${k === 'startDate' ? 'Start' : 'End'} date is not a valid date.`);
    }
    if (has('startDate') || has('endDate')) {
      const { from, to } = campaignWindow({ startDate: (out.startDate as string | null) ?? null, endDate: (out.endDate as string | null) ?? null });
      if (from !== null && to !== null && to < from) throw new Error('The end date must be after the start date.');
    }
    return out;
  }

  /**
   * Validate the product list of a campaign: real products only, and a seller may
   * only discount their own. An empty list means "my whole store".
   */
  private async checkProducts(raw: unknown, role: string, sellerId: string, userId: string): Promise<string[]> {
    if (raw === null) return [];
    if (!Array.isArray(raw) || raw.length > 200) throw new BadRequestException('Choose up to 200 products.');
    const ids = [...new Set(raw.map((x) => String(x)))];
    if (!ids.length) return [];
    const rows = await this.productRepo.find({ where: { id: In(ids) }, select: { id: true, sellerId: true } });
    if (rows.length !== ids.length) throw new BadRequestException('One of the selected products does not exist.');
    if (!role.startsWith('admin') && rows.some((p) => p.sellerId !== sellerId && p.sellerId !== userId)) {
      throw new BadRequestException('You can only include your own products in a campaign.');
    }
    return ids;
  }

  async setStatus(id: string, status: CampaignStatus): Promise<Campaign> {
    const campaign = await this.campaigns.findOne({ where: { id } });
    if (!campaign) throw new NotFoundException('Campaign not found.');
    campaign.status = status;
    const saved = await this.campaigns.save(campaign);
    await this.publish(saved, { title: `Campaign ${status}`, body: `"${saved.name}" is now ${status}.` });
    return saved;
  }

  /** Sellers may edit their OWN campaign until it is approved; admins any. */
  async update(
    user: { id: string; role: string },
    id: string,
    patch: Record<string, unknown>,
  ): Promise<Campaign> {
    const campaign = await this.campaigns.findOne({ where: { id } });
    if (!campaign) throw new NotFoundException('Campaign not found.');
    const admin = user.role.startsWith('admin');
    if (!admin) {
      if (!(await this.owns(user, campaign))) throw new NotFoundException('Campaign not found.');
      if (!['draft', 'pending', 'rejected'].includes(campaign.status)) {
        throw new BadRequestException('An approved campaign can no longer be edited. Ask marketing to change it.');
      }
    }
    const fields = CampaignsService.clean(patch ?? {}, true);
    if (patch?.productIds !== undefined) {
      fields.productIds = await this.checkProducts(patch.productIds, user.role, campaign.sellerId ?? user.id, user.id);
      fields.productCount = (fields.productIds as string[]).length || (fields.productCount as number | undefined) || campaign.productCount;
    }
    Object.assign(campaign, fields);
    if (!admin) campaign.status = 'pending'; // an edit needs re-approval
    const saved = await this.campaigns.save(campaign);
    this.emitter.toRoles(ADMIN_ROLES, 'campaign:updated', saved);
    if (admin) void this.products.broadcastCampaignPrices(saved).catch(() => undefined);
    // The seller's own screens follow their edit (and an admin's edit of their campaign).
    const owner = await this.ownerUserId(saved);
    if (owner) this.emitter.toUser(owner, 'campaign:updated', saved);
    return saved;
  }
}
