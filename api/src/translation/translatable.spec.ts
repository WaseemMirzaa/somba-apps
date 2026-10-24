import { MissingTitleError, composeText, composeVariants, planWork, planWrite, sameShape, sourceHash } from './translatable';
import type { RowLite, WriteState } from './translatable';

const row = (field: string, locale: string, value: string, origin: RowLite['origin'], sourceLang: string | null, source?: string): RowLite => ({
  field,
  locale,
  value,
  origin,
  sourceLang,
  sourceHash: sourceLang && source !== undefined ? sourceHash(sourceLang, source) : null,
});

describe('planWrite: source language (create)', () => {
  const create = (input: Record<string, { en?: string | null; fr?: string | null }>, clientSourceLang?: unknown) =>
    planWrite({ type: 'product', create: true, state: null, input, clientSourceLang });

  it('only the English title: sourceLang en', () => {
    const p = create({ name: { en: 'Phone' } });
    expect(p).toMatchObject({ sourceLang: 'en', base: { name: 'Phone' }, authors: [] });
  });

  it('only the French title: sourceLang fr, and the base column holds the French', () => {
    const p = create({ name: { fr: 'Téléphone' } });
    expect(p).toMatchObject({ sourceLang: 'fr', base: { name: 'Téléphone' }, authors: [] });
  });

  it('both: the client\'s sourceLang, else en; the other language is an author row', () => {
    expect(create({ name: { en: 'Phone', fr: 'Téléphone' } })).toMatchObject({ sourceLang: 'en', base: { name: 'Phone' }, authors: [{ field: 'name', locale: 'fr', value: 'Téléphone' }] });
    expect(create({ name: { en: 'Phone', fr: 'Téléphone' } }, 'fr')).toMatchObject({ sourceLang: 'fr', base: { name: 'Téléphone' }, authors: [{ field: 'name', locale: 'en', value: 'Phone' }] });
    expect(create({ name: { en: 'Phone', fr: 'Téléphone' } }, 'de')).toMatchObject({ sourceLang: 'en' });
  });

  it('C-I1: a title is needed in at least one language', () => {
    expect(() => create({ name: {} })).toThrow(MissingTitleError);
    expect(() => create({ name: { en: '  ', fr: null } })).toThrow('Enter a title in English or French.');
    expect(() => create({ description: { en: 'only a description' } })).toThrow(MissingTitleError);
  });

  it('descriptions follow the product\'s source language; the other one is an author row', () => {
    const p = create({ name: { fr: 'Téléphone' }, description: { fr: 'Léger.', en: 'Light.' } });
    expect(p.sourceLang).toBe('fr');
    expect(p.base).toEqual({ name: 'Téléphone', description: 'Léger.' });
    expect(p.authors).toEqual([{ field: 'description', locale: 'en', value: 'Light.' }]);
  });

  it('a description typed only in the other language stays an author row; the source column stays empty', () => {
    const p = create({ name: { en: 'Phone' }, description: { fr: 'Léger.' } });
    expect(p.base).toEqual({ name: 'Phone' });
    expect(p.authors).toEqual([{ field: 'description', locale: 'fr', value: 'Léger.' }]);
  });

  it('refuses text longer than the field allows', () => {
    expect(() => create({ name: { en: 'x'.repeat(201) } })).toThrow('Product title must be at most 200 characters.');
  });
});

