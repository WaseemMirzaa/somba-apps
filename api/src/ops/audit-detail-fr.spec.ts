import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { auditDetailFr } from '../common/audit-detail-fr';
import { AuditLog } from '../database/entities';

/**
 * Guards "the audit log reads in the viewer's language": every English sentence the server writes into an audit `detail`
 * has a French version (`detailFr`), filled when the row is inserted. The scanner finds the wording of every `detail:` template
 * and every audit helper's detail argument in `api/src`; each fixed wording must be listed here with a realistic instance and its
 * French, so a new or reworded detail breaks the build until `common/audit-detail-fr.ts` follows.
 */

const NB = ' ';

/** The sentences (`${...}` shown as `{}`) with an instance and its French. A detail that is only data needs no entry. */
const CASES: Record<string, [sample: string, french: string][]> = {
  '{} (status set to cancelled)': [['SOM-1001 (status set to cancelled)', 'SOM-1001 (statut passé à annulée)']],
  '{} -> {}': [['SOM-1001 -> shipped', 'SOM-1001 -> expédiée'], ['SOM-1001 -> out_for_delivery', 'SOM-1001 -> en cours de livraison']],
  '{} ${} to {}': [
    ['SOM-1001 $12.50 to phone (pawaPay)', `SOM-1001 12,50${NB}$ vers le téléphone (pawaPay)`],
    ['SOM-1001 $12.50 to card (Stripe)', `SOM-1001 12,50${NB}$ vers la carte (Stripe)`],
    ['SOM-1001 $12.50 to wallet', `SOM-1001 12,50${NB}$ vers le portefeuille`],
  ],
  '{} ${} ref {}': [['PO-1 $40 ref ABC123', `PO-1 40${NB}$ réf. ABC123`], ['PO-1 $40 ref wallet', `PO-1 40${NB}$ réf. portefeuille`]],
  '{} ${} ref {} (batch)': [['PO-1 $40 ref ABC123 (batch)', `PO-1 40${NB}$ réf. ABC123 (lot)`]],
  '{} ${} via pawaPay {}': [['PO-1 $40 via pawaPay 1234', `PO-1 40${NB}$ via pawaPay 1234`]],
  '{} (was {})': [['Sneakers (was pending)', 'Sneakers (était : en attente)']],
  '{} · {} recipients · {}': [['all · 12 recipients · Sale', 'all · 12 destinataires · Sale']],
  'temporary password replaced': [['temporary password replaced', 'mot de passe temporaire remplacé']],
  'Opened the proof of delivery.': [['Opened the proof of delivery.', 'Preuve de livraison consultée.']],
  'A refresh token used at {} was presented again; every session of the account was signed out.': [
    ['A refresh token used at 2026-11-01T10:00:00.000Z was presented again; every session of the account was signed out.', 'Un jeton d’actualisation utilisé le 2026-11-01T10:00:00.000Z a été présenté de nouveau ; toutes les sessions du compte ont été fermées.'],
  ],
  'rider {}: {}': [['rider r1: created', 'livreur r1 : créé'], ['rider r1: vehicleType, plate', 'livreur r1 : vehicleType, plate']],
  '{} of rider {}{}': [['driver_licence of rider r1: blurry', 'driver_licence du livreur r1 : blurry'], ['ID of rider r1', 'ID du livreur r1']],
  '{}: wrong delivery code, try {} (rider {})': [['SOM-1: wrong delivery code, try 2 (rider r1)', 'SOM-1 : code de livraison erroné, essai 2 (livreur r1)']],
  '{}: delivery code unlocked by {} (was at {} wrong tries)': [
    ['SOM-1: delivery code unlocked by Awa (was at 5 wrong tries)', 'SOM-1 : code de livraison déverrouillé par Awa (en était à 5 essais erronés)'],
  ],
  '{}: delivery code locked after {} wrong tries (rider {}), {}': [
    ['SOM-1: delivery code locked after 5 wrong tries (rider r1), for 15 minutes', 'SOM-1 : code de livraison verrouillé après 5 essais erronés (livreur r1), pendant 15 minutes'],
    ['SOM-1: delivery code locked after 15 wrong tries (rider r1), until a supervisor unlocks it', 'SOM-1 : code de livraison verrouillé après 15 essais erronés (livreur r1), jusqu’à ce qu’un superviseur le déverrouille'],
  ],
  '{} {} -> {} return leg{}': [['SOM-1 delivery -> 1 return leg', 'SOM-1 livraison -> 1 étape de retour'], ['SOM-1 delivery -> 2 return legs', 'SOM-1 livraison -> 2 étapes de retour']],
  '{} {} -> {}': [['SOM-1 pickup -> Amadou', 'SOM-1 enlèvement -> Amadou']],
  '{}: {} marked {} by hand ({})': [['SOM-1: PKG-ABCD2345 marked pickup by hand (label torn)', 'SOM-1 : PKG-ABCD2345 marqué « enlèvement » à la main (label torn)']],
  '{} · {} parcel(s)': [['TR-1 · 3 parcel(s)', 'TR-1 · 3 colis']],
  '{} -> {} · {} parcel(s)': [['TR-1 -> TR-2 · 3 parcel(s)', 'TR-1 -> TR-2 · 3 colis']],
  '{} · {} missing': [['TR-1 · 2 missing', 'TR-1 · 2 manquants']],
  '{} area(s)': [['3 area(s)', '3 zones'], ['1 area(s)', '1 zone']],
  'Bin {}: {} line(s) counted, variance {}{}{}': [
    ['Bin A-01: 3 line(s) counted, variance +2 (recount)', 'Emplacement A-01 : 3 lignes comptées, écart +2 (recount)'],
    ['Bin A-01: 1 line(s) counted, variance -4', 'Emplacement A-01 : 1 ligne comptée, écart -4'],
  ],
  '{} · {} · {}': [
    ["EX-1 · SOM-1 · $5.00 refunded to the customer's wallet", `EX-1 · SOM-1 · 5,00${NB}$ remboursés sur le portefeuille du client`],
    ["EX-1 · SOM-1 · $5.00 refunded to the customer's wallet on delivery", `EX-1 · SOM-1 · 5,00${NB}$ remboursés sur le portefeuille du client à la livraison`],
    ['EX-1 · SOM-1 · price difference $5.00', `EX-1 · SOM-1 · différence de prix 5,00${NB}$`],
  ],
  '{} · order {}': [['Awa Diallo · order SOM-1', 'Awa Diallo · commande SOM-1']],
};

