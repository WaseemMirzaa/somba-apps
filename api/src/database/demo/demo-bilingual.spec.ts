import { readFileSync } from 'fs';
import { join } from 'path';
import { frenchNotice, localizeWalletDescription } from '../../notifications/localize';
import { shouldTranslate } from '../../translation/never-translate';
import { DEMO_PRODUCTS, DEMO_STORES } from './demo-catalog';
import { frenchBody } from './demo-bilingual';
import { DEMO_NOTICES } from './demo-notices.fixture';
import { DEMO_TEXTS, VARIANT_FR, frOf, twinOf, variantsFr } from './demo-texts';

/**
 * "Nothing untranslated" for the demo data: every record the demo seed writes exists in both languages, and every notice
 * it produces has French. A developer who adds a demo text, product or flow without its twin breaks this file.
 */

const FR_CUE = /[àâçéèêëîïôùûü’«»]|\b(le|la|les|un|une|des|du|de|et|est|pour|vous|votre|avec|sur|pas|dans|je|ce|cette|que|qui|merci|bonjour|oui)\b/i;
/** Words and letters that only French has: none may appear in the English side. */
const FR_ONLY = /[àâçéèêëîïôùûü]|\b(le|la|les|des|du|est|pour|vous|votre|avec|dans|je|merci|bonjour)\b/i;

describe('demo catalogue: product, store and option texts in both languages', () => {
  it('has a name and a description in English and in French for every listing', () => {
    for (const p of DEMO_PRODUCTS) {
      expect(p.name.trim()).not.toBe('');
      expect(p.nameFr.trim()).not.toBe('');
      expect(p.description.trim()).not.toBe('');
      expect(p.descriptionFr.trim()).not.toBe('');
      // The description is always real French, not the English copied over.
      expect(p.descriptionFr).not.toBe(p.description);
      expect(FR_CUE.test(p.descriptionFr)).toBe(true);
    }
  });

  it('writes a French name that differs from the English one, except for model names that are the same word in both', () => {
    const same = DEMO_PRODUCTS.filter((p) => p.nameFr === p.name).map((p) => p.name);
    // "Smartphone A15": "smartphone" is French too and A15 is a model code.
    expect(same).toEqual(['Smartphone A15']);
  });

  it('names a French twin for every option label (size codes and numbers excepted)', () => {
    const missing = new Set<string>();
    for (const p of DEMO_PRODUCTS)
      for (const g of p.variants ?? []) {
        for (const label of [g.name, ...g.options]) if (shouldTranslate(label) && !VARIANT_FR[label]) missing.add(label);
        const fr = variantsFr([g])[0];
        expect(fr.options).toHaveLength(g.options.length);
      }
    expect([...missing]).toEqual([]);
  });

  it('has a description in both languages for every store that has one', () => {
    for (const s of DEMO_STORES) {
      expect(!!s.description).toBe(!!s.descriptionFr);
      if (s.description) expect(s.descriptionFr).not.toBe(s.description);
    }
  });
});

describe('demo text table (demo-texts.ts)', () => {
  it('has real French and real English for every entry', () => {
    const bad: string[] = [];
    for (const d of DEMO_TEXTS) {
      if (d.en === d.fr) bad.push(`same in both: ${d.en}`);
      if (d.fr.split(' ').length >= 4 && !FR_CUE.test(d.fr) && !/^Offre flash/.test(d.fr)) bad.push(`French side does not look French: ${d.fr}`);
      if (FR_ONLY.test(d.en)) bad.push(`English side does not look English: ${d.en}`);
    }
    expect(bad).toEqual([]);
  });

  it('holds each text once', () => {
    const seen = new Set<string>();
    const dup: string[] = [];
    for (const d of DEMO_TEXTS) {
      for (const k of [d.en, d.fr]) {
        if (seen.has(k)) dup.push(k);
        seen.add(k);
      }
    }
    expect(dup).toEqual([]);
  });

  it('finds the twin from either language', () => {
    expect(twinOf('Can I use only one earbud at a time?')?.fr).toBe('Puis-je utiliser un seul écouteur à la fois ?');
    expect(twinOf('Puis-je utiliser un seul écouteur à la fois ?')?.en).toBe('Can I use only one earbud at a time?');
    expect(twinOf('something nobody wrote')).toBeUndefined();
    expect(() => frOf('something nobody wrote')).toThrow(/no French/);
  });
});

/** Files whose human-readable literals are shown to people (reviews, questions, chat, returns, notes, banners...). */
const SEEDED_TEXT_FILES = ['demo-engagement.ts', 'demo-commerce.ts', 'demo-orders.ts', 'demo-admin.ts'];

/** Longer literals in those files that are not seeded person text. */
const NOT_SEEDED_TEXT: RegExp[] = [
  /^(SELECT|UPDATE|INSERT|DELETE)\b/, // SQL
  /^Welcome credit from KOMORIKO \(demo\)$/, // a wallet line: localizeWalletDescription
  /^Demo: cold shelf$/, // a bin code
  /^Demo (Warehouse|Support|Rider)/, // account names
  /address is pinned in the store/, // a code comment inside a template, not data
];

