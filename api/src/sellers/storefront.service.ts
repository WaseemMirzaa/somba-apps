import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, Repository } from 'typeorm';
import { Seller } from '../database/entities';
import { str } from '../common/validate';
import { ADMIN_ROLES, NotificationsService } from '../notifications/notifications.service';
import { SellersService } from '../ops/sellers.service';
import { RealtimeEmitter } from '../realtime/realtime-emitter';
import { TranslationService } from '../translation/translation.service';
import { planWrite } from '../translation/translatable';
import type { FieldInput, WritePlan, WriteState } from '../translation/translatable';
import { isLocale } from '../translation/translator.provider';
import { cleanGoals, cleanHandlingDays, cleanVacationUntil, onVacation, parseGoals, vacationNotice } from './storefront';
import { cleanPayoutAccount, maskAccount } from './payout-account';
import type { SellerContext } from './seller-context';

/** The storefront settings a seller can change (all optional; `undefined` = untouched, `null` / '' = cleared). */
export interface StorefrontPatch {
  vacationUntil?: unknown;
  handlingDays?: unknown;
  returnsPolicy?: unknown;
  returnsPolicyFr?: unknown;
  shippingPolicy?: unknown;
  shippingPolicyFr?: unknown;
}

const POLICY_FIELDS = ['returnsPolicy', 'shippingPolicy'] as const;
export const STOREFRONT_KEYS: (keyof StorefrontPatch)[] = ['vacationUntil', 'handlingDays', 'returnsPolicy', 'returnsPolicyFr', 'shippingPolicy', 'shippingPolicyFr'];

/** Does a `sellers:update` body touch storefront settings? */
export const touchesStorefront = (body: unknown): boolean =>
  !!body && typeof body === 'object' && STOREFRONT_KEYS.some((k) => (body as Record<string, unknown>)[k] !== undefined);

