import { In } from 'typeorm';
import type { EntityManager } from 'typeorm';
import { DeliveryTask, OrderItem, TransferRun, User } from '../database/entities';
import { isCustomerKind } from '../logistics/leg-rules';

/** One leg of an order's journey as the SELLER may see it: who (first name), where it stands, when. No phone, no address, no code. */
export interface TrackingLeg {
  id: string;
  /** pickup | transfer | delivery | return_pickup | ... ('delivery' for tasks that predate legs). */
  kind: string;
  status: string;
  riderFirstName: string | null;
  readyAt: Date | null;
  /** The warehouse scanned the parcel in. */
  receivedAt: Date | null;
  pickedUpAt: Date | null;
  deliveredAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  attempts: number;
  failureReason: string | null;
  /** Which hop of the transfer chain this leg is (1-based) and how many there are; 1 of 1 on every other leg. */
  hop: number;
  hops: number;
  /** The transfer run (manifest) the parcel travels in, with its reference; null when none. */
  runId: string | null;
  runReference: string | null;
  /** Only in the CUSTOMER's view: the warehouses at the ends of the leg (null when an end is a seller or the customer). */
  fromHub?: HubName | null;
  toHub?: HubName | null;
  fromHubName?: string | null;
  toHubName?: string | null;
  /** Only in the CUSTOMER's view, on a customer leg: the sellers whose parcels it carries (null = a legacy leg that carries everything). */
  sellerIds?: (string | null)[] | null;
  /** Only in the CUSTOMER's view, on a customer leg: what it carries. */
  items?: { orderItemId: string; qty: number }[];
  /** Only in the CUSTOMER's view, on a customer leg: does delivering it finish the order? */
  completesOrder?: boolean;
}

/** A warehouse as a customer reads it. */
export interface HubName {
  id: string;
  name: string;
  city: string | null;
}

export interface SellerTracking {
  carrier: string;
  legs: TrackingLeg[];
  /** The leg being worked now (the latest that is not finished), else the last one. */
  currentLeg: string | null;
  /** First name of the rider on the current leg. */
  riderFirstName: string | null;
  lastUpdateAt: Date | null;
}

export const CARRIER = 'Somba&Teka';

/** The coarse place of a delivery address: its city only (never the street, number or contact). */
export function cityOf(shippingAddress: string | null | undefined): string | null {
  if (!shippingAddress) return null;
  try {
    const a = JSON.parse(shippingAddress) as { city?: unknown };
    const city = typeof a?.city === 'string' ? a.city.trim().slice(0, 60) : '';
    return city || null;
  } catch {
    return null;
  }
}

const firstName = (name: string | null | undefined) => (name ?? '').trim().split(/\s+/)[0] || null;
const FINISHED = new Set(['delivered', 'failed']);

/**
 * The journey of each order, from its delivery tasks (read only): the pickup from the seller, the transfer between
 * warehouses and the delivery to the customer, with the rider's first name and the times each leg reached.
 * `sellerKeys` (the store id and its owner's user id) hides other sellers' pickup legs on a multi-seller order.
 */