function literals(file: string): { line: number; text: string }[] {
  const src = readFileSync(join(__dirname, file), 'utf8').split('\n');
  const out: { line: number; text: string }[] = [];
  const re = /'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\$]|\\.|\$(?!\{))*)`/g;
  src.forEach((line, i) => {
    const t = line.trim();
    if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*') || t.startsWith('import')) return;
    for (const m of line.matchAll(re)) {
      const text = (m[1] ?? m[2] ?? m[3]).replace(/\\(.)/g, '$1');
      // Four words or more: names, addresses, codes and keys are not sentences.
      if (/^[✓•!✅]/.test(text) || /^\d/.test(text) || text.startsWith('République')) continue; // log lines, addresses
      if (text.split(/\s+/).filter((w) => /[A-Za-zÀ-ÿ]{2,}/.test(w)).length >= 4) out.push({ line: i + 1, text });
    }
  });
  return out;
}

describe('demo scenarios: every sentence a demo account writes has its twin', () => {
  it('finds the seeded texts (a scanner that reads nothing would pass)', () => {
    const all = SEEDED_TEXT_FILES.flatMap((f) => literals(f));
    expect(all.length).toBeGreaterThan(60);
  });

  it.each(SEEDED_TEXT_FILES)('%s: no sentence without an entry in demo-texts.ts', (file) => {
    const missing = literals(file)
      .filter((l) => !NOT_SEEDED_TEXT.some((re) => re.test(l.text)))
      .filter((l) => !twinOf(l.text))
      .map((l) => `${file}:${l.line}  ${l.text.slice(0, 80)}`);
    expect(missing).toEqual([]);
  });

  it('keeps no entry that no scenario writes (every twin is used by a demo file)', () => {
    const src = [...SEEDED_TEXT_FILES, '../seed-demo.ts'].map((f) => readFileSync(join(__dirname, f), 'utf8')).join('\n');
    const unused = DEMO_TEXTS.filter((d) => !src.includes(d.en.replace(/'/g, "\\'")) && !src.includes(d.en) && !src.includes(d.fr) && !src.includes(d.fr.replace(/'/g, "\\'")));
    expect(unused.map((d) => d.en)).toEqual([]);
  });
});

describe('demo notices: French for every kind the seed produces', () => {
  const english = /\b(the|is|was|were|your|you|to|and|for|of|with|please|has|have|will|not|cannot|are|we|our|it|this|that|can|could)\b/i;
  const names = DEMO_PRODUCTS.filter((p) => p.nameFr !== p.name).map((p): [string, string] => [p.name, p.nameFr]);
  const quoted = DEMO_TEXTS.filter((d) => d.src === 'en');

  it('covers many kinds (a fixture that is empty would pass)', () => {
    expect(DEMO_NOTICES.length).toBeGreaterThan(100);
  });

  it.each(DEMO_NOTICES)('%s: %s', (title, body) => {
    const built = frenchNotice({ title, body });
    // What the seed authors on top: the quote and the product names in French.
    const finalBody = frenchBody({ title, body }, quoted, names) ?? built?.body ?? body;
    expect(built?.title).toBeDefined();
    expect(built?.title).not.toBe(title);
    expect(finalBody).not.toMatch(english);
  });
});

describe('frenchBody: the notice body a French reader gets', () => {
  const quoted = DEMO_TEXTS.filter((d) => d.src === 'en');
  const names: [string, string][] = [['Wax Print Maxi Dress', 'Robe longue en pagne wax']];

  it('puts the quote and the product name in French', () => {
    const out = frenchBody({ title: 'New product question', body: 'Wax Print Maxi Dress: Do you have these in size 45?' }, quoted, names);
    expect(out).toBe('Robe longue en pagne wax: Les avez-vous en pointure 45 ?');
  });

  it('matches a quote the server cut, and cuts the French the same length', () => {
    const full = 'Beautiful dress, the fabric is thick and the colours did not fade after washing. It fits as described. Delivered on time.';
    const cut = full.slice(0, 100);
    const out = frenchBody({ title: 'New review on your product', body: `Wax Print Maxi Dress: 5★ ${cut}` }, quoted, names)!;
    expect(out.startsWith('Robe longue en pagne wax: 5★ Belle robe, le tissu est épais')).toBe(true);
    expect(out.length).toBe(`Robe longue en pagne wax: 5★ `.length + 100);
  });

  it('translates only whole product names', () => {
    const out = frenchBody({ title: 'Low stock', body: 'Wax Print Maxi Dresses is down to 3 (alert at 5). Restock soon.' }, quoted, names);
    expect(out ?? '').not.toContain('Robe longue');
  });

  it('returns null when there is nothing the table or the catalogue knows', () => {
    expect(frenchBody({ title: 'Order placed', body: 'We received SOM-1. You\'ll get updates here in real time.' }, quoted, names)).toBeNull();
  });
});

describe('demo wallet lines', () => {
  it.each(['Welcome credit from KOMORIKO (demo)', 'Demo starter credit (not real money)', 'Wallet top-up via Airtel Money'])('%s has French', (line) => {
    expect(localizeWalletDescription(line, 'fr')).not.toBe(line);
  });
});
