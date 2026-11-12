import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Seller, SellerPolicyRevision } from '../database/entities';
import type { PolicyRevisionStatus } from '../database/entities';
import { str } from '../common/validate';
import { ROLE_GROUPS } from '../common/role-groups';
import { SettingsService } from '../content/settings.service';
import { NotificationsService } from '../notifications/notifications.service';
import { quotedNotice } from '../notifications/quote';
import { SellersService } from '../ops/sellers.service';
import { RealtimeEmitter } from '../realtime/realtime-emitter';
import { TranslationService } from '../translation/translation.service';
import type { SaveTranslation } from '../translation/translation.service';
import { planWrite } from '../translation/translatable';
import type { FieldInput, WritePlan, WriteState } from '../translation/translatable';
import { isLocale } from '../translation/translator.provider';
import { policyTemplate } from './policy-template';
import type { SellerContext } from './seller-context';

const FIELDS = ['returnsPolicy', 'shippingPolicy'] as const;
const LABEL = { returnsPolicy: 'Returns policy', shippingPolicy: 'Shipping policy' } as const;
const FR_LABEL = { returnsPolicy: 'Returns policy (French)', shippingPolicy: 'Shipping policy (French)' } as const;
type Field = (typeof FIELDS)[number];

/** What a client sends: per field, per language, `undefined` = not part of the change, `null` / '' = clear it, text = the new text. */
export interface PolicyPatch {
  returnsPolicy?: unknown;
  returnsPolicyFr?: unknown;
  shippingPolicy?: unknown;
  shippingPolicyFr?: unknown;
}

/** Does a body carry a policy field? (`sellers:update` sends policies with the rest of the storefront.) */
export const touchesPolicy = (body: unknown): boolean =>
  !!body && typeof body === 'object' && (['returnsPolicy', 'returnsPolicyFr', 'shippingPolicy', 'shippingPolicyFr'] as const).some((k) => (body as Record<string, unknown>)[k] !== undefined);

export interface PolicyRevisionView extends SellerPolicyRevision {
  storeName?: string;
  /** The text live on the store now, in both languages (to compare with the proposal). Only on admin list rows. */
  live?: { returnsPolicy: string | null; returnsPolicyFr: string | null; shippingPolicy: string | null; shippingPolicyFr: string | null };
}

/** The text a column holds for the live write: null column = untouched (undefined), '' = clear (null), else the text. */
const toInput = (col: string | null): string | null | undefined => (col === null ? undefined : col === '' ? null : col);
/** The column value for a client value: undefined = untouched (null column), null / '' = cleared (''), else the validated text. */
function column(v: unknown, label: string): string | null {
  if (v === undefined) return null;
  if (v === null || String(v).trim() === '') return '';
  return str(v, label, { min: 10, max: 2000 });
}

/**
 * Store policies need admin approval (docs/contracts/admin-controls.md). The seller's change never touches the live text:
 * it is stored as a `pending` revision. An admin in `storePolicy` approves it (the text is copied into the store's live
 * fields and translated exactly like the live write always was), rejects it with a note, or edits and publishes any
 * store's policy directly. The seller is told of every decision.
 */
@Injectable()
export class SellerPolicyService {
  constructor(
    @InjectRepository(SellerPolicyRevision) private readonly revisions: Repository<SellerPolicyRevision>,
    @InjectRepository(Seller) private readonly sellers: Repository<Seller>,
    private readonly sellersSvc: SellersService,
    private readonly emitter: RealtimeEmitter,
    private readonly notifications: NotificationsService,
    private readonly settings: SettingsService,
    private readonly translations?: TranslationService,
  ) {}

  /** The returns-policy template in English and French, with the platform's return window filled in. */
  async template() {
    const raw = await this.settings.get('returnWindowDays');
    return policyTemplate(raw === null || String(raw).trim() === '' ? NaN : Number(raw));
  }

  // ── The seller ───────────────────────────────────────────────────────────

  /** Validate a patch and turn it into the four revision columns (null = untouched), or null when it names no policy field. */
  private columns(patch: PolicyPatch): Pick<SellerPolicyRevision, 'returnsPolicy' | 'returnsPolicyFr' | 'shippingPolicy' | 'shippingPolicyFr'> | null {
    const cols = {
      returnsPolicy: column(patch.returnsPolicy, LABEL.returnsPolicy),
      returnsPolicyFr: column(patch.returnsPolicyFr, FR_LABEL.returnsPolicy),
      shippingPolicy: column(patch.shippingPolicy, LABEL.shippingPolicy),
      shippingPolicyFr: column(patch.shippingPolicyFr, FR_LABEL.shippingPolicy),
    };
    return Object.values(cols).some((v) => v !== null) ? cols : null;
  }

