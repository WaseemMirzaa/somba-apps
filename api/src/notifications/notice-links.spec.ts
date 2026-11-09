import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import ts from 'typescript';
import { ROLE_GROUPS } from '../common/role-groups';
import type { RoleGroup } from '../common/role-groups';
import { linkFor } from './links';
import { ADMIN_ROLES } from './notifications.service';

/**
 * A notice must open a page its recipient's menu can reach. Every admin notice the server sends is read from the sources
 * (`toAdmins(notice, audience)` and `toRole('admin_...', notice)`), its link is built the way the server builds it for each
 * recipient role, and the page is checked against `web/src/lib/admin-access.ts` itself (transpiled here, so there is no second
 * copy of "which department reaches what") and against the pages that exist under `web/src/app/admin`.
 */
const SRC = join(__dirname, '..');
const WEB = join(__dirname, '..', '..', '..', 'web', 'src');

// ── reachability, straight from the web menu ────────────────────────────────────────────────────────────────────────────
function loadAccess(): { canAdminAccess: (dept: string, path: string) => boolean; getAdminSections: (dept: string) => { items: { href: string }[] }[] } {
  const src = readFileSync(join(WEB, 'lib', 'admin-access.ts'), 'utf8');
  let { outputText } = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } });
  // The icons are not needed to answer "which pages": stub the one import.
  outputText = outputText.replace(/const lucide_react_\d+ = require\("lucide-react"\);/, 'const lucide_react_1 = new Proxy({}, { get: () => null });').replace(/require\("lucide-react"\)/g, 'new Proxy({}, { get: () => null })');
  const mod = { exports: {} as Record<string, unknown> };
  new Function('module', 'exports', 'require', outputText)(mod, mod.exports, (id: string) => {
    if (id === 'lucide-react') return new Proxy({}, { get: () => null });
    throw new Error(`unexpected import ${id}`);
  });
  return mod.exports as never;
}
const access = loadAccess();

/** The department a server role works in (`web/src/lib/admin-access.ts`: admin = Super Admin, admin_operations = Operations, ...). */
const deptOf = (role: string): string => (role === 'admin' ? 'super' : role.replace(/^admin_/, ''));

/** Does a page exist for this path? Static folders match by name, `[id]` folders match any segment. */
function pageExists(path: string): boolean {
  let dir = join(WEB, 'app');
  for (const seg of path.split('?')[0].split('/').filter(Boolean)) {
    const here = existsSync(join(dir, seg)) && statSync(join(dir, seg)).isDirectory() ? join(dir, seg) : null;
    const dyn = readdirSync(dir).find((d) => /^\[[^\]]+\]$/.test(d) && statSync(join(dir, d)).isDirectory());
    const next = here ?? (dyn ? join(dir, dyn) : null);
    if (!next) return false;
    dir = next;
  }
  return existsSync(join(dir, 'page.tsx'));
}

// ── the notices the server sends to admin roles ─────────────────────────────────────────────────────────────────────────
interface Notice {
  where: string;
  /** null: the type is chosen at run time (the file must appear in EXTRA). */
  type: string | null;
  roles: string[];
}

function sourceFiles(dir = SRC): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return sourceFiles(p);
    return p.endsWith('.ts') && !p.endsWith('.spec.ts') ? [p] : [];
  });
}

/** The text between the parentheses opening at `open`, and its top-level arguments. */
function callArgs(src: string, open: number): string[] {
  const args: string[] = [];
  let depth = 0;
  let start = open + 1;
  let quote = '';
  for (let i = open; i < src.length; i++) {
    const c = src[i];
    if (quote) {
      if (c === '\\') i++;
      else if (c === quote) quote = '';
      continue;
    }
    if (c === "'" || c === '"' || c === '`') quote = c;
    else if (c === '(' || c === '{' || c === '[') depth++;
    else if (c === ')' || c === '}' || c === ']') {
      depth--;
      if (depth === 0) {
        args.push(src.slice(start, i));
        return args.map((a) => a.trim());
      }
    } else if (c === ',' && depth === 1) {
      args.push(src.slice(start, i));
      start = i + 1;
    }
  }
  return args.map((a) => a.trim());
}

const typeIn = (text: string): string | null => /\btype:\s*'(\w+)'/.exec(text)?.[1] ?? null;
/** A notice whose `type` is a variable (`{ title, body, type, entityId }`): the scan cannot read it, so EXTRA must list it. */
const hasDynamicType = (text: string): boolean => /[{,]\s*type\s*[,}]/.test(text) || /\btype:\s*[A-Za-z_]/.test(text.replace(/\btype:\s*'\w+'/g, ''));

/** The `type` of a notice passed as a variable: the first `type: '...'` after its declaration. */
function typeOfVariable(src: string, name: string): string | null {
  const decl = new RegExp(`(?:const|let)\\s+${name}\\b`).exec(src);
  return decl ? typeIn(src.slice(decl.index, decl.index + 900)) : null;
}