// ── Reading the sources ──────────────────────────────────────────────────

const SRC = join(__dirname, '..');
const files = (dir = SRC): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return e.name === 'migrations' ? [] : files(p);
    return p.endsWith('.ts') && !p.endsWith('.spec.ts') ? [p] : [];
  });

/** Index just past the quoted string or template literal that starts at `i`. */
function skipLiteral(src: string, i: number): number {
  const quote = src[i];
  for (i++; i < src.length; i++) {
    if (src[i] === '\\') i++;
    else if (src[i] === quote) return i + 1;
    else if (quote === '`' && src[i] === '$' && src[i + 1] === '{') i = skipBraces(src, i + 1) - 1;
  }
  return i;
}
/** Index just past the `{ ... }` that starts at `i`. */
function skipBraces(src: string, i: number): number {
  let depth = 0;
  for (; i < src.length; i++) {
    const c = src[i];
    if (c === "'" || c === '"' || c === '`') i = skipLiteral(src, i) - 1;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return i + 1;
  }
  return i;
}
/** A literal's text with each top-level `${...}` shown as `{}`. */
function skeleton(literal: string): string {
  const inner = literal.slice(1, -1);
  if (literal[0] !== '`') return inner;
  let out = '';
  for (let i = 0; i < inner.length; i++) {
    if (inner[i] === '$' && inner[i + 1] === '{') {
      i = skipBraces(inner, i + 1) - 1;
      out += '{}';
    } else out += inner[i];
  }
  return out;
}
/** The wording of the sentence: references, `{}` and punctuation removed. */
const hasWords = (s: string): boolean => /[A-Za-z]{2,}/.test(s.replace(/\{\}/g, '').replace(/\$/g, ''));

