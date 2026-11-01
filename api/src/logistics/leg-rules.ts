import type { DeliveryKind, DeliveryStatus } from '../database/entities';

/**
 * The rules of the three-leg journey, as pure functions (no I/O) so they are easy to test and to reuse in the
 * services and the gateway.
 *
 *   order:   seller --pickup--> origin hub --transfer--> destination hub --delivery--> customer
 *   return:  customer --return_pickup--> destination hub --return_transfer--> origin hub --return_to_seller--> seller
 *   replace: seller --pickup--> origin hub --transfer--> destination hub --replacement_delivery--> customer
 *
 * A leg ending at a warehouse is finished by staff scanning the parcel in ("delivered" = scanned in); a leg ending at
 * a customer or a seller is finished by the rider.
 */

/** Legs that end at a warehouse: only a scan-in completes them. */
export const HUB_BOUND_KINDS: readonly DeliveryKind[] = ['pickup', 'transfer', 'return_pickup', 'return_transfer'];

/** Legs where a customer hands over / receives the parcel and the 4-digit code applies. */
export const CODE_KINDS: readonly DeliveryKind[] = ['delivery', 'replacement_delivery'];

/** Legs that leave a warehouse (staff can scan the parcel out to the rider). */
export const OUTBOUND_KINDS: readonly DeliveryKind[] = ['transfer', 'return_transfer', 'delivery', 'return_to_seller', 'replacement_delivery'];

/** Legs where a transfer rider may come from either end. */
export const TRANSFER_KINDS: readonly DeliveryKind[] = ['transfer', 'return_transfer'];

/** Statuses in which a task is still open. */
export const OPEN_STATUSES: readonly DeliveryStatus[] = ['unassigned', 'assigned', 'picked_up', 'in_transit'];

export const isHubBound = (kind: DeliveryKind) => HUB_BOUND_KINDS.includes(kind);
export const isOpen = (status: DeliveryStatus) => OPEN_STATUSES.includes(status);

/** The shape the rules need from a task. */
export interface LegTask {
  kind: DeliveryKind;
  status: DeliveryStatus;
  hubId?: string | null;
  fromHubId?: string | null;
  toHubId?: string | null;
  disputeId?: string | null;
  replacementId?: string | null;
  exchangeId?: string | null;
}

/** The moves a RIDER may make (staff finish hub-bound legs by scanning in). */
export function riderNext(kind: DeliveryKind, status: DeliveryStatus): DeliveryStatus[] {
  switch (status) {
    case 'assigned':
      return ['picked_up', 'failed'];
    case 'picked_up':
      return ['in_transit', 'failed'];
    case 'in_transit':
      return isHubBound(kind) ? ['failed'] : ['delivered', 'failed'];
    default:
      return [];
  }
}

/** Does this task belong to the order's own journey (not to a return / replacement / exchange)? */
export function isOrderFlow(t: Pick<LegTask, 'kind' | 'disputeId' | 'replacementId' | 'exchangeId'>): boolean {
  return !t.disputeId && !t.replacementId && !t.exchangeId && (t.kind === 'pickup' || t.kind === 'transfer' || t.kind === 'delivery');
}

/** The warehouse that manages a leg: its staff assign the rider. */
export function managingHub(kind: DeliveryKind, from: string | null | undefined, to: string | null | undefined): string | null {
  switch (kind) {
    case 'pickup':
    case 'return_pickup':
      return to ?? null;
    default:
      return from ?? to ?? null;
  }
}

/** The warehouses whose riders may run a task. Transfers may use either end's riders. */
export function riderHubIds(t: LegTask): string[] {
  const ids = TRANSFER_KINDS.includes(t.kind) ? [t.fromHubId, t.toHubId, t.hubId] : [t.hubId ?? managingHub(t.kind, t.fromHubId, t.toHubId)];
  return [...new Set(ids.filter((x): x is string => !!x))];
}

/** May a rider of `riderHub` run this task? A task tied to no warehouse (legacy) accepts any rider. */
export function riderFits(t: LegTask, riderHub: string | null | undefined): boolean {
  const ids = riderHubIds(t);
  if (!ids.length) return true;
  return !!riderHub && ids.includes(riderHub);
}

/** Does a warehouse see this task in its queue (managing, sending or receiving end)? */
export function touchesHub(t: LegTask, hubId: string): boolean {
  return t.hubId === hubId || t.fromHubId === hubId || t.toHubId === hubId;
}

/** Statuses of a leg whose parcel a rider has collected (the only ones staff can scan in). */
export const COLLECTED_STATUSES: readonly DeliveryStatus[] = ['picked_up', 'in_transit'];

/** Can staff of `hubId` scan this task in? Only once a rider has collected the parcel: not while it is unassigned or merely assigned. */
export function canScanInAt(t: LegTask, hubId: string): boolean {
  return isHubBound(t.kind) && t.toHubId === hubId && COLLECTED_STATUSES.includes(t.status);
}

/** Can staff of `hubId` hand this (assigned) parcel to its rider? */
export function canScanOutAt(t: LegTask, hubId: string): boolean {
  return OUTBOUND_KINDS.includes(t.kind) && t.fromHubId === hubId && t.status === 'assigned';
}

/** Customer-facing order status a leg's rider update implies, or null when the order does not change. */
export function orderStatusFor(kind: DeliveryKind, status: DeliveryStatus): 'processing' | 'shipped' | 'out_for_delivery' | 'delivered' | null {
  if (kind === 'pickup') return status === 'assigned' || status === 'picked_up' ? 'processing' : null;
  if (kind === 'delivery') {
    if (status === 'picked_up') return 'shipped';
    if (status === 'in_transit') return 'out_for_delivery';
    if (status === 'delivered') return 'delivered';
  }
  return null;
}

/** Order statuses in the order they happen: an update only ever moves an order forward. */
const RANK: Record<string, number> = { pending: 0, confirmed: 1, processing: 2, shipped: 3, out_for_delivery: 4, delivered: 5 };
export function movesForward(from: string, to: string): boolean {
  return (RANK[to] ?? -1) > (RANK[from] ?? 99);
}

/** Human label of a leg (used in notices; the French mapping lives in notifications/localize.ts). */
export function kindLabel(kind: DeliveryKind): string {
  return kind.replace(/_/g, ' ');
}
