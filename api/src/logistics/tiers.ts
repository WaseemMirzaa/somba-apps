import { ROLE_GROUPS, inRoleGroup } from '../common/role-groups';

/** Warehouse staff tiers: operators scan in/out, supervisors also assign riders, managers also run the hub. */
export type WarehouseTier = 'operator' | 'supervisor' | 'manager';
export const WAREHOUSE_TIERS: readonly WarehouseTier[] = ['operator', 'supervisor', 'manager'];
/**
 * scan = operator work; assign = hand parcels to riders; oversee = the supervisor pages the web hides from operators
 * (aged parcels, COD cash, incidents, after-sale statuses, return grading); manage = manager pages (analytics, the hub).
 */
export type DeskAction = 'scan' | 'assign' | 'oversee' | 'manage';

const RANK: Record<WarehouseTier, number> = { operator: 1, supervisor: 2, manager: 3 };
const NEEDS: Record<DeskAction, number> = { scan: 1, assign: 2, oversee: 2, manage: 3 };

/** A staff account with no tier set counts as an operator (the least privilege). */
export function tierOf(raw: string | null | undefined): WarehouseTier {
  return (WAREHOUSE_TIERS as readonly string[]).includes(raw ?? '') ? (raw as WarehouseTier) : 'operator';
}

/**
 * The refusal an admin role outside the desk group gets. One sentence for every dispatch, scan, batch, run and incident
 * event, so the web shows the same French line everywhere (`web/src/lib/api-errors.ts`).
 */
export const DESK_ADMINS_ONLY = 'Only operations admins and warehouse staff can work the warehouse desk.';

/** The socket rooms of the desk admins: the live pushes about tasks, runs, batches and incidents go to these (and to the warehouses concerned), not to every admin. */
export const DESK_ROLES: string[] = [...ROLE_GROUPS.logisticsDesk];

/** Is this an admin role that works the warehouse desk (group `logisticsDesk`: the super admin and operations)? */
export function isDeskAdmin(role: string | null | undefined): boolean {
  return inRoleGroup(role, 'logisticsDesk');
}

/**
 * May this user do the action? The desk admins (`logisticsDesk`) can do everything; every other admin role (marketing,
 * moderation, support, finance), riders and everyone else nothing; warehouse staff by tier.
 */
export function tierAllows(role: string, tier: string | null | undefined, action: DeskAction): boolean {
  if (isDeskAdmin(role)) return true;
  if (role !== 'warehouse_staff') return false;
  return RANK[tierOf(tier)] >= NEEDS[action];
}
