import type { FindOptionsWhere } from 'typeorm';
import type { DeliveryTask } from '../database/entities';
import { ROLE_GROUPS } from '../common/role-groups';
import { withoutAddress } from '../common/order-access';

/**
 * Tasks a warehouse sees: the ones it manages, sends or receives. `hubId` null/undefined = no limit (admins).
 * A user tied to a warehouse never gets a task of another warehouse.
 */
export function tasksOfHub(
  base: FindOptionsWhere<DeliveryTask>,
  hubId: string | null | undefined,
): FindOptionsWhere<DeliveryTask> | FindOptionsWhere<DeliveryTask>[] {
  if (!hubId) return base;
  return [
    { ...base, hubId },
    { ...base, fromHubId: hubId },
    { ...base, toHubId: hubId },
  ];
}

/** Warehouses an order concerns: the one that delivers it and the one per seller that collects from them. */
export function hubsOfOrder(order: { destinationHubId?: string | null; originHubIds?: string[] | null }): string[] {
  const ids = [order.destinationHubId, ...(Array.isArray(order.originHubIds) ? order.originHubIds : [])];
  return [...new Set(ids.filter((x): x is string => typeof x === 'string' && x.length > 0))];
}

type OrderEmitter = { toRoles(roles: string[], event: string, payload: unknown): void; toRolesOnly(roles: string[], event: string, payload: unknown): void; toHub(hubId: string, event: string, payload: unknown): void };

/**
 * Tell the admin roles that may read orders, each what it may see (`common/order-access.ts`): the super admin, operations and
 * support get the order, finance and moderation get it without the customer's address, marketing gets nothing.
 */
export function pushOrderToReaders<T extends { shippingAddress?: string | null }>(emitter: Pick<OrderEmitter, 'toRoles' | 'toRolesOnly'>, event: string, order: T): void {
  // The full copy goes through the fan-out (sellers hear about their orders once, from the full order); the reduced copy does not.
  emitter.toRoles([...ROLE_GROUPS.orderDetail], event, order);
  emitter.toRolesOnly([...ROLE_GROUPS.orderAmounts], event, withoutAddress(order));
}

/**
 * Tell the people who run an order: the admin roles that may read orders (see {@link pushOrderToReaders}), plus the staff of
 * each warehouse the order concerns (and nobody else's). Replaces the old "all warehouse staff" role push, which showed every
 * order to every warehouse, and the "every admin" push, which showed every address to marketing.
 */
export function pushOrderToOps<T extends { destinationHubId?: string | null; originHubIds?: string[] | null; shippingAddress?: string | null }>(
  emitter: OrderEmitter,
  event: string,
  order: T,
): void {
  pushOrderToReaders(emitter, event, order);
  for (const hubId of hubsOfOrder(order)) emitter.toHub(hubId, event, order);
}

/** SQL fragment (query builder, alias `o`) matching the orders a warehouse handles. Parameters: `:scopeHub`, `:scopeHubLike`. */
export const ORDER_HUB_SQL = '(o.destinationHubId = :scopeHub OR o.originHubIds LIKE :scopeHubLike)';
export const orderHubParams = (hubId: string) => ({ scopeHub: hubId, scopeHubLike: `%"${hubId.replace(/[%\\]/g, '')}"%` });