  /**
   * A seller's change of policies: the live text stays as it is, a pending revision holds the proposal (one per store:
   * a newer proposal replaces the fields of the pending one) and KOMORIKO admin is told. Returns the revision, or null when
   * the patch names no policy field.
   */
  async propose(ctx: SellerContext, patch: PolicyPatch): Promise<PolicyRevisionView | null> {
    const cols = this.columns(patch);
    if (!cols) return null;
    const pending = await this.revisions.findOne({ where: { sellerId: ctx.seller.id, status: 'pending' }, order: { createdAt: 'DESC' } });
    let row: SellerPolicyRevision;
    if (pending) {
      // The newest word on each field wins; a field the new proposal does not name keeps what was proposed before.
      const next: Partial<SellerPolicyRevision> = {};
      for (const [k, v] of Object.entries(cols)) if (v !== null) (next as Record<string, string | null>)[k] = v;
      // A field proposed in one language replaces the other language's older proposal (they are two authorings of one text).
      for (const f of FIELDS) {
        const en = cols[f];
        const fr = cols[`${f}Fr` as const];
        if (en !== null && fr === null) next[`${f}Fr` as const] = null;
        if (fr !== null && en === null) next[f] = null;
      }
      await this.revisions.update({ id: pending.id }, { ...next, proposedBy: ctx.user.id });
      row = (await this.revisions.findOne({ where: { id: pending.id } }))!;
    } else {
      row = await this.revisions.save(this.revisions.create({ sellerId: ctx.seller.id, ...cols, status: 'pending', note: null, proposedBy: ctx.user.id, decidedBy: null, decidedAt: null }));
    }
    const view: PolicyRevisionView = { ...row, storeName: ctx.seller.name };
    this.tellSeller(ctx.seller, 'seller:policy', view);
    this.emitter.toRoles([...ROLE_GROUPS.storePolicy], 'policy:pending', view);
    await this.notifications.toRole('admin_moderation', {
      title: 'Store policy awaiting approval',
      body: `${ctx.seller.name}: new returns or shipping policy to review.`,
      type: 'policy',
      entityId: ctx.seller.id,
    });
    return view;
  }

  /** The store's pending proposal (if any) and its latest decided one, for the seller portal. The live text is on the seller view. */
  async mine(ctx: SellerContext): Promise<{ pending: PolicyRevisionView | null; lastDecided: PolicyRevisionView | null }> {
    const [pending, lastDecided] = await Promise.all([
      this.revisions.findOne({ where: { sellerId: ctx.seller.id, status: 'pending' }, order: { createdAt: 'DESC' } }),
      this.revisions.findOne({ where: { sellerId: ctx.seller.id, status: In(['approved', 'rejected']) }, order: { decidedAt: 'DESC', createdAt: 'DESC' } }),
    ]);
    return { pending: pending ?? null, lastDecided: lastDecided ?? null };
  }

  // ── The admin ────────────────────────────────────────────────────────────

  /** Revisions for the queue, newest first, each with the store's name and the text live now. `status` defaults to `pending`; `all` lists every status. */
  async list(filter: { status?: unknown; sellerId?: unknown; limit?: unknown; offset?: unknown } = {}): Promise<PolicyRevisionView[]> {
    const status = String(filter.status ?? 'pending');
    if (status !== 'all' && !['pending', 'approved', 'rejected'].includes(status)) throw new BadRequestException('Status must be pending, approved, rejected or all.');
    const take = Math.min(200, Math.max(1, Math.floor(Number(filter.limit) || 50)));
    const skip = Math.max(0, Math.floor(Number(filter.offset) || 0));
    const where: Record<string, unknown> = {};
    if (status !== 'all') where.status = status as PolicyRevisionStatus;
    if (filter.sellerId) where.sellerId = String(filter.sellerId);
    const rows = await this.revisions.find({ where, order: { createdAt: 'DESC' }, take, skip });
    return this.decorate(rows);
  }

  /** Add the store's name and its live policy text (both languages) to revisions, for all of them at once. */
  private async decorate(rows: SellerPolicyRevision[]): Promise<PolicyRevisionView[]> {
    if (!rows.length) return [];
    const stores = await this.sellers.find({ where: { id: In([...new Set(rows.map((r) => r.sellerId))]) } });
    const shown = new Map((await this.sellersSvc.present(stores)).map((s) => [s.id, s]));
    return rows.map((r) => {
      const s = shown.get(r.sellerId) as (Record<string, unknown> & { name?: string }) | undefined;
      const text = (k: string): string | null => (typeof s?.[k] === 'string' ? (s[k] as string) : null);
      return {
        ...r,
        storeName: s?.name ?? 'Store',
        live: { returnsPolicy: text('returnsPolicy'), returnsPolicyFr: text('returnsPolicyFr'), shippingPolicy: text('shippingPolicy'), shippingPolicyFr: text('shippingPolicyFr') },
      };
    });
  }

