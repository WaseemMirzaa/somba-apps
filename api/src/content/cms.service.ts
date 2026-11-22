import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CmsBlock } from '../database/entities';
import { oneOf, str } from '../common/validate';
import { RealtimeEmitter } from '../realtime/realtime-emitter';
import { ROLE_GROUPS } from '../common/role-groups';

/** Staff who edit marketing content and follow it live: the super admin and Marketing (group `content`). */
const CONTENT_ROLES: string[] = [...ROLE_GROUPS.content];
import { TranslationService } from '../translation/translation.service';
import type { TranslationStatus } from '../translation/translation.service';
import { planWrite } from '../translation/translatable';
import type { WriteState } from '../translation/translatable';
import { isLocale } from '../translation/translator.provider';

/** What a tap on a home card opens. `deals` takes no target; `url` takes an https address; the others take an id. */
export const CMS_LINK_TYPES = ['product', 'category', 'store', 'deals', 'url'] as const;
/** Colour tokens of the fallback gradient a home card draws when it has no picture (the apps map each to their own palette). */
export const CMS_COLOR_KEYS = ['brand', 'deal', 'blue', 'green', 'teal', 'amber', 'ink'] as const;

/** A shopper sees a block that is active and inside its schedule. */
export function cmsVisibleNow(b: Pick<CmsBlock, 'active' | 'startsAt' | 'endsAt'>, now = new Date()): boolean {
  return b.active && (!b.startsAt || b.startsAt <= now) && (!b.endsAt || b.endsAt > now);
}

/** A CMS block as clients receive it: title and body in both languages. */
export type ServedCmsBlock = CmsBlock & { titleFr: string; bodyFr: string; machineTranslated: string[]; translationStatus: TranslationStatus };

@Injectable()
export class CmsService {
  constructor(
    @InjectRepository(CmsBlock) private readonly blocks: Repository<CmsBlock>,
    private readonly emitter: RealtimeEmitter,
    private readonly translations: TranslationService,
  ) {
    // A machine finished a block's other language: tell the same rooms as any block change.
    this.translations.registerRepublisher('cms_block', async (id) => {
      const block = await this.blocks.findOne({ where: { id } });
      if (block) this.announce((await this.present([block]))[0]);
    });
  }

  async present(rows: CmsBlock[]): Promise<ServedCmsBlock[]> {
    const texts = await this.translations.present('cms_block', rows);
    return rows.map((r) => {
      const t = texts.get(r.id)!;
      return Object.assign(Object.create(Object.getPrototypeOf(r)), r, {
        title: t.texts.title ?? r.title,
        titleFr: t.texts.titleFr ?? r.title,
        body: t.texts.body ?? r.body,
        bodyFr: t.texts.bodyFr ?? r.body,
        machineTranslated: t.machineTranslated,
        translationStatus: t.translationStatus,
      }) as ServedCmsBlock;
    });
  }

  /** Shoppers only see active blocks inside their schedule; admins see drafts and scheduled blocks too. Lowest `sortOrder` first. */
  async list(admin = false): Promise<ServedCmsBlock[]> {
    const rows = await this.blocks.find({ order: { sortOrder: 'ASC', updatedAt: 'ASC', key: 'ASC' } });
    return this.present(admin ? rows : rows.filter((r) => cmsVisibleNow(r)));
  }

  /**
   * Tell everyone, guests included, that a block changed. A block that is on (active) goes out whole, the app applies its
   * schedule; one that is off or gone goes out as a stub (id, key, `active: false`) so no draft text leaves the staff rooms.
   * The staff rooms always get the whole block (or `{ deleted: true }`).
   */
  private announce(block: ServedCmsBlock | { id: string; key: string; deleted: true }): void {
    if ('deleted' in block) {
      this.emitter.broadcast('cms:updated', block);
      return;
    }
    this.emitter.broadcast('cms:updated', block.active ? block : { id: block.id, key: block.key, type: block.type, active: false });
    this.emitter.toRoles(CONTENT_ROLES, 'cms:updated', block);
  }

  /** Remove a block (and its stored translations); the apps drop the card at once. */
  async remove(data: Record<string, unknown>): Promise<{ id: string; key: string }> {
    const key = str(data?.key, 'Key', { max: 80 });
    const existing = await this.blocks.findOne({ where: { key } });
    if (!existing) throw new Error('That block no longer exists.');
    await this.blocks.delete({ id: existing.id });
    await this.translations.forget('cms_block', existing.id);
    this.announce({ id: existing.id, key, deleted: true });
    return { id: existing.id, key };
  }

