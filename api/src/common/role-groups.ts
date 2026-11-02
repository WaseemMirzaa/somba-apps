/**
 * Admin roles per feature, for features that more than one gateway guards. Each group is the Super Admin plus the
 * departments whose menu owns the feature in `web/src/lib/admin-access.ts` (server role -> department: admin = super,
 * admin_moderation = Moderation, admin_marketing = Marketing, admin_support = Support). The server is the guard; the
 * menu only follows it. `RealtimeGateway.GROUPS` spreads this table, so `this.can(role, 'support')` works there too.
 */
export const ROLE_GROUPS = {
  /** Approve, reject, block or restore a listing, and edit or remove another seller's listing (Moderation: queue + Products). */
  productModeration: ['admin', 'admin_moderation'],
  /** Approve or reject a seller's campaign, and run campaigns as the platform (Marketing: Marketing). */
  campaignDecisions: ['admin', 'admin_marketing'],
  /** Support tickets: see everyone's, answer, assign, close (Support: Support). */
  support: ['admin', 'admin_support'],
} as const;

export type RoleGroup = keyof typeof ROLE_GROUPS;

/** Is this role in the group? */
export function inRoleGroup(role: string | null | undefined, group: RoleGroup): boolean {
  return (ROLE_GROUPS[group] as readonly string[]).includes(role ?? '');
}