function adminNotices(): Notice[] {
  const found: Notice[] = [];
  for (const file of sourceFiles()) {
    const src = readFileSync(file, 'utf8');
    const where = file.slice(SRC.length + 1);
    for (const m of src.matchAll(/\.(toAdmins|toRole)\(/g)) {
      if (src.slice(Math.max(0, m.index! - 7), m.index!) === 'emitter') continue;
      const args = callArgs(src, m.index! + m[0].length - 1);
      if (m[1] === 'toAdmins') {
        const audience = /^'(\w+)'$/.exec(args[1] ?? '')?.[1];
        const roles = audience ? [...ROLE_GROUPS[audience as RoleGroup]] : [...ADMIN_ROLES];
        const type = typeIn(args[0]) ?? (/^\w+$/.test(args[0]) ? typeOfVariable(src, args[0]) : null) ?? (hasDynamicType(args[0]) ? null : 'system');
        found.push({ where, type, roles });
      } else {
        const role = /^'(admin(?:_\w+)?)'$/.exec(args[0] ?? '')?.[1];
        if (!role) continue; // a role chosen at run time: listed in EXTRA below
        const type = typeIn(args[1] ?? '') ?? (/^\w+$/.test(args[1] ?? '') ? typeOfVariable(src, args[1]) : null) ?? (hasDynamicType(args[1] ?? '') ? null : 'system');
        // `toRole('admin_x')` also reaches the super admin.
        found.push({ where, type, roles: role === 'admin' ? ['admin'] : [role, 'admin'] });
      }
    }
  }
  return found;
}

/** Notices whose recipients are picked at run time, which the scan cannot read. */
const EXTRA: Notice[] = [
  { where: 'disputes/disputes.service.ts (return or dispute)', type: 'return', roles: ['admin_support', 'admin'] },
  { where: 'disputes/disputes.service.ts (return or dispute)', type: 'dispute', roles: ['admin_support', 'admin'] },
  { where: 'flows/seller-lapse.service.ts (replacement or exchange)', type: 'replacement', roles: ['admin_support', 'admin'] },
  { where: 'flows/seller-lapse.service.ts (replacement or exchange)', type: 'exchange', roles: ['admin_support', 'admin'] },
  { where: 'inventory/inventory.service.ts (low stock, loop over roles)', type: 'stock', roles: ['admin', 'admin_operations'] },
  { where: 'ops/broadcasts.service.ts (audience role chosen by the sender)', type: 'marketing', roles: [...ADMIN_ROLES] },
];

describe('every admin notice opens a page its recipient can reach', () => {
  const scanned = adminNotices();
  const notices = [...scanned.filter((n): n is Notice & { type: string } => n.type !== null), ...EXTRA] as (Notice & { type: string })[];

  it('lists every notice whose type is chosen at run time', () => {
    const files = new Set(scanned.filter((n) => n.type === null).map((n) => n.where));
    expect([...files].filter((f) => !EXTRA.some((e) => e.where.startsWith(f)))).toEqual([]);
  });

  it('finds the notices the server sends to admin roles', () => {
    // A scanner that silently reads nothing would pass the test below.
    expect(notices.length).toBeGreaterThan(30);
    const has = (type: string, role: string) => notices.some((n) => n.type === type && n.roles.includes(role));
    expect(has('order', 'admin_operations')).toBe(true);
    expect(has('support', 'admin_support')).toBe(true);
    expect(has('return', 'admin_finance')).toBe(true);
    expect(has('exchange', 'admin_support')).toBe(true);
    expect(has('moderation', 'admin_moderation')).toBe(true);
  });

  it('reads the admin menu it checks against', () => {
    expect(access.canAdminAccess('support', '/admin/support')).toBe(true);
    expect(access.canAdminAccess('marketing', '/admin/finance')).toBe(false);
    expect(access.getAdminSections('support').flatMap((s) => s.items.map((i) => i.href))).toContain('/admin/exchanges');
  });

  it('gives each recipient a page its menu reaches, for a notice with an id and for one without', () => {
    const bad: string[] = [];
    const seen = new Set<string>();
    for (const n of notices) {
      for (const role of n.roles) {
        for (const id of ['n-1', null]) {
          const link = linkFor(role, n.type, id);
          const key = `${role}|${n.type}|${id}`;
          if (seen.has(key)) continue;
          seen.add(key);
          const path = link.split('?')[0];
          if (!access.canAdminAccess(deptOf(role), path)) bad.push(`${role} gets "${n.type}" (${n.where}) -> ${link}, which its menu cannot reach`);
          else if (!pageExists(path)) bad.push(`${role} gets "${n.type}" (${n.where}) -> ${link}, but no such page exists`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it('a page-less role is refused by the check (the test can fail)', () => {
    // Marketing has no Orders page: a "New order" link for it must not pass the reachability check.
    expect(access.canAdminAccess(deptOf('admin_marketing'), linkFor('admin_marketing', 'order', 'o1'))).toBe(false);
    expect(access.canAdminAccess(deptOf('admin_finance'), '/admin/returns/r1')).toBe(false);
  });

  it('role-specific pages: finance opens the refund ledger for a failed return refund, operations has no product page for low stock', () => {
    expect(linkFor('admin_finance', 'return', 'd1')).toBe('/admin/refunds');
    expect(linkFor('admin_support', 'return', 'd1')).toBe('/admin/returns/d1');
    expect(linkFor('admin_operations', 'stock', 'p1')).toBe('/admin/notifications');
    expect(linkFor('admin', 'stock', 'p1')).toBe('/admin/products');
    expect(linkFor('admin_support', 'exchange', 'e1')).toBe('/admin/exchanges/e1');
  });
});