@Injectable()
export class StorefrontService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('Storefront');
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    @InjectRepository(Seller) private readonly sellers: Repository<Seller>,
    private readonly sellersSvc: SellersService,
    private readonly emitter: RealtimeEmitter,
    private readonly notifications: NotificationsService,
    private readonly translations?: TranslationService,
  ) {}

  onModuleInit(): void {
    const every = Number(process.env.VACATION_SWEEP_MS ?? 5 * 60_000);
    if (every > 0) {
      this.timer = setInterval(() => void this.sweepVacations().catch((e) => this.logger.warn(`vacation sweep failed: ${(e as Error).message}`)), every);
      this.timer.unref();
    }
  }
  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  // ── Vacation, handling time, policies ───────────────────────────────────
  async update(ctx: SellerContext, patch: StorefrontPatch) {
    const seller = await this.sellers.findOne({ where: { id: ctx.seller.id } });
    if (!seller) throw new BadRequestException('Store not found.');
    const wasAway = onVacation(seller);
    if (patch.vacationUntil !== undefined) seller.vacationUntil = cleanVacationUntil(patch.vacationUntil);
    if (patch.handlingDays !== undefined) seller.handlingDays = cleanHandlingDays(patch.handlingDays);

    // Policies are authored in either language; the other one is an author row or filled in by a machine.
    const text = (v: unknown, label: string): string | null | undefined =>
      v === undefined ? undefined : v === null || String(v).trim() === '' ? null : str(v, label, { min: 10, max: 2000 });
    const input: Record<string, FieldInput> = {};
    for (const f of POLICY_FIELDS) {
      const en = text(patch[f], f === 'returnsPolicy' ? 'Returns policy' : 'Shipping policy');
      const fr = text(patch[`${f}Fr` as keyof StorefrontPatch], f === 'returnsPolicy' ? 'Returns policy (French)' : 'Shipping policy (French)');
      if (en !== undefined || fr !== undefined) input[f] = { en, fr };
    }
    let plan: WritePlan | null = null;
    if (Object.keys(input).length) {
      const rows = this.translations ? ((await this.translations.rowsFor('seller', [seller.id])).get(seller.id) ?? []) : [];
      const state: WriteState = {
        sourceLang: isLocale(seller.sourceLang) ? seller.sourceLang : 'en',
        base: { returnsPolicy: seller.returnsPolicy, shippingPolicy: seller.shippingPolicy, description: seller.description },
        authors: Object.fromEntries(
          [...POLICY_FIELDS, 'description'].map((f) => [f, Object.fromEntries(rows.filter((r) => r.origin === 'author' && r.field === f).map((r) => [r.locale, r.value]))]),
        ),
      };
      plan = planWrite({ type: 'seller', create: false, state, input });
      for (const f of POLICY_FIELDS) if (f in plan.base) seller[f] = plan.base[f];
    }
    const saved = await this.sellers.manager.transaction(async (m) => {
      const row = await m.save(seller);
      if (plan && this.translations) {
        await this.translations.applyPlan(m, 'seller', row.id, plan, { description: row.description, returnsPolicy: row.returnsPolicy, shippingPolicy: row.shippingPolicy });
      }
      return row;
    });
    if (plan?.touched) await this.translations?.enqueue('seller', saved.id);
    await this.publish(saved, wasAway);
    return this.sellersSvc.withPlanState(saved);
  }

  /** Tell the owner's screens, the admins and (when the open/away state flipped) shoppers. */
  private async publish(saved: Seller, wasAway: boolean): Promise<void> {
    const view = await this.sellersSvc.withPlanState(saved);
    this.emitter.toRoles(ADMIN_ROLES, 'seller:updated', view);
    if (saved.userId) this.emitter.toUser(saved.userId, 'seller:updated', view);
    const away = onVacation(saved);
    if (away !== wasAway || away) {
      this.emitter.toRoles(['customer', 'guest', 'seller'], 'store:vacation', {
        // Listings carry the store id, or the owner's account id on older data: both are here so a client can match either.
        sellerId: saved.id,
        ownerId: saved.userId ?? null,
        sellerIds: [saved.id, ...(saved.userId ? [saved.userId] : [])],
        onVacation: away,
        vacationUntil: away ? saved.vacationUntil : null,
        notice: away ? vacationNotice(saved.name, saved.vacationUntil as Date) : null,
      });
    }
  }

  /** Vacations whose return date passed: the store reopens by itself and its owner is told. */
  async sweepVacations(now = new Date()): Promise<number> {
    const due = await this.sellers.find({ where: { vacationUntil: LessThanOrEqual(now) } });
    for (const s of due) {
      s.vacationUntil = null;
      await this.sellers.save(s);
      await this.publish(s, true);
      if (s.userId) {
        await this.notifications.toUser(s.userId, {
          title: 'Vacation mode ended',
          body: 'Your store is open again and takes new orders.',
          type: 'seller',
          entityId: s.id,
        });
      }
    }
    return due.length;
  }

  // ── Goals ────────────────────────────────────────────────────────────────
  goals(ctx: SellerContext) {
    return parseGoals(ctx.seller.goals);
  }

  async setGoals(ctx: SellerContext, input: unknown) {
    const clean = cleanGoals(input);
    await this.sellers.update({ id: ctx.seller.id }, { goals: JSON.stringify(clean) });
    return clean;
  }

  // ── Payout account (owner only) ───────────────────────────────────────────
  /** What members may see: the method and a masked account. The owner also gets the full account to edit. */
  payoutAccount(ctx: SellerContext) {
    const { payoutMethod, payoutAccount } = ctx.seller;
    return { method: payoutMethod, account: ctx.isOwner ? payoutAccount : null, masked: maskAccount(payoutAccount), set: !!payoutAccount };
  }

  async setPayoutAccount(ctx: SellerContext, input: { method?: unknown; account?: unknown; clear?: unknown }) {
    if (input?.clear === true) {
      await this.sellers.update({ id: ctx.seller.id }, { payoutMethod: null, payoutAccount: null });
      return { method: null, account: null, masked: null, set: false };
    }
    const clean = cleanPayoutAccount(input);
    await this.sellers.update({ id: ctx.seller.id }, { payoutMethod: clean.method, payoutAccount: clean.account });
    return { method: clean.method, account: clean.account, masked: maskAccount(clean.account), set: true };
  }
}
