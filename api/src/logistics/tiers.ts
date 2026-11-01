/** Warehouse staff tiers: operators scan in/out, supervisors also assign riders, managers also run the hub. */
export type WarehouseTier = 'operator' | 'supervisor' | 'manager';
export const WAREHOUSE_TIERS: readonly WarehouseTier[] = ['operator', 'supervisor', 'manager'];
export type DeskAction = 'scan' | 'assign' | 'manage';

const RANK: Record<WarehouseTier, number> = { operator: 1, supervisor: 2, manager: 3 };
const NEEDS: Record<DeskAction, number> = { scan: 1, assign: 2, manage: 3 };

/** A staff account with no tier set counts as an operator (the least privilege). */
export function tierOf(raw: string | null | undefined): WarehouseTier {
  return (WAREHOUSE_TIERS as readonly string[]).includes(raw ?? '') ? (raw as WarehouseTier) : 'operator';
}

/** May this user do the action? Admins can do everything; riders and everyone else nothing; staff by tier. */
export function tierAllows(role: string, tier: string | null | undefined, action: DeskAction): boolean {
  if (role.startsWith('admin')) return true;
  if (role !== 'warehouse_staff') return false;
  return RANK[tierOf(tier)] >= NEEDS[action];
}