  private async load(id: unknown): Promise<SellerPolicyRevision> {
    const row = await this.revisions.findOne({ where: { id: String(id ?? '') } });
    if (!row) throw new NotFoundException('Policy change not found.');
    return row;
  }

  /** One conditional update: nobody else decided it first. */
  private async claim(row: SellerPolicyRevision, to: Exclude<PolicyRevisionStatus, 'pending'>, admin: { id: string }, note: string | null): Promise<void> {
    const res = await this.revisions
      .createQueryBuilder()
      .update(SellerPolicyRevision)
      .set({ status: to, decidedBy: admin.id, decidedAt: new Date(), note })
      .where("id = :id AND status = 'pending'", { id: row.id })
      .execute();
    if (!res.affected) throw new BadRequestException('This policy change was already decided.');
  }

  /** Approve: the proposal becomes the live text (translated like any live write) and the seller is told. */
  async approve(admin: { id: string; name: string }, id: unknown, rawNote?: unknown): Promise<PolicyRevisionView> {
    const row = await this.load(id);
    if (row.status !== 'pending') throw new BadRequestException('This policy change was already decided.');
    const note = String(rawNote ?? '').trim().slice(0, 1000) || null;
    await this.claim(row, 'approved', admin, note);
    try {
      await this.writeLive(row.sellerId, {
        returnsPolicy: toInput(row.returnsPolicy),
        returnsPolicyFr: toInput(row.returnsPolicyFr),
        shippingPolicy: toInput(row.shippingPolicy),
        shippingPolicyFr: toInput(row.shippingPolicyFr),
      });
    } catch (e) {
      // The live write is what makes it an approval: put the proposal back in the queue.
      await this.revisions.update({ id: row.id }, { status: 'pending', decidedBy: null, decidedAt: null, note: null });
      throw e;
    }
    return this.decided(row.id, 'approved', note);
  }

  /** Reject with a note the seller reads (required); the live text is untouched. */
  async reject(admin: { id: string; name: string }, id: unknown, rawNote: unknown): Promise<PolicyRevisionView> {
    const row = await this.load(id);
    if (row.status !== 'pending') throw new BadRequestException('This policy change was already decided.');
    const note = String(rawNote ?? '').trim().slice(0, 1000);
    if (note.length < 5) throw new BadRequestException('Tell the seller why the policy was not approved.');
    await this.claim(row, 'rejected', admin, note);
    return this.decided(row.id, 'rejected', note);
  }

  /**
   * Edit and publish any store's policy directly: the text goes live now. A pending proposal of the store is settled by
   * it (`revisionId` names the one the admin edited and it is approved; any other pending one is closed as superseded).
   */
  async publish(
    admin: { id: string; name: string },
    input: PolicyPatch & { sellerId?: unknown; revisionId?: unknown; note?: unknown },
    opts: { silent?: boolean } = {},
  ): Promise<PolicyRevisionView> {
    const sellerId = String(input?.sellerId ?? '');
    const seller = sellerId ? await this.sellers.findOne({ where: { id: sellerId } }) : null;
    if (!seller) throw new NotFoundException('Store not found.');
    const cols = this.columns(input);
    if (!cols) throw new BadRequestException('Nothing to publish: write at least one policy.');
    const note = String(input?.note ?? '').trim().slice(0, 1000) || null;
    // Live first: a text that cannot be written never leaves a revision claiming it was published.
    await this.writeLive(sellerId, {
      returnsPolicy: toInput(cols.returnsPolicy),
      returnsPolicyFr: toInput(cols.returnsPolicyFr),
      shippingPolicy: toInput(cols.shippingPolicy),
      shippingPolicyFr: toInput(cols.shippingPolicyFr),
    });
    const edited = input?.revisionId ? await this.revisions.findOne({ where: { id: String(input.revisionId), sellerId, status: 'pending' } }) : null;
    const others = await this.revisions.find({ where: { sellerId, status: 'pending' } });
    let id: string;
    if (edited) {
      await this.revisions.update({ id: edited.id }, { ...cols, status: 'approved', decidedBy: admin.id, decidedAt: new Date(), note });
      id = edited.id;
    } else {
      id = (await this.revisions.save(this.revisions.create({ sellerId, ...cols, status: 'approved', note, proposedBy: admin.id, decidedBy: admin.id, decidedAt: new Date() }))).id;
    }
    for (const o of others.filter((o) => o.id !== id)) {
      await this.revisions.update({ id: o.id, status: 'pending' }, { status: 'rejected', decidedBy: admin.id, decidedAt: new Date(), note: 'Replaced: KOMORIKO published the store policy directly.' });
      this.tellSeller(seller, 'seller:policy', { ...(await this.load(o.id)), storeName: seller.name });
    }
    return this.decided(id, 'updated', note, opts.silent === true);
  }

