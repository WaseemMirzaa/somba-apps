import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, Repository } from 'typeorm';
import { Seller } from '../database/entities';
import { cleanPoint } from '../common/geo/geo';
import { NotificationsService } from '../notifications/notifications.service';
import { SellersService } from '../ops/sellers.service';
import { RealtimeEmitter } from '../realtime/realtime-emitter';
import { SellerPolicyService, touchesPolicy } from './policy.service';
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

export const EXPRESS_NEEDS_PIN = 'This store has no pinned pickup location. Ask the seller to pin it in Store settings before turning on express delivery.';
export const EXPRESS_NOT_BOOLEAN = 'Express delivery must be true or false.';
/**
 * The keys of a `sellers:update` body that go to the storefront service. `expressDelivery` is NOT one: express is switched
 * by KOMORIKO admin (`sellers:setExpress`), and an old client that still sends it is ignored without an error. The policy
 * keys do not change the live text: they become a pending revision (`SellerPolicyService.propose`).
 */
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
    private readonly policies: SellerPolicyService,
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
  /**
   * The seller's storefront settings. Vacation and handling time are live at once. Policies are NOT: they become a pending
   * revision for KOMORIKO admin to approve (the live text stays), and the result says so in `policyRevision`. Express
   * delivery is not the seller's to switch (`setExpress`): an `expressDelivery` key from an old client is ignored.
   */
  async update(ctx: SellerContext, patch: StorefrontPatch) {
    // Validate the policies first, so a bad value saves nothing (the revision itself is written after the live settings).
    const policyPatch = touchesPolicy(patch) ? patch : null;
    const seller = await this.sellers.findOne({ where: { id: ctx.seller.id } });
    if (!seller) throw new BadRequestException('Store not found.');
    const wasAway = onVacation(seller);
    let changed = false;
    if (patch.vacationUntil !== undefined) {
      seller.vacationUntil = cleanVacationUntil(patch.vacationUntil);
      changed = true;
    }
    if (patch.handlingDays !== undefined) {
      seller.handlingDays = cleanHandlingDays(patch.handlingDays);
      changed = true;
    }
    const revision = policyPatch ? await this.policies.propose(ctx, policyPatch) : null;
    const saved = changed ? await this.sellers.save(seller) : seller;
    if (changed) await this.publish(saved, wasAway);
    return { ...(await this.sellersSvc.withPlanState(saved)), policyRevision: revision };
  }

  /**
   * KOMORIKO admin switches express delivery for a store (`sellers:setExpress`). Turning it on needs the store's pickup
   * location pinned on the map (express prices the distance from it): the same check the seller's own switch had.
   */
  async setExpress(sellerId: unknown, enabled: unknown) {
    if (typeof enabled !== 'boolean') throw new BadRequestException(EXPRESS_NOT_BOOLEAN);
    const seller = await this.sellers.findOne({ where: { id: String(sellerId ?? '') } });
    if (!seller) throw new BadRequestException('Store not found.');
    if (enabled && !cleanPoint(seller.pickupLat, seller.pickupLng)) throw new BadRequestException(EXPRESS_NEEDS_PIN);
    const changed = seller.expressDelivery !== enabled;
    seller.expressDelivery = enabled;
    const saved = await this.sellers.save(seller);
    await this.publish(saved, onVacation(saved));
    if (changed && saved.userId) {
      await this.notifications.toUser(saved.userId, {
        title: enabled ? 'Express delivery turned on' : 'Express delivery turned off',
        body: enabled ? 'KOMORIKO turned express delivery on for your store.' : 'KOMORIKO turned express delivery off for your store.',
        type: 'seller',
        entityId: saved.id,
      });
    }
    return this.sellersSvc.withPlanState(saved);
  }

  /** Tell the owner's screens, the admins and (when the open/away state flipped) shoppers. */
  private async publish(saved: Seller, wasAway: boolean): Promise<void> {
    const view = await this.sellersSvc.withPlanState(saved);
    SellersService.pushViewToAdmins(this.emitter, view);
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
