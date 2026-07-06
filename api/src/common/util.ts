/** Small shared helpers (slugs, codes, money). */

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 60);
}

let counter = 0;
/** Human-friendly, reasonably-unique reference like SMB-2026-4821. */
export function refCode(prefix: string): string {
  counter = (counter + 1) % 10000;
  const year = new Date().getFullYear();
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}-${year}-${rand}${counter.toString().padStart(2, '0')}`.slice(0, 20);
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
