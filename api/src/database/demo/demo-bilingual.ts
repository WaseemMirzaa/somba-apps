import { Like } from 'typeorm';
import {
  Campaign,
  CmsBlock,
  CaseSellerMessage,
  ConversationMessage,
  Dispute,
  DisputeMessage,
  Exchange,
  FlashSale,
  Notification,
  Product,
  ProductQuestion,
  Replacement,
  Review,
  Seller,
  Translation,
} from '../entities';
import type { TranslationEntityType } from '../entities';
import { frenchNotice } from '../../notifications/localize';
import { sourceHash } from '../../translation/translatable';
import { storedVariantGroups } from '../../common/variants/variants';
import { DEMO_PRODUCTS, DEMO_STORES } from './demo-catalog';
import { DEMO_KEY, isDemoEmail, log } from './demo-common';
import { DEMO_TEXTS, twinOf, variantsFr } from './demo-texts';
import type { DemoLang, DemoText } from './demo-texts';
import type { DemoCtx } from './demo-ctx';

/**
 * Every demo record in BOTH languages. Runs last in `seed-demo.ts`, after the services wrote each record in the language
 * its (demo) author used, and adds the other language as an AUTHOR row in `translations`:
 *
 *  - products (title, description, option labels), stores (description, policies), banners, campaigns and flash sales
 *    from the catalogue / the twin table, matched by the text the demo wrote;
 *  - reviews, store replies, questions, answers and chat messages as `review` / `review_reply` / `question` / `answer` /
 *    `chat_message` rows (field `text` or `reply`; the question id keys both a question and its answer);
 *  - the French of the notices that quote a person's words (a review, a question, a return reason...): authored rows on
 *    the notification, which the list and the push already prefer to the built-in patterns.
 *
 * ADDITIVE and IDEMPOTENT: a row is only inserted when none exists for that record, field and language, so text a person
 * edited, a row a person translated or one Google produced is never replaced, and a second run adds nothing. This is also
 * what brings French to a server seeded before it existed (the products "were already there", so the seed skipped them).
 * Author rows cost nothing and show with or without a translation key on the server.
 */
