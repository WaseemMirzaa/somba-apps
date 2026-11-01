import { In } from 'typeorm';
import type { EntityManager } from 'typeorm';
import { OrderItem } from '../database/entities';
import { chunk } from './translation.service';

/** What an order line is called in French (null where there is nothing to say). */
export interface LineNames {
  nameFr: string | null;
  variantFr: string | null;
}

/**
 * The French name and option label of order lines, by line id.
 *
 * Loading an `OrderItem` runs `OrderItemTranslationSubscriber`, which fills `productNameFr` / `variantFr` from the
 * snapshot taken when the order was placed, else the product's current translation, else the stored name. Code that
 * reads raw rows (the seller ledger) or keeps its own JSON (a delivery task's cargo) asks here instead of repeating
 * that lookup. Where the subscriber is not registered (unit tests) nothing is filled and callers fall back to the
 * stored name, which is what they do for any line this cannot name.
 */
export async function frenchLineNames(m: EntityManager, ids: readonly string[]): Promise<Map<string, LineNames>> {
  const out = new Map<string, LineNames>();
  for (const part of chunk([...new Set(ids.filter(Boolean))])) {
    for (const line of await m.find(OrderItem, { where: { id: In(part) } })) {
      const nameFr = line.productNameFr?.trim() || null;
      const variantFr = line.variantFr?.trim() || null;
      if (nameFr || variantFr) out.set(line.id, { nameFr, variantFr });
    }
  }
  return out;
}
