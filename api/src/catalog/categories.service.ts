import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Not, QueryFailedError, Repository } from 'typeorm';
import { Category, Product } from '../database/entities';
import { num, optStr } from '../common/validate';
import { RealtimeEmitter } from '../realtime/realtime-emitter';
import { ADMIN_ROLES } from '../notifications/notifications.service';
import { TranslationService } from '../translation/translation.service';
import type { TranslationStatus } from '../translation/translation.service';
import { planWrite } from '../translation/translatable';
import type { WritePlan, WriteState } from '../translation/translatable';
import { isLocale } from '../translation/translator.provider';

/** A category as clients receive it (plan §2.2). */
export type ServedCategory = Category & {
  nameFr: string | null;
  /** Live listings in the category. */
  productCount: number;
  /** Listings (any status except removed) that point at it: what blocks deleting it (C-I2). */
  usedBy: number;
  machineTranslated: string[];
  translationStatus: TranslationStatus;
};

/** C-I2: the refusal when listings still use a category (singular and plural both read naturally). */
export const categoryInUseMessage = (n: number): string =>
  n === 1
    ? '1 product uses this category. Move it to another category first.'
    : `${n} products use this category. Move them to another category first.`;

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

@Injectable()
export class CategoriesService {
  constructor(
    @InjectRepository(Category) private readonly repo: Repository<Category>,
    @InjectRepository(Product) private readonly products: Repository<Product>,
    private readonly emitter: RealtimeEmitter,
    private readonly translations: TranslationService,
  ) {
    // A machine finished a category's other language: tell the same rooms as any category change.
    this.translations.registerRepublisher('category', async () => {
      await this.pushAll();
    });
  }

  async list(): Promise<ServedCategory[]> {
    return this.present(await this.repo.find({ order: { sortOrder: 'ASC' } }));
  }

  /** Categories as served: both languages, how many listings use them, translation state. */
  async present(cats: Category[]): Promise<ServedCategory[]> {
    if (!cats.length) return [];
    const [texts, counts] = await Promise.all([
      this.translations.present('category', cats),
      this.products
        .createQueryBuilder('p')
        .select('p.categoryId', 'id')
        .addSelect('COUNT(*)', 'n')
        .addSelect("SUM(CASE WHEN p.status = 'live' THEN 1 ELSE 0 END)", 'live')
        .where("p.status <> 'removed' AND p.categoryId IN (:...ids)", { ids: cats.map((c) => c.id) })
        .groupBy('p.categoryId')
        .getRawMany<{ id: string; n: string; live: string }>(),
    ]);
    const by = new Map(counts.map((c) => [c.id, c]));
    return cats.map((c) => {
      const t = texts.get(c.id)!;
      const n = by.get(c.id);
      return Object.assign(Object.create(Object.getPrototypeOf(c)), c, {
        name: t.texts.name ?? c.name,
        nameFr: t.texts.nameFr ?? c.name,
        productCount: Number(n?.live ?? 0),
        usedBy: Number(n?.n ?? 0),
        machineTranslated: t.machineTranslated,
        translationStatus: t.translationStatus,
      }) as ServedCategory;
    });
  }

  /** Names of categories by id, in both languages (for products, flash sales…). */
  async names(ids: string[]): Promise<Map<string, { name: string; nameFr: string }>> {
    const out = new Map<string, { name: string; nameFr: string }>();
    const unique = [...new Set(ids.filter(Boolean))];
    if (!unique.length) return out;
    const cats = await this.repo.find({ where: { id: In(unique) } });
    const texts = await this.translations.present('category', cats);
    for (const c of cats) {
      const t = texts.get(c.id)!;
      out.set(c.id, { name: t.texts.name ?? c.name, nameFr: t.texts.nameFr ?? c.name });
    }
    return out;
  }

  /**
   * The id of the category a client means: `id`, else a name in either language (case- and accent-insensitive),
   * as older apps send the English name. Throws when it names no category, so a listing never points at nothing.
   */
  async resolveRef(ref: { id?: unknown; name?: unknown }): Promise<string> {
    const id = typeof ref.id === 'string' ? ref.id.trim() : '';
    if (id) {
      if (!(await this.repo.exist({ where: { id } }))) throw new Error('That category does not exist.');
      return id;
    }
    const name = typeof ref.name === 'string' ? fold(ref.name) : '';
    if (!name) throw new Error('Choose a category.');
    const all = await this.list();
    const hit = all.find((c) => fold(c.name) === name || fold(c.nameFr ?? '') === name);
    if (!hit) throw new Error('Choose a category from the list.');
    return hit.id;
  }