  /** Tell the seller (live and as a notice) and the admin queue that a revision was decided. */
  private async decided(id: string, kind: 'approved' | 'rejected' | 'updated', note: string | null, silent = false): Promise<PolicyRevisionView> {
    const row = await this.load(id);
    const seller = await this.sellers.findOne({ where: { id: row.sellerId } });
    const [view] = await this.decorate([row]);
    this.emitter.toRoles([...ROLE_GROUPS.storePolicy], 'policy:decided', view);
    if (seller && !silent) {
      this.tellSeller(seller, 'seller:policy', view);
      const title = kind === 'approved' ? 'Store policy approved' : kind === 'rejected' ? 'Store policy rejected' : 'Store policy updated';
      const lead =
        kind === 'approved' ? 'Your returns and shipping policy is now live on your store' : kind === 'updated' ? 'KOMORIKO updated the policy shown on your store' : 'Your policy change was not approved';
      const translated: SaveTranslation | null = note && this.translations ? await this.translations.translateForSave(note).catch(() => null) : null;
      if (seller.userId) {
        await this.notifications.toUser(
          seller.userId,
          quotedNotice({ title, body: (q) => (note ? `${lead}: ${q}` : `${lead}.`), text: note ?? '', i18n: translated, max: 400, type: 'policy', entityId: seller.id }),
        );
      }
    }
    return view;
  }

  private tellSeller(seller: Pick<Seller, 'userId'>, event: string, view: PolicyRevisionView): void {
    if (seller.userId) this.emitter.toUser(seller.userId, event, view);
  }

  // ── The live write ───────────────────────────────────────────────────────

  /**
   * Write policy text onto the store: the one place the live `returnsPolicy` / `shippingPolicy` change. Per field and
   * language, `undefined` leaves the text alone, `null` clears it and a string sets it, authored in either language: the
   * other one is an author row or filled in by the machine translator, exactly as the seller's own write worked before
   * approval existed. Also the way the demo seed sets a store's policies.
   */
  async writeLive(sellerId: string, patch: { returnsPolicy?: string | null; returnsPolicyFr?: string | null; shippingPolicy?: string | null; shippingPolicyFr?: string | null }): Promise<void> {
    const seller = await this.sellers.findOne({ where: { id: sellerId } });
    if (!seller) throw new NotFoundException('Store not found.');
    const input: Record<string, FieldInput> = {};
    for (const f of FIELDS) {
      const en = patch[f];
      const fr = patch[`${f}Fr` as `${Field}Fr`];
      if (en !== undefined || fr !== undefined) input[f] = { en, fr };
    }
    if (!Object.keys(input).length) return;
    let plan: WritePlan | null = null;
    const rows = this.translations ? ((await this.translations.rowsFor('seller', [seller.id])).get(seller.id) ?? []) : [];
    const state: WriteState = {
      sourceLang: isLocale(seller.sourceLang) ? seller.sourceLang : 'en',
      base: { returnsPolicy: seller.returnsPolicy, shippingPolicy: seller.shippingPolicy, description: seller.description },
      authors: Object.fromEntries(
        [...FIELDS, 'description'].map((f) => [f, Object.fromEntries(rows.filter((r) => r.origin === 'author' && r.field === f).map((r) => [r.locale, r.value]))]),
      ),
    };
    plan = planWrite({ type: 'seller', create: false, state, input });
    for (const f of FIELDS) if (f in plan.base) seller[f] = plan.base[f];
    const saved = await this.sellers.manager.transaction(async (m) => {
      const row = await m.save(seller);
      if (plan && this.translations) {
        await this.translations.applyPlan(m, 'seller', row.id, plan, { description: row.description, returnsPolicy: row.returnsPolicy, shippingPolicy: row.shippingPolicy });
      }
      return row;
    });
    if (plan?.touched) await this.translations?.enqueue('seller', saved.id);
    const view = await this.sellersSvc.withPlanState(saved);
    SellersService.pushViewToAdmins(this.emitter, view);
    if (saved.userId) this.emitter.toUser(saved.userId, 'seller:updated', view);
  }
}
