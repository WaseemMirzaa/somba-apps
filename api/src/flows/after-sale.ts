import { BadRequestException } from '@nestjs/common';
import type { Repository } from 'typeorm';
import type { ExchangeStatus, Order, ReplacementStatus, Seller } from '../database/entities';
import { linesBySeller, sellerUserId, type ListingSellerLookup } from '../orders/order-sellers';

/** Allowed status steps (mirrors the warehouse buttons in web/src/lib/warehouse-live.ts). */
export const REPLACEMENT_NEXT: Record<ReplacementStatus, ReplacementStatus[]> = {
  requested: ['approved', 'rejected'],
  approved: ['received', 'dispatched', 'rejected'],
  received: ['allocated'],
  allocated: ['dispatched'],
  dispatched: ['delivered'],
  delivered: [],
  rejected: [],
};

export const EXCHANGE_NEXT: Record<ExchangeStatus, ExchangeStatus[]> = {
  requested: ['approved', 'rejected'],
  approved: ['received', 'dispatched', 'rejected'],
  received: ['ready'],
  ready: ['dispatched'],
  dispatched: ['delivered'],
  delivered: [],
  rejected: [],
};

/** Throws the message shown to warehouse staff when a step is not allowed. */
export function assertStep<S extends string>(next: Record<S, S[]>, from: S, to: S): void {
  if (!(next[from] ?? []).includes(to)) {
    throw new BadRequestException(`Can't move from ${from} to ${to}.`);
  }
}

/**
 * The seller whose item a replacement or exchange is about: the order line for that product (apps send the
 * product id as the sku), else the only seller on the order. Null when it can't be told.
 */
export async function sellerForItem(
  order: Order,
  sku: string,
  products: ListingSellerLookup,
  sellers: Repository<Seller>,
): Promise<{ sellerId: string; userId: string } | null> {
  try {
    const bySeller = await linesBySeller(order, products);
    let sellerId: string | null = null;
    for (const [id, items] of bySeller) if (items.some((i) => i.productId === sku)) sellerId = id;
    if (!sellerId && bySeller.size === 1) sellerId = [...bySeller.keys()][0];
    if (!sellerId) return null;
    return { sellerId, userId: await sellerUserId(sellerId, sellers) };
  } catch {
    return null;
  }
}

/** The seller ids a seller account's rows can carry (the store id, or the user id on old demo data). */
export async function sellerKeys(userId: string, sellers: Repository<Seller>): Promise<string[]> {
  const store = await sellers.findOne({ where: { userId } });
  return store?.id && store.id !== userId ? [store.id, userId] : [userId];
}