export async function sellerTracking(m: EntityManager, orderIds: string[], sellerKeys?: string[], opts: { hubs?: Map<string, HubName> } = {}): Promise<Map<string, SellerTracking>> {
  const out = new Map<string, SellerTracking>();
  const ids = [...new Set(orderIds)];
  if (!ids.length) return out;
  const tasks = await m.find(DeliveryTask, {
    where: { orderId: In(ids) },
    select: ['id', 'orderId', 'kind', 'status', 'riderId', 'sellerId', 'readyAt', 'receivedAt', 'pickedUpAt', 'deliveredAt', 'createdAt', 'updatedAt', 'attempts', 'failureReason', 'fromHubId', 'toHubId', 'hop', 'hops', 'runId', 'sellerIds', 'itemsJson'],
    order: { createdAt: 'ASC' },
  });
  const riderIds = [...new Set(tasks.map((t) => t.riderId).filter((x): x is string => !!x))];
  const riders = new Map<string, string | null>();
  if (riderIds.length) for (const u of await m.find(User, { where: { id: In(riderIds) }, select: ['id', 'name'] })) riders.set(u.id, firstName(u.name));
  const runIds = [...new Set(tasks.map((t) => t.runId).filter((x): x is string => !!x))];
  const runRefs = new Map<string, string>();
  if (runIds.length) for (const r of await m.find(TransferRun, { where: { id: In(runIds) }, select: ['id', 'reference'] })) runRefs.set(r.id, r.reference);
  const mine = sellerKeys ? new Set(sellerKeys) : null;
  const byOrder = new Map<string, DeliveryTask[]>();
  for (const t of tasks) {
    // Another seller's pickup is none of this seller's business, and a customer leg that carries only other sellers' parcels is not theirs either.
    if (mine && t.sellerId && !mine.has(t.sellerId)) continue;
    if (mine && isCustomerKind(t.kind) && t.sellerIds && !t.sellerIds.some((k) => !!k && mine.has(k))) continue;
    (byOrder.get(t.orderId) ?? byOrder.set(t.orderId, []).get(t.orderId)!).push(t);
  }
  // The customer's view says which part of the order each customer leg carries, and whether it is the last one.
  const lines = new Map<string, OrderItem[]>();
  if (opts.hubs) {
    const wanted = [...byOrder].filter(([, list]) => list.some((t) => isCustomerKind(t.kind))).map(([id]) => id);
    if (wanted.length) for (const i of await m.find(OrderItem, { where: { orderId: In(wanted) }, select: ['id', 'orderId', 'sellerId', 'fulfilment', 'deliveredAt', 'deliveryTaskId'] })) lines.set(i.orderId, [...(lines.get(i.orderId) ?? []), i]);
  }
  const completes = (t: DeliveryTask): boolean => {
    if (!t.sellerIds) return true;
    const mineKeys = new Set(t.sellerIds);
    return (lines.get(t.orderId) ?? []).every((l) => l.fulfilment === 'cancelled' || (!!l.deliveredAt && l.deliveryTaskId !== t.id) || mineKeys.has(l.sellerId ?? null));
  };
  const cargoOf = (t: DeliveryTask): { orderItemId: string; qty: number }[] => {
    try {
      const v = t.itemsJson ? (JSON.parse(t.itemsJson) as { orderItemId?: string; qty?: number }[]) : [];
      return v.filter((x) => typeof x?.orderItemId === 'string').map((x) => ({ orderItemId: x.orderItemId as string, qty: Number(x.qty) || 1 }));
    } catch {
      return [];
    }
  };
  for (const [orderId, list] of byOrder) {
    const legs: TrackingLeg[] = list.map((t) => ({
      id: t.id,
      kind: (t as { kind?: string }).kind ?? 'delivery',
      status: t.status,
      riderFirstName: t.riderId ? (riders.get(t.riderId) ?? null) : null,
      readyAt: t.readyAt ?? null,
      receivedAt: t.receivedAt ?? null,
      pickedUpAt: t.pickedUpAt ?? null,
      deliveredAt: t.deliveredAt ?? null,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
      attempts: t.attempts ?? 1,
      failureReason: t.failureReason ?? null,
      hop: t.hop ?? 1,
      hops: t.hops ?? 1,
      runId: t.runId ?? null,
      runReference: t.runId ? (runRefs.get(t.runId) ?? null) : null,
      ...(opts.hubs && isCustomerKind((t as { kind?: string }).kind)
        ? { sellerIds: t.sellerIds ?? null, items: cargoOf(t), completesOrder: completes(t) }
        : {}),
      ...(opts.hubs
        ? {
            fromHub: (t.fromHubId && opts.hubs.get(t.fromHubId)) || null,
            toHub: (t.toHubId && opts.hubs.get(t.toHubId)) || null,
            fromHubName: (t.fromHubId && opts.hubs.get(t.fromHubId)?.name) || null,
            toHubName: (t.toHubId && opts.hubs.get(t.toHubId)?.name) || null,
          }
        : {}),
    }));
    const current = [...legs].reverse().find((l) => !FINISHED.has(l.status)) ?? legs[legs.length - 1] ?? null;
    out.set(orderId, {
      carrier: CARRIER,
      legs,
      currentLeg: current?.kind ?? null,
      riderFirstName: current?.riderFirstName ?? null,
      lastUpdateAt: legs.reduce<Date | null>((d, l) => (!d || l.updatedAt > d ? l.updatedAt : d), null),
    });
  }
  return out;
}
