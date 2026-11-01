import { createHash } from 'crypto';
import type { EntityManager } from 'typeorm';
import { Order, Payment, PaymentRefund, Payout } from '../database/entities';

/**
 * A cheap fingerprint of everything the admin finance figures are computed from: for orders, payments, refunds and payouts,
 * how many rows each status holds and when the table last changed. Three small grouped queries on indexed columns, no
 * scan of the rows' content. Two reads with the same `version` mean nothing relevant changed in between, so a screen
 * can skip a re-render. (The per-status counts matter where timestamps have a one-second resolution.)
 */
export async function financeVersion(m: EntityManager): Promise<{ version: string; updatedAt: string }> {
  const parts: string[] = [];
  let latest = 0;
  for (const entity of [Order, Payment, PaymentRefund, Payout]) {
    const rows = await m
      .createQueryBuilder(entity, 't')
      .select('t.status', 'status')
      .addSelect('COUNT(*)', 'n')
      .addSelect('MAX(t.updatedAt)', 'at')
      .groupBy('t.status')
      .getRawMany<{ status: string; n: string; at: unknown }>();
    for (const r of rows.sort((a, b) => String(a.status).localeCompare(String(b.status)))) {
      const at = r.at ? new Date(r.at as string | number | Date).getTime() : 0;
      if (Number.isFinite(at) && at > latest) latest = at;
      parts.push(`${r.status}:${r.n}:${Number.isFinite(at) ? at : 0}`);
    }
    parts.push('|');
  }
  return {
    version: createHash('sha1').update(parts.join(',')).digest('hex').slice(0, 12),
    updatedAt: new Date(latest || 0).toISOString(),
  };
}