export async function seedBilingual(ctx: DemoCtx): Promise<void> {
  const rows = ctx.ds.getRepository(Translation);
  let added = 0;

  /** Insert one author row unless a row (of anyone) already holds that language of that field. */
  const put = async (
    type: TranslationEntityType,
    id: string,
    field: string,
    locale: DemoLang,
    value: string,
    from: DemoLang | null,
    base: string | null,
  ): Promise<void> => {
    if (!value.trim()) return;
    const have = await rows.count({ where: { entityType: type, entityId: id, field, locale } });
    if (have) return;
    await rows.insert(
      rows.create({
        entityType: type,
        entityId: id,
        field,
        locale,
        value,
        origin: 'author',
        sourceLang: from,
        sourceHash: from && base ? sourceHash(from, base) : null,
      }),
    );
    added++;
  };

  // ── Products: title, description, option labels (the demo writes English; the French comes from the catalogue) ──
  const repoP = ctx.ds.getRepository(Product);
  for (const p of DEMO_PRODUCTS) {
    const store = ctx.stores.get(p.store);
    if (!store) continue;
    const prod = await repoP.findOne({ where: { sellerId: store.id, sku: p.sku } });
    if (!prod || prod.sourceLang !== 'en') continue;
    if (prod.name === p.name && p.nameFr !== p.name) await put('product', prod.id, 'name', 'fr', p.nameFr, 'en', prod.name);
    if (prod.description === p.description) await put('product', prod.id, 'description', 'fr', p.descriptionFr, 'en', prod.description);
    const groups = storedVariantGroups(prod.variants);
    if (groups.length) {
      const fr = variantsFr(groups);
      if (JSON.stringify(fr) !== JSON.stringify(groups)) await put('product', prod.id, 'variants', 'fr', JSON.stringify(fr), 'en', JSON.stringify(groups));
    }
  }

  // ── Stores: description and the policies ──
  const sellerRepo = ctx.ds.getRepository(Seller);
  for (const s of DEMO_STORES) {
    const store = ctx.stores.get(s.key);
    if (!store) continue;
    const seller = await sellerRepo.findOne({ where: { id: store.id } });
    if (!seller || seller.sourceLang !== 'en') continue;
    if (seller.description === s.description) await put('seller', seller.id, 'description', 'fr', s.descriptionFr, 'en', seller.description);
    for (const field of ['returnsPolicy', 'shippingPolicy'] as const) {
      const base = seller[field];
      const twin = twinOf(base);
      if (base && twin && twin.src === 'en') await put('seller', seller.id, field, 'fr', twin.fr, 'en', base);
    }
  }

  // ── Banners, campaigns, flash sales ──
  for (const b of await ctx.ds.getRepository(CmsBlock).find({ where: { key: Like(`${DEMO_KEY}%`) } })) {
    if (b.sourceLang !== 'en') continue;
    for (const field of ['title', 'body'] as const) {
      const twin = twinOf(b[field]);
      if (twin && b[field]) await put('cms_block', b.id, field, 'fr', twin.fr, 'en', b[field]);
    }
  }
  const ownerIds = [...ctx.stores.values()].map((s) => s.id);
  for (const c of await ctx.ds.getRepository(Campaign).find()) {
    const twin = twinOf(c.name);
    if (twin && c.sourceLang === 'en' && !!c.sellerId && ownerIds.includes(c.sellerId)) await put('campaign', c.id, 'name', 'fr', twin.fr, 'en', c.name);
  }
  for (const f of await ctx.ds.getRepository(FlashSale).find()) {
    const twin = twinOf(f.title);
    if (twin && f.sourceLang === 'en') await put('flash_sale', f.id, 'title', 'fr', twin.fr, 'en', f.title);
  }

  // ── Written by people: the other language of each review, reply, question, answer and chat message ──
  const twinRow = async (type: TranslationEntityType, id: string, field: string, stored: string | null | undefined) => {
    const twin = twinOf(stored);
    if (!stored || !twin) return;
    // The stored text is in whichever language it was written in; the twin is the other one.
    const from: DemoLang = stored.trim() === twin.en.trim() ? 'en' : 'fr';
    const to: DemoLang = from === 'en' ? 'fr' : 'en';
    await put(type, id, field, to, twin[to], from, stored.trim());
  };
  for (const r of await ctx.ds.getRepository(Review).find()) {
    await twinRow('review', r.id, 'text', r.text);
    await twinRow('review_reply', r.id, 'reply', r.sellerReply);
  }
  for (const q of await ctx.ds.getRepository(ProductQuestion).find()) {
    await twinRow('question', q.id, 'text', q.question);
    await twinRow('answer', q.id, 'text', q.answer);
  }
  for (const m of await ctx.ds.getRepository(ConversationMessage).find()) await twinRow('chat_message', m.id, 'text', m.text);
  // What customers wrote on a return, an exchange or a replacement, the messages beside them and the private seller <-> support
  // thread (docs/contracts/admin-controls.md §13): the other language as an author row, so both panes read in either language.
  for (const d of await ctx.ds.getRepository(Dispute).find()) await twinRow('dispute_reason', d.id, 'reason', d.reason);
  for (const e of await ctx.ds.getRepository(Exchange).find()) await twinRow('exchange_reason', e.id, 'reason', e.reason);
  for (const r of await ctx.ds.getRepository(Replacement).find()) await twinRow('replacement_reason', r.id, 'reason', r.reason);
  for (const m of await ctx.ds.getRepository(DisputeMessage).find()) await twinRow('dispute_message', m.id, 'text', m.text);
  for (const m of await ctx.ds.getRepository(CaseSellerMessage).find()) await twinRow('case_seller_message', m.id, 'text', m.text);

  // ── Notices that quote a person's words or name a product: the French body with those in French ──
  const notices = await ctx.ds.getRepository(Notification).find();
  const bodyFr = new Map(
    (await rows.find({ where: { entityType: 'notification', field: 'body', locale: 'fr' } })).map((r) => [r.entityId, r]),
  );
  const quoted = DEMO_TEXTS.filter((d) => d.src === 'en');
  const names = DEMO_PRODUCTS.filter((p) => p.nameFr !== p.name).map((p): [string, string] => [p.name, p.nameFr]);
  for (const n of notices) {
    const have = bodyFr.get(n.id);
    // French somebody wrote stays. A "French" body identical to the English one is a copy (the chat notices store the
    // message as both languages), not a translation: that one is replaced.
    if (have && have.value !== n.body) continue;
    const fr = frenchBody(n, quoted, names);
    if (!fr) continue;
    if (have) {
      await rows.update({ id: have.id }, { value: fr });
      added++;
    } else await put('notification', n.id, 'body', 'fr', fr, null, null);
  }

  // Anything a demo account wrote that the table does not know stays one language: say so (a developer adds the twin).
  const missing = await untwinned(ctx);
  log(
    `✓ both languages: ${added} author row(s) added${missing.length ? '' : ', every demo text has its twin'}`,
  );
  for (const m of missing) log(`! no twin in demo-texts.ts for ${m}`);
}

