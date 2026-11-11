import { readdirSync, readFileSync } from 'fs';
import { join, relative } from 'path';
import * as ts from 'typescript';
import { errorFr, errorFrList } from './error-fr';
import { ERROR_FR_EXACT } from './error-fr-exact';
import { knownField } from './error-fr-fields';

/**
 * Guards "the server explains every error in the user's language": reads the API sources, finds every sentence a
 * person can be shown as an error (what the exceptions are thrown with, what `fail(...)` answers, the `error` /
 * `reason` of an ack) and fails, listing them, when one has no French in the dictionary (`error-fr-exact.ts` for a
 * whole sentence, `error-fr-rules.ts` for one with a number or a name in it). A new or reworded English message
 * therefore breaks the build until its French is added.
 *
 * What is NOT checked is listed below, each with its reason: a message only a terminal or a log ever shows is not
 * "an error a user sees". Keep the lists short; a message that reaches a screen belongs in the dictionary.
 */

const SRC = join(__dirname, '..');

/** Whole files whose messages never reach a client. */
const INTERNAL_FILES: [prefix: string, reason: string][] = [
  ['database/', 'seed, bootstrap, demo-data and admin scripts: run from a terminal, never answered to a client'],
  ['config/', 'start-up checks: the process refuses to boot, nobody is signed in to read it'],
  ['testing/', 'test doubles'],
  ['geo/geo-data.ts', 'missing data file at start-up (operator log)'],
  ['translation/google.translator.ts', 'provider adapter: the translation service logs it and falls back to the English text'],
  ['payments/pawapay.provider.ts', 'provider adapter: payments.service logs it or turns it into the sentences in the dictionary ("Could not reach the mobile-money network..."); webhook checks answer the provider, not a person'],
  ['payments/stripe.provider.ts', 'provider adapter: payments.service logs it or turns it into the sentences in the dictionary; webhook checks answer Stripe, not a person'],
  ['payments/mobile-money.provider.ts', 'provider adapter and webhook checks: answered to the provider or logged'],
  ['payments/payments.controller.ts', 'webhook endpoints: called by the payment provider, not shown to a person'],
  ['ops/fraud-rules.service.ts', 'fraud alert reasons are stored with their own `reasonFr` next to the English `reason`'],
];

/** Single messages that are not shown to a person, or are already sent in both languages. */
const INTERNAL_MESSAGES: [message: string, reason: string][] = [
  ['The translator returned a different number of texts.', 'translation.service retries and then keeps the English text: the error is logged, never answered'],
];

/** Sentences whose placeholders need a specific instance to match their rule (the generic sample is tried first). */
const SAMPLES: Record<string, string[]> = {
  'You cannot delete your account yet. {}': ['You cannot delete your account yet. A payout to you is still being processed: wait until it is paid first.'],
  '{} must be a whole number{}.': ['Price must be a whole number between 1 and 5.'],
  '{} must be a number{}.': ['Price must be a number of at least 1.'],
  '{} that is {} cannot become {}.': ['A pickup that is picked up cannot become assigned.'],
  'There is only {} in stock{}: you cannot remove {}.': ['There is only 1 in stock for "Red": you cannot remove 2.'],
  'There are only {} in stock{}: you cannot remove {}.': ['There are only 3 in stock: you cannot remove 5.'],
};

// ── the scanner ─────────────────────────────────────────────────────────────────────────────────────────────────────

interface Site {
  file: string;
  line: number;
  kind: string;
  tpl: string;
}

const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return e.name === 'migrations' || e.name === 'node_modules' ? [] : walk(p);
    return e.name.endsWith('.ts') && !e.name.endsWith('.spec.ts') && !e.name.endsWith('.d.ts') ? [p] : [];
  });

const FILES = walk(SRC).map((f) => ts.createSourceFile(f, readFileSync(f, 'utf8'), ts.ScriptTarget.ES2022, true));