  private async pushAll(): Promise<ServedCategory[]> {
    const cats = await this.list();
    this.emitter.toRoles(['customer', 'guest', ...ADMIN_ROLES], 'categories:updated', cats);
    return cats;
  }

  /** icon / image / sortOrder, validated. */
  private static columns(data: Record<string, unknown>): Partial<Category> {
    const out: Partial<Category> = {};
    if (data?.icon !== undefined) out.icon = optStr(data.icon, 'Icon', 100);
    if (data?.image !== undefined) out.image = optStr(data.image, 'Image', 500);
    if (data?.sortOrder !== undefined) out.sortOrder = num(data.sortOrder, 'Sort order', { min: 0, max: 100000, int: true });
    return out;
  }

  /** `name` / `nameFr` as sent: undefined = untouched. */
  private static texts(data: Record<string, unknown>) {
    const text = (k: string, label: string) => (data?.[k] === undefined ? undefined : data[k] === null || data[k] === '' ? null : optStr(data[k], label, 100));
    return { name: { en: text('name', 'Name'), fr: text('nameFr', 'French name') } };
  }

  async create(data: Record<string, unknown>): Promise<ServedCategory> {
    const columns = CategoriesService.columns(data);
    const plan = planWrite({
      type: 'category',
      create: true,
      state: null,
      input: CategoriesService.texts(data),
      clientSourceLang: data?.sourceLang,
      missingTitle: 'Enter a category name in English or French.',
    });
    const saved = await this.repo.manager.transaction(async (m) => {
      const row = await m.save(m.create(Category, { ...columns, name: plan.base.name ?? '', sourceLang: plan.sourceLang }));
      await this.translations.applyPlan(m, 'category', row.id, plan, { name: row.name });
      return row;
    });
    await this.translations.enqueue('category', saved.id);
    const all = await this.pushAll();
    return all.find((c) => c.id === saved.id)!;
  }

  async update(id: string, patch: Record<string, unknown>): Promise<ServedCategory | null> {
    const existing = await this.repo.findOne({ where: { id } });
    if (!existing) return null;
    const columns = CategoriesService.columns(patch);
    const input = CategoriesService.texts(patch);
    const touchesText = input.name.en !== undefined || input.name.fr !== undefined;
    let plan: WritePlan | null = null;
    if (touchesText) {
      const rows = (await this.translations.rowsFor('category', [id])).get(id) ?? [];
      const state: WriteState = {
        sourceLang: isLocale(existing.sourceLang) ? existing.sourceLang : 'en',
        base: { name: existing.name },
        authors: { name: Object.fromEntries(rows.filter((r) => r.origin === 'author' && r.field === 'name').map((r) => [r.locale, r.value])) },
      };
      plan = planWrite({ type: 'category', create: false, state, input, missingTitle: 'Enter a category name in English or French.' });
    }
    await this.repo.manager.transaction(async (m) => {
      const set: Partial<Category> = { ...columns };
      if (plan) {
        if (plan.base.name !== undefined && plan.base.name !== null) set.name = plan.base.name;
        set.sourceLang = plan.sourceLang;
      }
      if (Object.keys(set).length) await m.update(Category, { id }, set);
      if (plan) await this.translations.applyPlan(m, 'category', id, plan, { name: set.name ?? existing.name });
    });
    // C-I3: products point at categoryId, so a rename moves nothing. Only the text may need a machine.
    if (plan?.touched || plan?.flipped) await this.translations.enqueue('category', id);
    const all = await this.pushAll();
    return all.find((c) => c.id === id) ?? null;
  }

  async remove(id: string): Promise<void> {
    const refuse = (n: number) => new Error(categoryInUseMessage(n));
    try {
      await this.repo.manager.transaction(async (m) => {
        // C-I2: a category in use cannot be deleted (the foreign key says the same at the database).
        const used = await m.count(Product, { where: { categoryId: id, status: Not('removed') } });
        if (used) throw refuse(used);
        // Soft-removed listings are hidden for good: let go of the category so it can be deleted.
        await m.update(Product, { categoryId: id }, { categoryId: null });
        await m.delete(Category, { id });
      });
    } catch (e) {
      if (e instanceof QueryFailedError && /foreign key/i.test(e.message)) throw refuse(await this.products.count({ where: { categoryId: id } }));
      throw e;
    }
    await this.translations.forget('category', id);
    await this.pushAll();
  }
}