  /** Put the listed blocks in this order (the others keep their place after them); the positions are renumbered 10 apart. */
  async reorder(data: Record<string, unknown>): Promise<ServedCmsBlock[]> {
    const keys = Array.isArray(data?.keys) ? data.keys.filter((k): k is string => typeof k === 'string') : [];
    if (!keys.length || keys.length > 200) throw new Error('Choose the blocks to put in order.');
    const all = await this.blocks.find({ order: { sortOrder: 'ASC', updatedAt: 'ASC', key: 'ASC' } });
    const byKey = new Map(all.map((b) => [b.key, b]));
    const first = [...new Set(keys)].map((k) => byKey.get(k)).filter((b): b is CmsBlock => !!b);
    const ordered = [...first, ...all.filter((b) => !first.includes(b))];
    const changed: CmsBlock[] = [];
    await this.blocks.manager.transaction(async (m) => {
      for (let i = 0; i < ordered.length; i++) {
        const want = (i + 1) * 10;
        if (ordered[i].sortOrder === want) continue;
        await m.update(CmsBlock, { id: ordered[i].id }, { sortOrder: want });
        ordered[i].sortOrder = want;
        changed.push(ordered[i]);
      }
    });
    const served = await this.present(changed);
    for (const b of served) this.announce(b);
    return this.list(true);
  }

  /** The card fields of an upsert, checked. A field not sent is left out (unchanged); null or '' clears it. */
  private cardColumns(data: Record<string, unknown>, existing: CmsBlock | null): Partial<CmsBlock> {
    const out: Partial<CmsBlock> = {};
    const blank = (v: unknown) => v === null || v === '';
    if (data.imageUrl !== undefined) {
      if (blank(data.imageUrl)) out.imageUrl = null;
      else {
        const u = typeof data.imageUrl === 'string' ? data.imageUrl.trim() : '';
        if (u.length > 500 || (!/^https?:\/\/\S+$/i.test(u) && !/^\/[^\s]+$/.test(u))) throw new Error('The card picture must be an uploaded image or an http(s) link.');
        out.imageUrl = u;
      }
    }
    for (const k of ['ctaText', 'ctaTextFr'] as const) {
      if (data[k] === undefined) continue;
      if (blank(data[k])) out[k] = null;
      else {
        const v = typeof data[k] === 'string' ? (data[k] as string).trim() : '';
        if (!v || v.length > 40) throw new Error('The button text must be 1 to 40 characters.');
        out[k] = v;
      }
    }
    if (data.sortOrder !== undefined) {
      const n = Number(data.sortOrder);
      if (data.sortOrder === null || data.sortOrder === '' || !Number.isInteger(n) || n < 0 || n > 100000) throw new Error('The card position must be a whole number from 0 to 100000.');
      out.sortOrder = n;
    }
    if (data.colorKey !== undefined) {
      if (!blank(data.colorKey) && !(CMS_COLOR_KEYS as readonly string[]).includes(data.colorKey as string)) throw new Error('Choose one of the card colours.');
      out.colorKey = blank(data.colorKey) ? null : (data.colorKey as string);
    }
    for (const k of ['startsAt', 'endsAt'] as const) {
      if (data[k] === undefined) continue;
      if (blank(data[k])) out[k] = null;
      else {
        const d = new Date(String(data[k]));
        if (Number.isNaN(d.getTime())) throw new Error('Enter a valid start and end date.');
        out[k] = d;
      }
    }
    const starts = out.startsAt !== undefined ? out.startsAt : (existing?.startsAt ?? null);
    const ends = out.endsAt !== undefined ? out.endsAt : (existing?.endsAt ?? null);
    if (starts && ends && ends <= starts) throw new Error('The end date must be after the start date.');

    // The tap target: type and target are checked together, against what is already stored when only one is sent.
    if (data.linkType !== undefined || data.linkTarget !== undefined) {
      const type = data.linkType !== undefined ? (blank(data.linkType) ? null : (CMS_LINK_TYPES as readonly string[]).includes(data.linkType as string) ? (data.linkType as string) : (() => { throw new Error('Choose what the card opens: a product, category, store, the deals page or a web address.'); })()) : (existing?.linkType ?? null);
      const rawTarget = data.linkTarget !== undefined ? data.linkTarget : existing?.linkTarget;
      if (!type) {
        out.linkType = null;
        out.linkTarget = null;
      } else if (type === 'deals') {
        out.linkType = 'deals';
        out.linkTarget = null;
      } else {
        const target = typeof rawTarget === 'string' ? rawTarget.trim() : '';
        if (!target || target.length > 500) throw new Error('Choose the product, category or store the card opens.');
        if (type === 'url' && !/^https:\/\/\S+$/i.test(target)) throw new Error('The web address must start with https://.');
        out.linkType = type;
        out.linkTarget = target;
      }
    }
    const finalType = out.linkType !== undefined ? out.linkType : (existing?.linkType ?? null);
    const finalCta = (out.ctaText !== undefined ? out.ctaText : existing?.ctaText) || (out.ctaTextFr !== undefined ? out.ctaTextFr : existing?.ctaTextFr);
    if (finalCta && !finalType) throw new Error('A button needs somewhere to go: choose what the card opens.');
    return out;
  }

