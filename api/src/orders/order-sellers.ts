import type { Repository } from 'typeorm';
import type { Order, OrderItem, Seller } from '../database/entities';

/** What these helpers need from the products service (only the raw listing's seller). */
export interface ListingSellerLookup {
  getRaw(productId: string): Promise<{ sellerId?: string | null } | null>;
}

/**
 * An order's lines grouped by seller: the seller snapshot on the line, else the listing's current seller for old
 * lines. Lines priced by the client (`ext:`) have no seller and are skipped.
 */
export async function linesBySeller(order: Order, products: ListingSellerLookup): Promise<Map<string, OrderItem[]>> {
  const bySeller = new Map<string, OrderItem[]>();
  for (const item of order.items ?? []) {
    if (item.productId.startsWith('ext:')) continue;
    const sellerId = item.sellerId ?? (await products.getRaw(item.productId))?.sellerId;
    if (!sellerId) continue;
    bySeller.set(sellerId, [...(bySeller.get(sellerId) ?? []), item]);
  }
  return bySeller;
}

/** The user account behind a seller id (the store row's owner; demo data may store the user id directly). */
export async function sellerUserId(sellerId: string, sellers: Repository<Seller>): Promise<string> {
  const store = await sellers.findOne({ where: { id: sellerId } });
  return store?.userId ?? sellerId;
}

/**
 * The user ids of the sellers on an order. By default only sellers who still have a live (not cancelled) line;
 * with `includeCancelled`, every seller that ever had a line.
 */
export async function sellerUserIdsOf(
  order: Order,
  products: ListingSellerLookup,
  sellers: Repository<Seller>,
  opts: { includeCancelled?: boolean } = {},
): Promise<string[]> {
  const ids = new Set<string>();
  for (const [sellerId, items] of await linesBySeller(order, products)) {
    if (!opts.includeCancelled && items.every((i) => i.fulfilment === 'cancelled')) continue;
    ids.add(await sellerUserId(sellerId, sellers));
  }
  return [...ids];
}
