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
import { budgetSpent, campaignRunning, campaignWindow } from '../products/pricing';
import { approvedStatus, canMoveCampaign } from './campaign-state';
import { TranslationService } from '../translation/translation.service';
import type { TranslationStatus } from '../translation/translation.service';
import { planWrite } from '../translation/translatable';
import type { WritePlan, WriteState } from '../translation/translatable';
import { isLocale } from '../translation/translator.provider';

/** A campaign as clients receive it: `name` / `nameFr`, and the store name joined in (never stored: it went stale). */
export type ServedCampaign = Campaign & {
  nameFr: string;
  sellerName: string | null;
  machineTranslated: string[];
  translationStatus: TranslationStatus;
  /** What is left of the budget (null = no budget set). */
  budgetRemainingUsd: number | null;
};

/** How often campaigns are started and ended on their dates (CAMPAIGN_SWEEP_MS, 0 turns it off). */
const SWEEP_MS = Number(process.env.CAMPAIGN_SWEEP_MS ?? 30_000);

/** One shopper counts at most this many view/click events a minute, and the same event on one campaign once per window. */
export const TRACK_PER_MINUTE = 60;
export const TRACK_SAME_WINDOW_MS = 10_000;

/** The owning seller's screens follow views / clicks within this long (a burst of events makes one push; 0 = at once). */
const STATS_PUSH_MS = () => Number(process.env.CAMPAIGN_STATS_PUSH_MS ?? 3000);

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
    private readonly translations: TranslationService,
  ) {
    // A machine finished a campaign's other language: tell the admins and the owning seller.
    this.translations.registerRepublisher('campaign', async (id) => {
      const c = await this.campaigns.findOne({ where: { id } });
      if (c) await this.publish(c, null, { prices: false });
    });
    // A sale used some of the campaign's budget: end it when it is all spent, and show the seller the new numbers.
    this.products.onCampaignSale((id) => this.afterSale(id));
  }

  private readonly trackLog = new Map<string, number[]>();
  private readonly trackSame = new Map<string, number>();

  /**
   * A shopper saw (`view`) or opened (`click`) a promoted product. Counted only while the campaign is really
   * discounting, and rate-limited per shopper: {@link TRACK_PER_MINUTE} events a minute, and the same event on the
   * same campaign once per {@link TRACK_SAME_WINDOW_MS}. Returns whether it was counted.
   */
  async track(who: string, campaignId: string, kind: unknown, now = Date.now()): Promise<{ counted: boolean }> {
    if (kind !== 'view' && kind !== 'click') throw new BadRequestException('Kind must be "view" or "click".');
    const id = String(campaignId ?? '');
    if (!/^[0-9a-f-]{36}$/i.test(id)) return { counted: false };
    const recent = (this.trackLog.get(who) ?? []).filter((t) => now - t < 60_000);
    if (recent.length >= TRACK_PER_MINUTE) {
      this.trackLog.set(who, recent);
      return { counted: false };
    }
    const sameKey = `${who}|${id}|${kind}`;
    const last = this.trackSame.get(sameKey);
    if (last !== undefined && now - last < TRACK_SAME_WINDOW_MS) return { counted: false };
    const campaign = await this.campaigns.findOne({ where: { id } });
    if (!campaign || !campaignRunning(campaign, now)) return { counted: false };
    recent.push(now);
    this.trackLog.set(who, recent);
    this.trackSame.set(sameKey, now);
    if (this.trackSame.size > 20_000) for (const [k, t] of this.trackSame) if (now - t > TRACK_SAME_WINDOW_MS) this.trackSame.delete(k);
    await this.campaigns
      .createQueryBuilder()
      .update(Campaign)
      .set(kind === 'view' ? { views: () => 'views + 1' } : { clicks: () => 'clicks + 1' })
      .where('id = :id', { id })
      .execute();
    this.statsChanged(id);
    return { counted: true };
  }

  private readonly statsDirty = new Set<string>();
  private statsTimer: ReturnType<typeof setTimeout> | null = null;

  /** Views / clicks of a campaign moved: tell its seller, at most once per window however many events came in. */
  private statsChanged(id: string): void {
    this.statsDirty.add(id);
    if (this.statsTimer) return;
    const wait = STATS_PUSH_MS();
    if (wait <= 0) {
      void this.flushStatsPushes();
      return;
    }
    this.statsTimer = setTimeout(() => void this.flushStatsPushes(), wait);
    this.statsTimer.unref();
  }

  /** Send the pending `campaign:updated` pushes now (the throttle's timer calls this; tests call it too). */
  async flushStatsPushes(): Promise<void> {
    if (this.statsTimer) clearTimeout(this.statsTimer);
    this.statsTimer = null;
    const ids = [...this.statsDirty];
    this.statsDirty.clear();
    for (const id of ids) {
      try {
        const c = await this.campaigns.findOne({ where: { id } });
        if (!c) continue;
        const owner = await this.ownerUserId(c);
        if (!owner) continue;
        this.emitter.toUser(owner, 'campaign:updated', (await this.present([c]))[0]);
      } catch {
        // The push is a courtesy: the numbers are in the database either way.
      }
    }
  }

  /** After a sale: tell the seller and marketing the numbers moved, and stop a campaign that spent its budget. */
  private async afterSale(id: string): Promise<void> {
    const c = await this.campaigns.findOne({ where: { id } });
    if (!c) return;
    if (budgetSpent(c) && (c.status === 'active' || c.status === 'scheduled')) {
      const claim = await this.campaigns
        .createQueryBuilder()
        .update(Campaign)
        .set({ status: 'ended', endedReason: 'budget' })
        .where('id = :id AND status = :from', { id, from: c.status })
        .execute();
      if (claim.affected) {
        const saved = (await this.campaigns.findOne({ where: { id } }))!;
        const shown = (await this.present([saved]))[0];
        await this.publish(saved, {
          title: 'Campaign budget used',
          body: `"${shown.name}" used its $${saved.budgetUsd.toFixed(2)} budget; prices are back to normal.`,
        });
        return;
      }
    }
    await this.publish(c, null, { prices: false });
  }

  /** Campaigns as served: both names, the store name joined, translation state. */
  async present(rows: Campaign[]): Promise<ServedCampaign[]> {
    if (!rows.length) return [];
    const ids = [...new Set(rows.map((r) => r.sellerId).filter((x): x is string => !!x))];
    const [texts, stores] = await Promise.all([
      this.translations.present('campaign', rows),
      ids.length ? this.sellers.find({ where: [{ id: In(ids) }, { userId: In(ids) }], select: { id: true, userId: true, name: true } }) : Promise.resolve([] as Seller[]),
    ]);
    const nameOf = new Map<string, string>();
    for (const st of stores) {
      nameOf.set(st.id, st.name);
      if (st.userId) nameOf.set(st.userId, st.name);
    }
    return rows.map((r) => {
      const t = texts.get(r.id)!;
      return Object.assign(Object.create(Object.getPrototypeOf(r)), r, {
        name: t.texts.name ?? r.name,
        nameFr: t.texts.nameFr ?? r.name,
        sellerName: r.sellerId ? (nameOf.get(r.sellerId) ?? null) : null,
        machineTranslated: t.machineTranslated,
        translationStatus: t.translationStatus,
        budgetRemainingUsd: r.budgetUsd > 0 ? Math.max(0, Number((r.budgetUsd - (r.spentUsd ?? 0)).toFixed(2))) : null,
      }) as ServedCampaign;
    });
  }

  onModuleInit(): void {
    if (SWEEP_MS > 0) {
      this.sweeper = setInterval(() => void this.sweep().catch(() => undefined), SWEEP_MS);
      this.sweeper.unref();
    }
  }

  onModuleDestroy(): void {
    if (this.sweeper) clearInterval(this.sweeper);
    if (this.statsTimer) clearTimeout(this.statsTimer);
    this.statsTimer = null;
  }

  /**
   * Move campaigns along their dates: an approved campaign whose end date has passed is `ended`, a `scheduled` one
   * whose start date has passed becomes `active`, and an `active` one whose start is still ahead goes back to
   * `scheduled` (so the status always says what the prices are doing). Prices already follow the dates; this keeps
   * the stored status, the seller's screens and shoppers' screens in step (it re-announces the prices of every
   * product the campaign covers), and tells the seller.
   */
  async sweep(now = Date.now()): Promise<number> {
    let moved = 0;
    for (const c of await this.campaigns.find({ where: { status: In(['active', 'scheduled']) } })) {
      const { from, to } = campaignWindow(c);
      let next: CampaignStatus | null = null;
      let reason: string | null = null;
      if (to !== null && now > to) {
        next = 'ended';
        reason = 'dates';
      } else if (c.status === 'scheduled' && from !== null && now >= from) next = 'active';
      else if (c.status === 'active' && from !== null && now < from) next = 'scheduled';
      if (!next) continue;
      // Conditional, so two API instances sweeping at once move each campaign only once.
      const claim = await this.campaigns
        .createQueryBuilder()
        .update(Campaign)
        .set(reason ? { status: next, endedReason: reason } : { status: next })
        .where('id = :id AND status = :from', { id: c.id, from: c.status })
        .execute();
      if (!claim.affected) continue;
      moved++;
      const saved = (await this.campaigns.findOne({ where: { id: c.id } }))!;
      const shown = (await this.present([saved]))[0];
      await this.publish(
        saved,
        next === 'ended'
          ? { title: 'Campaign ended', body: `"${shown.name}" reached its end date; prices are back to normal.` }
          : next === 'active'
            ? { title: 'Campaign started', body: `"${shown.name}" is now live.` }
            : null,
      );
    }
    return moved;
  }

  /** Push a campaign change to admins and the owning seller, refresh prices, and optionally notify the seller. */
  private async publish(saved: Campaign, notice: { title: string; body: string } | null, opts: { prices?: boolean } = {}): Promise<void> {
    const shown = (await this.present([saved]))[0];
    this.emitter.toRoles(ADMIN_ROLES, 'campaign:updated', shown);
    // Prices move when a campaign starts or stops discounting: refresh shoppers' screens.
    if (opts.prices !== false) void this.products.broadcastCampaignPrices(saved).catch(() => undefined);
    const userId = await this.ownerUserId(saved);
    if (!userId) return;
    this.emitter.toUser(userId, 'campaign:updated', shown);
    if (notice) await this.notifications.toUser(userId, { ...notice, type: 'campaign', entityId: saved.id });
  }

  /** The seller account that owns a campaign (old rows may store the user id directly). */
  private async ownerUserId(c: Campaign): Promise<string | null> {
    if (!c.sellerId) return null;
    const seller = await this.sellers.findOne({ where: { id: c.sellerId } });
    return seller?.userId ?? c.sellerId;
  }

  /** The seller stops their own campaign at any point; marketing is told. */
  async withdraw(user: { id: string; role: string }, id: string): Promise<ServedCampaign> {
    const campaign = await this.campaigns.findOne({ where: { id } });
    if (!campaign || !(await this.owns(user, campaign))) throw new NotFoundException('Campaign not found.');
    if (campaign.status === 'ended') throw new BadRequestException('This campaign has already ended.');
    const claim = await this.campaigns
      .createQueryBuilder()
      .update(Campaign)
      .set({ status: 'ended', endedReason: 'withdrawn' })
      .where('id = :id AND status = :from', { id, from: campaign.status })
      .execute();
    if (!claim.affected) throw new BadRequestException('This campaign was just changed. Refresh and try again.');
    const row = (await this.campaigns.findOne({ where: { id } }))!;
    await this.publish(row, null);
    const saved = (await this.present([row]))[0];
    await this.notifications.toRole('admin_marketing', {
      title: 'Campaign withdrawn',
      body: `${saved.sellerName ?? 'A seller'} withdrew "${saved.name}".`,
      type: 'campaign',
      entityId: saved.id,
    });
    return saved;
  }

  /** Seller sees their own campaigns; ops/admin see everything. */
  async list(user: { id: string; role: string }): Promise<ServedCampaign[]> {
    if (user.role === 'seller') {
      const seller = await this.sellers.findOne({ where: { userId: user.id } });
      const sellerId = seller?.id ?? user.id;
      return this.present(
        await this.campaigns.find({
          where: [{ sellerId }, { sellerId: user.id }],
          order: { createdAt: 'DESC' },
          take: 200,
        }),
      );
    }
    if (user.role.startsWith('admin')) {
      return this.present(await this.campaigns.find({ order: { createdAt: 'DESC' }, take: 200 }));
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
      name?: string;
      nameFr?: string;
      sourceLang?: string;
      discount?: number;
      productCount?: number;
      budgetUsd?: number;
      startDate?: string;
      endDate?: string;
      productIds?: string[];
      /** Save without sending to marketing yet (`campaigns:submit` sends it). */
      draft?: boolean;
    },
  ): Promise<ServedCampaign> {
    const seller = await this.sellers.findOne({ where: { userId: user.id } });
    const fields = CampaignsService.clean(input, false);
    const plan = planWrite({
      type: 'campaign',
      create: true,
      state: null,
      input: CampaignsService.words(input),
      clientSourceLang: input.sourceLang,
      missingTitle: 'Enter a campaign name in English or French.',
    });
    const sellerId = seller?.id ?? user.id;
    if (input.productIds !== undefined) {
      fields.productIds = await this.checkProducts(input.productIds, user.role ?? '', sellerId, user.id);
      fields.productCount = (fields.productIds as string[]).length || fields.productCount;
    }
    const campaign = await this.campaigns.manager.transaction(async (m) => {
      const row = await m.save(
        m.create(Campaign, {
          reference: `CMP-${Date.now().toString().slice(-8)}`,
          sellerId,
          ...(fields as Partial<Campaign>),
          name: plan.base.name ?? '',
          sourceLang: plan.sourceLang,
          status: input.draft === true ? 'draft' : 'pending',
        }),
      );
      await this.translations.applyPlan(m, 'campaign', row.id, plan, { name: row.name });
      return row;
    });
    await this.translations.enqueue('campaign', campaign.id);
    const shown = (await this.present([campaign]))[0];
    this.emitter.toRoles(ADMIN_ROLES, 'campaign:updated', shown);
    if (seller?.userId) this.emitter.toUser(seller.userId, 'campaign:updated', shown);
    if (campaign.status === 'pending') {
      await this.notifications.toRole('admin_marketing', {
        title: 'New campaign request',
        body: `${shown.name} · ${campaign.discount}% off`,
        type: 'campaign',
        entityId: campaign.id,
      });
    }
    return shown;
  }

  /** The seller sends a saved draft to marketing. */
  async submit(user: { id: string; role: string }, id: string): Promise<ServedCampaign> {
    const campaign = await this.campaigns.findOne({ where: { id } });
    if (!campaign || !(await this.owns(user, campaign))) throw new NotFoundException('Campaign not found.');
    if (campaign.status !== 'draft' && campaign.status !== 'rejected') throw new BadRequestException('Only a draft or a rejected campaign can be sent to marketing.');
    const claim = await this.campaigns
      .createQueryBuilder()
      .update(Campaign)
      .set({ status: 'pending', rejectReason: null })
      .where('id = :id AND status = :from', { id, from: campaign.status })
      .execute();
    if (!claim.affected) throw new BadRequestException('This campaign was just changed. Refresh and try again.');
    const saved = (await this.campaigns.findOne({ where: { id } }))!;
    await this.publish(saved, null, { prices: false });
    const shown = (await this.present([saved]))[0];
    await this.notifications.toRole('admin_marketing', {
      title: 'New campaign request',
      body: `${shown.name} · ${saved.discount}% off`,
      type: 'campaign',
      entityId: saved.id,
    });
    return shown;
  }

  /** `name` / `nameFr` as sent: undefined = untouched, null = cleared. */
  private static words(input: Record<string, unknown>) {
    const w = (k: string, label: string) => (input[k] === undefined ? undefined : input[k] === null || input[k] === '' ? null : str(input[k], label, { max: 150 }));
    return { name: { en: w('name', 'Campaign name'), fr: w('nameFr', 'French name') } };
  }

  /** Validated, whitelisted campaign fields (the words go through {@link words} and the planner). */
  private static clean(input: Record<string, unknown>, partial: boolean) {
    const out: Record<string, unknown> = {};
    const has = (k: string) => input[k] !== undefined;
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

  /**
   * Marketing / admins decide a campaign. Only the moves of {@link CAMPAIGN_TRANSITIONS} are allowed. Approving
   * (`scheduled` or `active`, either is accepted) picks the right one from the start date; rejecting needs a
   * reason the seller will read.
   */
  async setStatus(id: string, wanted: CampaignStatus, reasonRaw?: unknown): Promise<ServedCampaign> {
    const campaign = await this.campaigns.findOne({ where: { id } });
    if (!campaign) throw new NotFoundException('Campaign not found.');
    const reason = typeof reasonRaw === 'string' ? reasonRaw.trim().slice(0, 300) : '';
    let status = wanted;
    if (wanted === 'rejected' && reason.length < 3) throw new BadRequestException('Give the seller a reason for rejecting this campaign (at least 3 characters).');
    if ((wanted === 'scheduled' || wanted === 'active') && campaign.status === 'pending') {
      const { from, to } = campaignWindow(campaign);
      if (to !== null && Date.now() > to) throw new BadRequestException('The end date of this campaign has already passed: ask the seller to change the dates.');
      status = approvedStatus(from);
    }
    if (status !== campaign.status && !canMoveCampaign(campaign.status, status)) {
      throw new BadRequestException(`A campaign that is ${campaign.status} cannot become ${status}.`);
    }
    const patch: Partial<Campaign> = { status };
    if (status === 'rejected') patch.rejectReason = reason;
    else if (status !== campaign.status) patch.rejectReason = null;
    if (status === 'ended' && campaign.status !== 'ended') patch.endedReason = 'admin';
    const claim = await this.campaigns
      .createQueryBuilder()
      .update(Campaign)
      .set(patch)
      .where('id = :id AND status = :from', { id, from: campaign.status })
      .execute();
    if (!claim.affected) throw new BadRequestException('This campaign was just changed. Refresh and try again.');
    const saved = (await this.campaigns.findOne({ where: { id } }))!;
    const shown = (await this.present([saved]))[0];
    await this.publish(
      saved,
      status === campaign.status
        ? null
        : status === 'rejected'
          ? { title: 'Campaign rejected', body: `"${shown.name}" was rejected: ${reason}` }
          : { title: `Campaign ${status}`, body: `"${shown.name}" is now ${status}.` },
    );
    return shown;
  }

  /** Sellers may edit their OWN campaign until it is approved; admins any. */
  async update(
    user: { id: string; role: string },
    id: string,
    patch: Record<string, unknown>,
  ): Promise<ServedCampaign> {
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
    const input = CampaignsService.words(patch ?? {});
    let plan: WritePlan | null = null;
    if (input.name.en !== undefined || input.name.fr !== undefined) {
      const rows = (await this.translations.rowsFor('campaign', [id])).get(id) ?? [];
      const state: WriteState = {
        sourceLang: isLocale(campaign.sourceLang) ? campaign.sourceLang : 'en',
        base: { name: campaign.name },
        authors: { name: Object.fromEntries(rows.filter((r) => r.origin === 'author' && r.field === 'name').map((r) => [r.locale, r.value])) },
      };
      plan = planWrite({ type: 'campaign', create: false, state, input, missingTitle: 'Enter a campaign name in English or French.' });
      if (typeof plan.base.name === 'string') fields.name = plan.base.name;
      fields.sourceLang = plan.sourceLang;
    }
    Object.assign(campaign, fields);
    // A seller's edit needs (re-)approval; a draft stays a draft until it is sent.
    if (!admin && campaign.status !== 'draft') {
      campaign.status = 'pending';
      campaign.rejectReason = null;
    }
    const saved = await this.campaigns.manager.transaction(async (m) => {
      const row = await m.save(campaign);
      if (plan) await this.translations.applyPlan(m, 'campaign', row.id, plan, { name: row.name });
      return row;
    });
    if (plan?.touched || plan?.flipped) await this.translations.enqueue('campaign', saved.id);
    const shown = (await this.present([saved]))[0];
    this.emitter.toRoles(ADMIN_ROLES, 'campaign:updated', shown);
    if (admin) void this.products.broadcastCampaignPrices(saved).catch(() => undefined);
    // The seller's own screens follow their edit (and an admin's edit of their campaign).
    const owner = await this.ownerUserId(saved);
    if (owner) this.emitter.toUser(owner, 'campaign:updated', shown);
    return shown;
  }
}