  async upsert(data: Record<string, unknown>): Promise<ServedCmsBlock> {
    const key = str(data?.key, 'Key', { max: 80 });
    const word = (k: string, label: string, max: number, min = 1) =>
      data[k] === undefined ? undefined : data[k] === null || data[k] === '' ? null : str(data[k], label, { min, max });
    const input = {
      title: { en: word('title', 'Title', 200), fr: word('titleFr', 'French title', 200) },
      body: { en: word('body', 'Body', 20000, 0), fr: word('bodyFr', 'French body', 20000, 0) },
    };
    const columns: Partial<CmsBlock> = {
      ...(data.type !== undefined ? { type: oneOf(data.type, ['banner', 'page', 'faq', 'popup', 'notice'] as const, 'Type') } : {}),
      ...(data.active !== undefined ? { active: !!data.active } : {}),
    };
    const existing = await this.blocks.findOne({ where: { key } });
    Object.assign(columns, this.cardColumns(data, existing));
    // A new block goes to the end of the carousel unless the admin gave it a position.
    if (!existing && columns.sortOrder === undefined) {
      const last = await this.blocks.createQueryBuilder('b').select('MAX(b.sortOrder)', 'max').getRawOne<{ max: number | string | null }>();
      columns.sortOrder = Number(last?.max ?? 0) + 10;
    }
    const missingTitle = 'Enter a title in English or French.';
    if (!existing && input.body.en === undefined && input.body.fr === undefined && data.body === undefined) {
      throw new Error('A new block needs a title and a body.');
    }
    let state: WriteState | null = null;
    if (existing) {
      const rows = (await this.translations.rowsFor('cms_block', [existing.id])).get(existing.id) ?? [];
      const authors: WriteState['authors'] = {};
      for (const r of rows) if (r.origin === 'author' && isLocale(r.locale)) (authors[r.field] ??= {})[r.locale] = r.value;
      state = { sourceLang: isLocale(existing.sourceLang) ? existing.sourceLang : 'en', base: { title: existing.title, body: existing.body }, authors };
    }
    const plan = planWrite({ type: 'cms_block', create: !existing, state, input, clientSourceLang: data.sourceLang, missingTitle });
    const saved = await this.blocks.manager.transaction(async (m) => {
      const set: Partial<CmsBlock> = { ...columns, sourceLang: plan.sourceLang };
      if (typeof plan.base.title === 'string') set.title = plan.base.title;
      if ('body' in plan.base) set.body = plan.base.body ?? '';
      let row: CmsBlock;
      if (existing) {
        await m.update(CmsBlock, { id: existing.id }, set);
        row = { ...existing, ...set } as CmsBlock;
      } else {
        row = await m.save(m.create(CmsBlock, { key, title: '', body: '', ...set }));
      }
      await this.translations.applyPlan(m, 'cms_block', row.id, plan, { title: row.title, body: row.body });
      return row;
    });
    if (plan.touched || plan.flipped) await this.translations.enqueue('cms_block', saved.id);
    const block = (await this.present([(await this.blocks.findOne({ where: { id: saved.id } }))!]))[0];
    this.announce(block);
    return block;
  }
}