describe('planWrite: edits', () => {
  const state = (over: Partial<WriteState> = {}): WriteState => ({ sourceLang: 'en', base: { name: 'Phone', description: 'Light.' }, authors: {}, ...over });
  const update = (input: Record<string, { en?: string | null; fr?: string | null }>, s = state()) => planWrite({ type: 'product', create: false, state: s, input });

  it('English text edits the base column; French text is an author row (the machine never overwrites it)', () => {
    expect(update({ name: { en: 'Phone 2' }, description: { fr: 'Légère.' } })).toMatchObject({
      sourceLang: 'en',
      base: { name: 'Phone 2' },
      authors: [{ field: 'description', locale: 'fr', value: 'Légère.' }],
      touched: true,
      flipped: false,
    });
  });

  it('a field not sent is left alone', () => {
    const p = update({ description: { en: 'New.' } });
    expect(p.base).toEqual({ description: 'New.' });
    expect(p.authors).toEqual([]);
  });

  it('clearing a translated field deletes its row (a machine fills it again)', () => {
    expect(update({ name: { fr: '' } }).deletes).toEqual([{ field: 'name', locale: 'fr' }]);
    expect(update({ description: { fr: null } }).deletes).toEqual([{ field: 'description', locale: 'fr' }]);
  });

  it('clearing the source description empties the base column', () => {
    expect(update({ description: { en: '' } }).base).toEqual({ description: null });
  });

  it('C-I1: the title cannot be cleared when the other language has none', () => {
    expect(() => update({ name: { en: '' } })).toThrow(MissingTitleError);
  });

  it('clearing the source title moves the source to the other language, swapping every field', () => {
    const s = state({ base: { name: 'Phone', description: 'Light.' }, authors: { name: { fr: 'Téléphone' }, description: { fr: 'Légère.' } } });
    const p = update({ name: { en: '' } }, s);
    expect(p.flipped).toBe(true);
    expect(p.sourceLang).toBe('fr');
    expect(p.base).toMatchObject({ name: 'Téléphone', description: 'Légère.' });
    // the old English text was typed by a person: it becomes an author row, nothing is lost
    expect(p.authors).toContainEqual({ field: 'description', locale: 'en', value: 'Light.' });
    expect(p.deletes).toContainEqual({ field: 'name', locale: 'fr' });
  });

  it('a French-source product can take an English edit as an author row', () => {
    const s = state({ sourceLang: 'fr', base: { name: 'Téléphone' } });
    expect(update({ name: { en: 'Phone' } }, s)).toMatchObject({ sourceLang: 'fr', base: {}, authors: [{ field: 'name', locale: 'en', value: 'Phone' }] });
  });
});

describe('composeText', () => {
  const n = 'Wireless Earbuds';

  it('English source: name is the source, nameFr the French row, else the source', () => {
    expect(composeText('en', n, [row('name', 'fr', 'Écouteurs', 'author', 'en', n)])).toMatchObject({ en: n, fr: 'Écouteurs', missing: false });
    expect(composeText('en', n, [])).toMatchObject({ en: n, fr: n, missing: true });
  });

  it('French source: nameFr is the source, name the English row, else the source', () => {
    expect(composeText('fr', 'Chaussures', [row('name', 'en', 'Shoes', 'machine', 'fr', 'Chaussures')])).toMatchObject({ en: 'Shoes', fr: 'Chaussures', machine: { en: true, fr: false } });
    expect(composeText('fr', 'Chaussures', [])).toMatchObject({ en: 'Chaussures', fr: 'Chaussures', missing: true });
  });

  it('marks machine rows, not author rows or the source', () => {
    const c = composeText('en', n, [row('name', 'fr', 'Écouteurs sans fil', 'machine', 'en', n)]);
    expect(c.machine).toEqual({ en: false, fr: true });
    expect(composeText('en', n, [row('name', 'fr', 'Mes écouteurs', 'author', 'en', n)]).machine).toEqual({ en: false, fr: false });
  });

  it('a stale machine row (its source changed) is not served; the source is, and a machine is wanted', () => {
    const old = row('name', 'fr', 'Ancien', 'machine', 'en', 'Old title');
    expect(composeText('en', n, [old])).toMatchObject({ fr: n, missing: true, machine: { fr: false } });
  });

  it('an author row is served even when its source moved on', () => {
    expect(composeText('en', n, [row('name', 'fr', 'Ancien', 'author', 'en', 'Old title')]).fr).toBe('Ancien');
  });

  it('null when there is no description, and nothing is missing', () => {
    expect(composeText('en', null, [])).toEqual({ en: null, fr: null, machine: { en: false, fr: false }, missing: false });
    expect(composeText('en', '  ', [])).toMatchObject({ en: null, fr: null });
  });

  it('text a machine would not translate (sizes, codes) needs no row', () => {
    expect(composeText('en', 'XL', [])).toMatchObject({ en: 'XL', fr: 'XL', missing: false });
  });

  it('a description typed only in French: English comes from the French author text, machine-made', () => {
    const author = row('description', 'fr', 'Légère.', 'author', 'en', '');
    expect(composeText('en', null, [author])).toMatchObject({ en: 'Légère.', fr: 'Légère.', missing: true });
    const made = row('description', 'en', 'Light.', 'machine', 'fr', 'Légère.');
    expect(composeText('en', null, [author, made])).toMatchObject({ en: 'Light.', fr: 'Légère.', machine: { en: true, fr: false }, missing: false });
  });
});