/** The literal (quoted string or template) that starts at `from`, or null when the expression there is not one. */
function literalAt(src: string, from: number): string | null {
  let i = from;
  while (/\s/.test(src[i] ?? '')) i++;
  if (!"'`".includes(src[i] ?? '')) return null;
  return src.slice(i, skipLiteral(src, i));
}

/** Every `detail: '...'` / `detail: `...`` and every audit helper call's last template argument in the sources. */
function details(): Map<string, string> {
  const found = new Map<string, string>();
  for (const file of files()) {
    const src = readFileSync(file, 'utf8');
    if (!/audit/i.test(src)) continue;
    const where = file.slice(SRC.length + 1);
    const add = (lit: string | null) => {
      if (!lit) return;
      const sk = skeleton(lit);
      if (hasWords(sk)) found.set(sk, where);
    };
    for (const m of src.matchAll(/\bdetail:\s*/g)) add(literalAt(src, m.index! + m[0].length));
    // `this.audit(actor, 'run.split', run, `...`)`: the last argument is a template literal.
    for (const m of src.matchAll(/\b(?:audit\w*|auditLine|auditAction)\(/g)) {
      const open = m.index! + m[0].length - 1;
      let depth = 0;
      let close = open;
      for (; close < src.length; close++) {
        const c = src[close];
        if (c === "'" || c === '"' || c === '`') close = skipLiteral(src, close) - 1;
        else if (c === '(') depth++;
        else if (c === ')' && --depth === 0) break;
      }
      const inner = src.slice(open + 1, close).trimEnd().replace(/,$/, '').trimEnd();
      if (inner.endsWith('`')) {
        // walk back to the template's opening backtick by scanning forward through the arguments
        for (let i = 0; i < inner.length; i++) {
          if (inner[i] === "'" || inner[i] === '"' || inner[i] === '`') {
            const end = skipLiteral(inner, i);
            if (end >= inner.length && inner[i] === '`') add(inner.slice(i, end));
            i = end - 1;
          }
        }
      }
    }
  }
  return found;
}

describe('audit-log detail in French', () => {
  const sent = details();

  it('finds the details the server writes (the scanner did not silently break)', () => {
    expect(sent.size).toBeGreaterThan(15);
    expect(sent.has('{} area(s)')).toBe(true);
    expect(sent.has('temporary password replaced')).toBe(true);
  });

  it('has a French version for every detail with fixed wording', () => {
    // Details that are only data once the references are removed (names of hubs, "{} {} ({})" of an area) need none.
    const data = (sk: string) => !CASES[sk] && sk.replace(/\{\}/g, '').replace(/[^A-Za-z]/g, '').length < 3;
    const missing = [...sent.keys()].filter((sk) => !CASES[sk] && !data(sk) && !/^(\{\}[ :·()>-]*)+$/.test(sk));
    expect(missing.map((sk) => `${sk}   (${sent.get(sk)})`)).toEqual([]);
  });

  it.each(Object.entries(CASES).flatMap(([sk, cases]) => cases.map(([sample, french]) => [sk, sample, french])))('translates %s: %s', (_sk, sample, french) => {
    expect(auditDetailFr(sample)).toBe(french);
  });

  it('keeps no stale entries', () => {
    const listed = [...sent.keys()];
    // Sentences built from nested templates are scanned by their outer text, so only the plain ones are held to this.
    expect(Object.keys(CASES).filter((sk) => !listed.includes(sk) && !['{} · {} · {}', '{} {} -> {}', '{} -> {}', '{} · {} recipients · {}', '{} · order {}'].includes(sk))).toEqual([]);
  });

  it('leaves data-only details (names, references, free text) to the reader', () => {
    expect(auditDetailFr('Entrepôt Limete')).toBeNull();
    expect(auditDetailFr('SOM-1001')).toBeNull();
    expect(auditDetailFr('')).toBeNull();
    expect(auditDetailFr(null)).toBeNull();
  });

  it('fills detailFr when a row is inserted, and keeps one a writer set', () => {
    const row = Object.assign(new AuditLog(), { detail: '2 area(s)' });
    row.fillDetailFr();
    expect(row.detailFr).toBe('2 zones');
    const own = Object.assign(new AuditLog(), { detail: '2 area(s)', detailFr: 'mon texte' });
    own.fillDetailFr();
    expect(own.detailFr).toBe('mon texte');
  });
});