/** Exported constants like `STILL_PROCESSING = '...'`, reachable from other files. */
const GLOBAL_CONSTS = new Map<string, ts.Expression>();
const stringish = (n: ts.Expression): boolean => ts.isStringLiteralLike(n) || ts.isTemplateExpression(n) || ts.isBinaryExpression(n) || (ts.isAsExpression(n) && stringish(n.expression));
function localConsts(sf: ts.SourceFile, collect?: Map<string, ts.Expression>): Map<string, ts.Expression> {
  const m = new Map<string, ts.Expression>();
  const visit = (n: ts.Node): void => {
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer && stringish(n.initializer)) {
      m.set(n.name.text, n.initializer);
      if (collect && /^[A-Z][A-Z0-9_]+$/.test(n.name.text)) collect.set(n.name.text, n.initializer);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return m;
}
const LOCAL_CONSTS = new Map(FILES.map((sf) => [sf.fileName, localConsts(sf, GLOBAL_CONSTS)] as const));

/** The sentences an expression can evaluate to, with `{}` where a value is dynamic. Empty when it is not text at all. */
function templates(n: ts.Node, consts: Map<string, ts.Expression>, depth = 0): string[] {
  if (depth > 6) return [];
  if (ts.isParenthesizedExpression(n) || ts.isAsExpression(n) || ts.isNonNullExpression(n)) return templates(n.expression, consts, depth + 1);
  if (ts.isStringLiteralLike(n)) return [n.text];
  if (ts.isTemplateExpression(n)) {
    let outs = [n.head.text];
    for (const span of n.templateSpans) {
      let sub = ['{}'];
      const e = span.expression;
      if (ts.isIdentifier(e) && (consts.has(e.text) || GLOBAL_CONSTS.has(e.text))) {
        const r = templates((consts.get(e.text) ?? GLOBAL_CONSTS.get(e.text))!, consts, depth + 1);
        if (r.length) sub = r;
      } else if (ts.isConditionalExpression(e)) {
        const a = templates(e.whenTrue, consts, depth + 1);
        const b = templates(e.whenFalse, consts, depth + 1);
        if (a.length && b.length && [...a, ...b].every((x) => !x.includes('{}'))) sub = [...a, ...b];
      }
      outs = outs.flatMap((o) => sub.map((s) => o + s + span.literal.text)).slice(0, 40);
    }
    return outs;
  }
  if (ts.isConditionalExpression(n)) return [...templates(n.whenTrue, consts, depth + 1), ...templates(n.whenFalse, consts, depth + 1)];
  if (ts.isBinaryExpression(n)) {
    const op = n.operatorToken.kind;
    if (op === ts.SyntaxKind.PlusToken) {
      const a = templates(n.left, consts, depth + 1);
      const b = templates(n.right, consts, depth + 1);
      return (a.length ? a : ['{}']).flatMap((x) => (b.length ? b : ['{}']).map((y) => x + y));
    }
    if (op === ts.SyntaxKind.BarBarToken || op === ts.SyntaxKind.QuestionQuestionToken) return [...templates(n.left, consts, depth + 1), ...templates(n.right, consts, depth + 1)];
    return [];
  }
  if (ts.isIdentifier(n)) {
    const c = consts.get(n.text) ?? GLOBAL_CONSTS.get(n.text);
    return c ? templates(c, consts, depth + 1) : ['{}'];
  }
  if (ts.isPropertyAccessExpression(n) || ts.isCallExpression(n) || ts.isElementAccessExpression(n)) return ['{}'];
  return [];
}

/** Functions that put a field label in front of a validation message; the position of the label argument. */
const LABEL_ARG: Record<string, number> = {
  num: 1, str: 1, optStr: 1, price: 1, oneOf: 2, text: 1, word: 1, checkImage: 1, time: 1, bound: 1, uploadedImageUrl: 1, optionalText: 1,
  productImageUrl: 1, productImageList: 1, dateOf: 1, optDate: 1, units: 1, cleanLines: 1, feats: 1, w: 1,
};
/** Error classes whose message reaches a client (anything named `...Exception` / `...Error`). */
const ERROR_CLASS = /(Exception|Error)$/;
/** Object keys a refusal's text travels under. */
const TEXT_KEYS = new Set(['error', 'reason', 'message']);

function scan(): { sites: Site[]; labels: Map<string, string> } {
  const sites: Site[] = [];
  const labels = new Map<string, string>();
  for (const sf of FILES) {
    const file = relative(SRC, sf.fileName);
    const consts = LOCAL_CONSTS.get(sf.fileName)!;
    const add = (kind: string, node: ts.Node, arg: ts.Node): void => {
      const line = sf.getLineAndCharacterOfPosition(node.getStart()).line + 1;
      for (const tpl of new Set(templates(arg, consts))) sites.push({ file, line, kind, tpl });
    };
    const visit = (n: ts.Node): void => {
      if (ts.isNewExpression(n) && n.arguments?.length && ERROR_CLASS.test(n.expression.getText())) {
        let arg: ts.Node | undefined = n.arguments[0];
        if (ts.isObjectLiteralExpression(arg)) {
          const p = arg.properties.find((x): x is ts.PropertyAssignment => ts.isPropertyAssignment(x) && x.name.getText() === 'message');
          arg = p?.initializer;
        }
        if (arg) add(`new ${n.expression.getText()}`, n, arg);
      } else if (ts.isCallExpression(n) && n.arguments.length) {
        const callee = n.expression;
        if (callee.kind === ts.SyntaxKind.SuperKeyword) {
          const cls = ts.findAncestor(n, ts.isClassDeclaration);
          const heritage = cls?.heritageClauses?.map((h) => h.getText()).join(' ') ?? '';
          if (ERROR_CLASS.test(heritage.replace(/^extends\s+/, '').split(/[\s,{<]/)[0] ?? '') || /(Exception|Error)\b/.test(heritage)) add('super', n, n.arguments[0]);
        } else if (ts.isIdentifier(callee) && callee.text === 'fail') {
          add('fail', n, n.arguments[0]);
        }
        const name = ts.isIdentifier(callee) ? callee.text : ts.isPropertyAccessExpression(callee) && callee.expression.kind === ts.SyntaxKind.ThisKeyword ? callee.name.text : null;
        if (name && LABEL_ARG[name] !== undefined && file !== 'common/validate.ts') {
          const a = n.arguments[LABEL_ARG[name]];
          if (a && ts.isStringLiteralLike(a)) labels.set(a.text, `${file} ${name}()`);
        }
      } else if (ts.isPropertyAssignment(n) && !ts.isStringLiteral(n.name) && TEXT_KEYS.has(n.name.getText())) {
        add(`${n.name.getText()}:`, n, n.initializer);
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }
  return { sites, labels };
}

/** A sentence a person reads (two words or more, and a capital or a full stop), not a code like `token_expired`. */
const isSentence = (tpl: string): boolean => /[A-Za-z]{2,}[ ]+\S/.test(tpl.replace(/\{\}/g, 'x')) && (/^[A-Z{"'`(]/.test(tpl) || /\.$/.test(tpl));

/** Instances of a template to try: each placeholder as a number, a word, a quoted name, a month or an amount. */
function instances(tpl: string): string[] {
  const parts = tpl.split('{}');
  const uniform = ['7', 'Abc', '"Abc"', '2026-11', '4.50', '08:00'].map((v) => parts.join(v));
  const mixed = parts.length > 2 ? [parts.reduce((acc, p, i) => (i === 0 ? p : `${acc}${i === 1 ? '7' : '"Abc"'}${p}`), ''), parts.reduce((acc, p, i) => (i === 0 ? p : `${acc}${i === 1 ? '7' : 'Abc'}${p}`), '')] : [];
  return [...uniform, ...mixed, ...(SAMPLES[tpl] ?? [])];
}

const { sites, labels } = scan();
const internalFile = (file: string): boolean => INTERNAL_FILES.some(([prefix]) => file.startsWith(prefix));
const internalMessage = (tpl: string): boolean => INTERNAL_MESSAGES.some(([m]) => m === tpl);
const visible = sites.filter((s) => isSentence(s.tpl) && !internalFile(s.file) && !internalMessage(s.tpl));
const covered = (tpl: string): boolean => instances(tpl).some((s) => errorFr(s) !== null);

describe('error-fr coverage of the API sources', () => {
  it('finds the messages (the scanner did not silently break)', () => {
    expect(sites.length).toBeGreaterThan(1000);
    expect(new Set(visible.map((s) => s.tpl)).size).toBeGreaterThan(400);
    // forms the scanner must understand
    const has = (tpl: string): boolean => sites.some((s) => s.tpl === tpl);
    expect(has('Your order is still being processed. Check My orders in a moment before trying again.')).toBe(true); // super(CONST)
    expect(has('Daily translation budget used up.')).toBe(true); // super('...')
    expect(has('Nothing to translate.')).toBe(true); // const x = '...'; throw new Error(x)
    expect(has('Too many requests — slow down.')).toBe(true); // fail('...')
  });

  it('has French for every message a user can see', () => {
    const missing = new Map<string, string>();
    for (const s of visible) if (!covered(s.tpl) && !missing.has(s.tpl)) missing.set(s.tpl, `${s.file}:${s.line}`);
    const report = [...missing].map(([tpl, at]) => `  ${at}  ${tpl}`).join('\n');
    expect(missing.size === 0 ? '' : `No French for ${missing.size} message(s): add them to error-fr-exact.ts (whole sentence) or error-fr-rules.ts (with a variable part), or list them in INTERNAL_* with the reason.\n${report}`).toBe('');
  });

  it('has a French label for every field name given to a validator', () => {
    const missing = [...labels].filter(([label]) => !knownField(label)).map(([label, at]) => `  ${at}  "${label}"`);
    expect(missing.length === 0 ? '' : `Add these labels to FIELD_FR (error-fr-fields.ts):\n${missing.join('\n')}`).toBe('');
  });

  it('keeps the allowlists honest: every entry still matches something', () => {
    const stale: string[] = [];
    for (const [prefix] of INTERNAL_FILES) if (!sites.some((s) => s.file.startsWith(prefix) && isSentence(s.tpl))) stale.push(`file ${prefix}`);
    for (const [msg] of INTERNAL_MESSAGES) if (!sites.some((s) => s.tpl === msg)) stale.push(`message ${msg}`);
    expect(stale).toEqual([]);
  });

  it('does not allow-list a sentence the dictionary already translates', () => {
    const redundant = INTERNAL_MESSAGES.filter(([m]) => covered(m)).map(([m]) => m);
    expect(redundant).toEqual([]);
  });
});

describe('errorFr', () => {
  it('translates a whole sentence, whatever the apostrophe or the spacing', () => {
    expect(errorFr('Sign in to continue.')).toBe('Connectez-vous pour continuer.');
    expect(errorFr('  Sign   in to continue.  ')).toBe('Connectez-vous pour continuer.');
    expect(errorFr('Too many requests — slow down.')).toBe('Trop de requêtes. Ralentissez un instant.');
    expect(errorFr('This coupon applies to one store’s products: add them to your cart first.')).toBe('Ce coupon s’applique aux produits d’une seule boutique : ajoutez-les d’abord à votre panier.');
  });

  it('translates a sentence with a variable part and keeps the variable part', () => {
    expect(errorFr('At most 5 option types (e.g. size and colour).')).toBe('Au maximum 5 types d’options (par exemple taille et couleur).');
    expect(errorFr('Only 3 of "Tote bag" left in stock.')).toBe('Il ne reste que 3 × « Tote bag » en stock.');
    expect(errorFr('Minimum order $5.')).toBe('Commande minimum : 5\u00A0$.');
    expect(errorFr('The minimum payout is $10.50.')).toBe('Le versement minimum est de 10,50\u00A0$.');
    expect(errorFr('Cannot move an order from pending to delivered.')).toBe('Impossible de faire passer une commande de « en attente » à « livrée ».');
    expect(errorFr('Price must be a number between 0.01 and 1000000.')).toBe('Le prix : un nombre entre 0.01 et 1000000.');
    expect(errorFr('Express base fee must be a number between 0 and 100.')).toContain('0 et 100');
  });

  it('translates the 404 Express writes for an unknown path', () => {
    expect(errorFr('Cannot GET /api/v1/nope')).toBe('Ressource introuvable.');
  });

  it('answers null for what it does not know, free text and non-strings', () => {
    expect(errorFr('Something nobody ever wrote')).toBeNull();
    expect(errorFr('')).toBeNull();
    expect(errorFr(undefined)).toBeNull();
    expect(errorFr(42)).toBeNull();
    expect(errorFr('x'.repeat(5000))).toBeNull();
    // French in, nothing out: a message that is already French is not "translated" again
    expect(errorFr('Connectez-vous pour continuer.')).toBeNull();
  });

  it('never gives a sentence back as its own translation', () => {
    for (const [en, fr] of Object.entries(ERROR_FR_EXACT)) {
      expect(fr.trim()).not.toBe('');
      expect(fr).not.toBe(en);
    }
  });

  it('translates a list only when every item is known', () => {
    expect(errorFrList(['email must be an email', 'Password must be at least 8 characters.'])).toEqual(['Saisissez un e-mail valide.', 'Le mot de passe doit contenir au moins 8 caractères.']);
    expect(errorFrList(['email must be an email', 'something unknown'])).toBeNull();
    expect(errorFrList([])).toBeNull();
  });

  it('covers the default text of the Nest exceptions (a throw with no message)', () => {
    const { HttpException, BadRequestException, UnauthorizedException, NotFoundException, ForbiddenException, ConflictException, PayloadTooLargeException, ServiceUnavailableException, UnprocessableEntityException, RequestTimeoutException, UnsupportedMediaTypeException } = jest.requireActual('@nestjs/common') as typeof import('@nestjs/common');
    for (const E of [BadRequestException, UnauthorizedException, NotFoundException, ForbiddenException, ConflictException, PayloadTooLargeException, ServiceUnavailableException, UnprocessableEntityException, RequestTimeoutException, UnsupportedMediaTypeException]) {
      const e: InstanceType<typeof HttpException> = new E();
      expect({ name: E.name, fr: errorFr(e.message) }).toEqual({ name: E.name, fr: expect.any(String) });
    }
  });
});