describe('composeVariants (C-I4)', () => {
  const canonical = JSON.stringify([{ name: 'Colour', options: ['Black', 'White'] }]);
  const good = JSON.stringify([{ name: 'Couleur', options: ['Noir', 'Blanc'] }]);

  it('serves the French labels index-aligned with the canonical options', () => {
    const v = composeVariants('en', canonical, [row('variants', 'fr', good, 'machine', 'en', JSON.stringify(JSON.parse(canonical)))]);
    expect(v.fr).toEqual([{ name: 'Couleur', options: ['Noir', 'Blanc'] }]);
    expect(v.en).toEqual([{ name: 'Colour', options: ['Black', 'White'] }]);
    expect(v.machine).toEqual({ en: false, fr: true });
    expect(v.missing).toBe(false);
  });

  it('ignores a row whose shape does not match the canonical options and falls back to them', () => {
    const wrong = JSON.stringify([{ name: 'Couleur', options: ['Noir'] }]);
    const v = composeVariants('en', canonical, [row('variants', 'fr', wrong, 'author', 'en', canonical)]);
    expect(v.fr).toEqual(JSON.parse(canonical));
    expect(v.missing).toBe(true);
  });

  it('ignores broken JSON and a stale machine row', () => {
    expect(composeVariants('en', canonical, [row('variants', 'fr', '{oops', 'author', 'en')]).fr).toEqual(JSON.parse(canonical));
    expect(composeVariants('en', canonical, [row('variants', 'fr', good, 'machine', 'en', 'different')]).missing).toBe(true);
  });

  it('a product without options has empty labels and nothing missing', () => {
    expect(composeVariants('en', null, [])).toMatchObject({ en: [], fr: [], missing: false });
  });

  it('options with no language (sizes) need no row', () => {
    expect(composeVariants('en', JSON.stringify([{ name: '', options: ['S'] }].map(() => ({ name: '42', options: ['XL', 'M'] }))), []).missing).toBe(false);
  });

  it('sameShape compares group and option counts', () => {
    const base = [{ name: 'A', options: ['1', '2'] }];
    expect(sameShape(base, [{ name: 'B', options: ['x', 'y'] }])).toBe(true);
    expect(sameShape(base, [{ name: 'B', options: ['x'] }])).toBe(false);
    expect(sameShape(base, [])).toBe(false);
    expect(sameShape(base, 'nope')).toBe(false);
  });
});

describe('planWork (what a machine still has to do)', () => {
  const product = (over: Record<string, unknown> = {}) => ({ sourceLang: 'en', name: 'Wireless Earbuds', description: 'Noise reduction.', variants: null, ...over });

  it('asks for the other language of every text that carries language', () => {
    const { items } = planWork('product', product(), []);
    expect(items.map((i) => [i.field, i.from, i.to])).toEqual([['name', 'en', 'fr'], ['description', 'en', 'fr']]);
    expect(items[0].hash).toBe(sourceHash('en', 'Wireless Earbuds'));
  });

  it('never touches an author row (C-I6) and skips a current machine row', () => {
    const rows = [row('name', 'fr', 'À moi', 'author', 'en', 'Wireless Earbuds'), row('description', 'fr', 'Réduction.', 'machine', 'en', 'Noise reduction.')];
    expect(planWork('product', product(), rows).items).toEqual([]);
  });

  it('redoes a stale machine row', () => {
    const rows = [row('description', 'fr', 'Ancien', 'machine', 'en', 'Old text')];
    expect(planWork('product', product(), rows).items.map((i) => i.field)).toEqual(['name', 'description']);
  });

  it('a French-source product wants English', () => {
    const { items } = planWork('product', product({ sourceLang: 'fr', name: 'Chaussures de sport', description: null }), []);
    expect(items.map((i) => [i.field, i.from, i.to])).toEqual([['name', 'fr', 'en']]);
  });

  it('a description typed only in French is translated into the source language', () => {
    const { items } = planWork('product', product({ description: null }), [row('description', 'fr', 'Légère.', 'author', 'en')]);
    expect(items.find((i) => i.field === 'description')).toMatchObject({ from: 'fr', to: 'en', text: 'Légère.' });
  });

  it('skips sizes and codes, and asks to drop machine rows whose source is gone', () => {
    const rows = [row('description', 'fr', 'Vieux', 'machine', 'en', 'x')];
    const { items, obsolete } = planWork('product', product({ name: 'XL', description: null }), rows);
    expect(items).toEqual([]);
    expect(obsolete).toEqual([{ field: 'description', locale: 'fr' }]);
  });

  it('variants are one text; only names and options with language count', () => {
    const v = JSON.stringify([{ name: 'Colour', options: ['Black', 'XL'] }]);
    const { items } = planWork('product', product({ name: 'A1', description: null, variants: v }), []);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ field: 'variants', kind: 'variants', to: 'fr', chars: 'Colour'.length + 'Black'.length });
    expect(planWork('product', product({ name: 'A1', description: null, variants: JSON.stringify([{ name: '42', options: ['XL', 'M'] }]) }), []).items).toEqual([]);
  });
});
