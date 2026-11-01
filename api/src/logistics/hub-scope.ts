import type { FindOptionsWhere } from 'typeorm';
import type { DeliveryTask } from '../database/entities';

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

/**
 * Tell the people who run an order: every admin, plus the staff of each warehouse the order concerns (and nobody else's).
 * Replaces the old "all warehouse staff" role push, which showed every order to every warehouse.
 */
export function pushOrderToOps(
  emitter: { toRoles(roles: string[], event: string, payload: unknown): void; toHub(hubId: string, event: string, payload: unknown): void },
  adminRoles: string[],
  event: string,
  order: { destinationHubId?: string | null; originHubIds?: string[] | null },
): void {
  emitter.toRoles(adminRoles, event, order);
  for (const hubId of hubsOfOrder(order)) emitter.toHub(hubId, event, order);
}

/** SQL fragment (query builder, alias `o`) matching the orders a warehouse handles. Parameters: `:scopeHub`, `:scopeHubLike`. */
export const ORDER_HUB_SQL = '(o.destinationHubId = :scopeHub OR o.originHubIds LIKE :scopeHubLike)';
export const orderHubParams = (hubId: string) => ({ scopeHub: hubId, scopeHubLike: `%"${hubId.replace(/[%\\]/g, '')}"%` });
