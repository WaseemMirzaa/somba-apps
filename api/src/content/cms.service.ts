import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CmsBlock } from '../database/entities';
import { oneOf, str } from '../common/validate';
import { RealtimeEmitter } from '../realtime/realtime-emitter';
import { ADMIN_ROLES } from '../notifications/notifications.service';
import { TranslationService } from '../translation/translation.service';
import type { TranslationStatus } from '../translation/translation.service';
import { planWrite } from '../translation/translatable';
import type { WriteState } from '../translation/translatable';
import { isLocale } from '../translation/translator.provider';

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
      if (block) this.emitter.toRoles(['customer', ...ADMIN_ROLES], 'cms:updated', (await this.present([block]))[0]);
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

  /** Shoppers only see active blocks; admins see drafts too. */
  async list(admin = false): Promise<ServedCmsBlock[]> {
    return this.present(admin ? await this.blocks.find() : await this.blocks.find({ where: { active: true } }));
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
    this.emitter.toRoles(['customer', ...ADMIN_ROLES], 'cms:updated', block);
    return block;
  }
}