/**
 * The French body of a notice that carries an English quote or a product name: the built-in translation of the sentence
 * around it, with the quote replaced by its French twin and each product name by its French name. The server cuts a quote
 * to 60 to 140 characters, so a cut quote is matched by its start and the French is cut the same length. Null when the
 * notice has nothing the table or the catalogue knows.
 */
export function frenchBody(
  n: Pick<Notification, 'title' | 'body'>,
  texts: DemoText[],
  names: [en: string, fr: string][] = [],
): string | null {
  const base = frenchNotice({ title: n.title, body: n.body })?.body ?? n.body;
  let out = base;
  for (const d of texts) {
    const en = d.en.trim();
    const at = out.indexOf(en.slice(0, 25));
    if (at < 0) continue;
    const tail = out.slice(at);
    if (!en.startsWith(tail) && !tail.startsWith(en)) continue;
    out = out.slice(0, at) + (tail.length >= en.length ? d.fr : d.fr.slice(0, tail.length));
    break;
  }
  // Longest names first, so "Steel Water Bottle 750 ml" is not cut short by a shorter name inside it.
  for (const [en, fr] of [...names].sort((a, b) => b[0].length - a[0].length)) {
    out = out.replace(new RegExp(`(?<![\\p{L}\\p{N}])${en.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}])`, 'gu'), fr);
  }
  return out !== base ? out : null;
}

/** Texts written by demo accounts (reviews, replies, questions, answers, chat messages) that the twin table does not hold. */
async function untwinned(ctx: DemoCtx): Promise<string[]> {
  const demoIds = new Set([...ctx.users.values()].filter((u) => isDemoEmail(u.email)).map((u) => u.id));
  const out: string[] = [];
  const miss = (kind: string, text: string | null | undefined) => {
    if (text && !twinOf(text)) out.push(`${kind}: "${text.slice(0, 70)}"`);
  };
  for (const r of await ctx.ds.getRepository(Review).find()) {
    if (!demoIds.has(r.userId)) continue;
    miss('review', r.text);
    miss('review reply', r.sellerReply);
  }
  for (const q of await ctx.ds.getRepository(ProductQuestion).find()) {
    if (!q.askerId || !demoIds.has(q.askerId)) continue;
    miss('question', q.question);
    miss('answer', q.answer);
  }
  for (const m of await ctx.ds.getRepository(ConversationMessage).find()) {
    if (m.senderId && demoIds.has(m.senderId)) miss('chat message', m.text);
  }
  for (const m of await ctx.ds.getRepository(CaseSellerMessage).find()) {
    if (m.authorId && demoIds.has(m.authorId)) miss('seller thread message', m.text);
  }
  return out;
}
