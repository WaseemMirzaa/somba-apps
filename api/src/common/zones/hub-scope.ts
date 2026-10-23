import { IsNull, type FindOptionsWhere } from 'typeorm';
import type { DeliveryTask } from '../../database/entities';

/** A rider's preferred zone ids (stored as JSON text). */
export function parsePreferredZones(raw: string | null | undefined): string[] {
  try {
    const v = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, 50) : [];
  } catch {
    return [];
  }
}

/**
 * Tasks a warehouse-bound user may see or take: their warehouse's tasks plus tasks not tied to any warehouse.
 * `hubId` null/undefined = not bound, so no extra condition (every task).
 */
export function tasksOfHub(
  base: FindOptionsWhere<DeliveryTask>,
  hubId: string | null | undefined,
): FindOptionsWhere<DeliveryTask> | FindOptionsWhere<DeliveryTask>[] {
  if (!hubId) return base;
  return [
    { ...base, hubId },
    { ...base, hubId: IsNull() },
  ];
}

/** May a user bound to `userHub` take a task of `taskHub`? Unbound users and unbound tasks always match. */
export function sameHub(userHub: string | null | undefined, taskHub: string | null | undefined): boolean {
  return !userHub || !taskHub || userHub === taskHub;
}
