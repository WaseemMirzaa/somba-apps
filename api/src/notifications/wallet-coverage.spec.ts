import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { localizeWalletDescription } from './localize';

/**
 * Guards "French users never read an English wallet line": reads the sources, finds every description the server writes
 * to a wallet (`wallet.apply` / `debit` / `credit`) and every refund memo, and fails, listing them, when one has no French.
 * `descriptionFr` is served next to `description` on wallet history (wallet.service, customers.service).
 */

const SRC = join(__dirname, '..');

function sourceFiles(dir = SRC): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === 'migrations' || name === 'testing' ? [] : sourceFiles(p);
    return p.endsWith('.ts') && !p.endsWith('.spec.ts') ? [p] : [];
  });
}

/** The text between the parentheses of the call that opens at `open`, skipping quoted strings and template literals. */
function callBody(src: string, open: number): string {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    const c = src[i];
    if (c === "'" || c === '"' || c === '`') {
      for (i++; i < src.length && src[i] !== c; i++) {
        if (src[i] === '\\') i++;
        else if (c === '`' && src[i] === '$' && src[i + 1] === '{') {
          for (let d = 0; i < src.length; i++) {
            if (src[i] === '{') d++;
            else if (src[i] === '}' && --d === 0) break;
          }
        }
      }
    } else if (c === '(') depth++;
    else if (c === ')' && --depth === 0) return src.slice(open + 1, i);
  }
  return '';
}

/** Literal wording of a description, each `${...}` replaced by a sample reference. */
const sample = (literal: string) => literal.slice(1, -1).replace(/\$\{via\}/g, 'phone').replace(/\$\{[^}]*\}/g, 'SOM-1001');

/** Every plain string or template literal inside an expression (the wording a description is made of). */
function literalsIn(expr: string): string[] {
  return [...expr.matchAll(/`(?:[^`\\]|\\.)*`|'(?:[^'\\\n]|\\.)*'/g)].map((m) => m[0]).filter((l) => /[A-Za-z]{3,}/.test(sample(l)));
}

function walletDescriptions(): { where: string; text: string }[] {
  const found: { where: string; text: string }[] = [];
  for (const file of sourceFiles()) {
    const src = readFileSync(file, 'utf8');
    const where = file.slice(SRC.length + 1);
    if (where.startsWith('database/demo/') || where.startsWith('database/seed')) continue; // the seeds are checked by demo-bilingual.spec
    for (const m of src.matchAll(/\bwallet\w*\.(?:apply|debit|credit)\(/g)) {
      const body = callBody(src, m.index! + m[0].length - 1);
      // The description is the only wording in the call (the other arguments are ids, amounts and the 'debit' kind).
      for (const lit of literalsIn(body)) {
        const text = sample(lit);
        if (!['debit', 'credit', 'refund', 'topup'].includes(text)) found.push({ where, text });
      }
    }
    // A refund memo is also written to the wallet.
    for (const m of src.matchAll(/\bmemo\s*[:=]\s*(`(?:[^`\\]|\\.)*`|'(?:[^'\\\n]|\\.)*')/g)) found.push({ where, text: sample(m[1]) });
  }
  return found;
}

describe('wallet lines (French)', () => {
  const lines = walletDescriptions();

  it('finds the descriptions the server writes', () => {
    expect(lines.length).toBeGreaterThan(8);
    expect(lines.map((l) => l.text)).toEqual(expect.arrayContaining(['Order SOM-1001', 'Wallet top-up via SOM-1001', 'Refund for SOM-1001']));
  });

  it('has a French version for every wallet description', () => {
    const missing = [...new Set(lines.filter((l) => localizeWalletDescription(l.text, 'fr') === l.text).map((l) => `${l.text}   (${l.where})`))];
    expect(missing).toEqual([]);
  });

  it('names both refund channels in a failed-refund line', () => {
    expect(localizeWalletDescription('Refund for SOM-1001 (phone refund failed)', 'fr')).toBe('Remboursement de SOM-1001 (échec du remboursement mobile)');
    expect(localizeWalletDescription('Refund for SOM-1001 (card refund failed)', 'fr')).toBe('Remboursement de SOM-1001 (échec du remboursement par carte)');
  });

  it('keeps the English line for English readers', () => {
    expect(localizeWalletDescription('Order SOM-1001', 'en')).toBe('Order SOM-1001');
  });
});
