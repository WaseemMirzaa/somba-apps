import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Seller } from '../database/entities';
import { SettingsService } from '../content/settings.service';
import { SellersService } from '../ops/sellers.service';
import { RealtimeEmitter } from '../realtime/realtime-emitter';
import { ROLE_GROUPS } from '../common/role-groups';
import {
  AFTER_SALE_KEYS,
  AFTER_SALE_SETTING,
  defaultsFrom,
  overrideColumn,
  parseOverride,
  resolveAccess,
} from './after-sale-access';
import type { AfterSaleAccess, AfterSaleKey, AfterSaleOverride } from './after-sale-access';

const ONLY_BOOLEAN = 'Choose On or Off for each section.';
const ONLY_TRISTATE = 'Choose Follow default, On or Off for each section.';

/**
 * Which read-only after-sale sections each store's portal shows (docs/contracts/admin-controls.md §13): the platform defaults
 * (four staff-only settings, all off) and the per-store override (`sellers.afterSaleAccess`). Every change goes live: the
 * store's portal gets `seller:updated`, the staff managing it get `sellerAccess:defaults` / `seller:updated`.
 */
@Injectable()
export class AfterSaleAccessService {
  constructor(
    @InjectRepository(Seller) private readonly sellers: Repository<Seller>,
    private readonly settings: SettingsService,
    private readonly sellersSvc: SellersService,
    private readonly emitter: RealtimeEmitter,
  ) {}

  /** The four platform defaults (a section nobody switched on is off). */
  async defaults(): Promise<AfterSaleAccess> {
    return defaultsFrom(await this.settings.all());
  }

  /** What this store sees right now. */
  async forSeller(seller: Pick<Seller, 'afterSaleAccess'>): Promise<AfterSaleAccess> {
    return resolveAccess(parseOverride(seller.afterSaleAccess), await this.defaults());
  }

  async forSellerId(sellerId: string | null | undefined): Promise<AfterSaleAccess | null> {
    if (!sellerId) return null;
    const seller = await this.sellers.findOne({ where: { id: sellerId }, select: { id: true, afterSaleAccess: true } });
    return seller ? this.forSeller(seller) : null;
  }

  // ── Defaults ───────────────────────────────────────────────────────────────

  /**
   * `{ returns?, exchanges?, replacements?, express? }` (booleans): the platform defaults. A store that follows the default for
   * a section that just changed is told live. Returns the four defaults after the change.
   */
  async setDefaults(body: Record<string, unknown> | undefined): Promise<{ defaults: AfterSaleAccess; changed: AfterSaleKey[] }> {
    const before = await this.defaults();
    const asked: Partial<Record<AfterSaleKey, boolean>> = {};
    for (const k of AFTER_SALE_KEYS) {
      const v = body?.[k];
      if (v === undefined) continue;
      if (typeof v !== 'boolean') throw new Error(ONLY_BOOLEAN);
      asked[k] = v;
    }
    const changed = AFTER_SALE_KEYS.filter((k) => asked[k] !== undefined && asked[k] !== before[k]);
    for (const k of changed) await this.settings.set(AFTER_SALE_SETTING[k], String(asked[k]));
    const defaults = await this.defaults();
    if (changed.length) {
      this.emitter.toRoles([...ROLE_GROUPS.sellerAfterSaleManage, 'admin_finance'], 'sellerAccess:defaults', defaults);
      // Every store that follows the default for one of the changed sections (an override on it keeps the store as it is).
      const stores = await this.sellers.find({ select: { id: true, userId: true, afterSaleAccess: true } });
      for (const s of stores) {
        const o = parseOverride(s.afterSaleAccess);
        if (!changed.some((k) => typeof o[k] !== 'boolean')) continue;
        await this.pushStore(s.id);
      }
    }
    return { defaults, changed };
  }

  // ── One store ──────────────────────────────────────────────────────────────

  /** `{ sellerId, returns?, exchanges?, replacements?, express? }`, each true | false | null (null = follow the default). Returns the store as staff see it. */
  async setStoreAccess(body: Record<string, unknown> | undefined): Promise<{ store: Record<string, unknown>; seller: Seller; before: AfterSaleAccess; after: AfterSaleAccess }> {
    const id = String(body?.sellerId ?? body?.id ?? '');
    const seller = id ? await this.sellers.findOne({ where: { id } }) : null;
    if (!seller) throw new Error('Store not found.');
    const override: AfterSaleOverride = parseOverride(seller.afterSaleAccess);
    const defaults = await this.defaults();
    const before = resolveAccess(override, defaults);
    for (const k of AFTER_SALE_KEYS) {
      const v = body?.[k];
      if (v === undefined) continue;
      if (v === null) delete override[k];
      else if (typeof v === 'boolean') override[k] = v;
      else throw new Error(ONLY_TRISTATE);
    }
    seller.afterSaleAccess = overrideColumn(override);
    await this.sellers.update({ id: seller.id }, { afterSaleAccess: seller.afterSaleAccess });
    const after = resolveAccess(override, defaults);
    const store = await this.pushStore(seller.id);
    return { store, seller, before, after };
  }

  /** The store's portal follows the change live (`seller:updated` to the owner and, through the mirror, the team); staff pages too. */
  async pushStore(sellerId: string): Promise<Record<string, unknown>> {
    const seller = await this.sellers.findOne({ where: { id: sellerId } });
    if (!seller) throw new Error('Store not found.');
    const view = (await this.sellersSvc.withPlanState(seller)) as unknown as Record<string, unknown>;
    if (seller.userId) this.emitter.toUser(seller.userId, 'seller:updated', view);
    SellersService.pushViewToAdmins(this.emitter, view);
    return view;
  }
}
