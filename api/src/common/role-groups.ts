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
  /** Money screens: confirm/decline payments, refunds, the finance dashboard (Finance). */
  finance: ['admin', 'admin_finance'],
  /** Operators who move orders by hand and cancel them on a customer's behalf (Operations: Orders). */
  orderOps: ['admin', 'admin_operations'],
  /**
   * The exchange desk (Operations: Exchanges): file an exchange for a customer, approve one that refunds money to the
   * customer's wallet on the seller's behalf, and move an exchange through its steps (warehouse supervisors move it too).
   */
  exchangeDesk: ['admin', 'admin_operations'],
  /** Approve or reject an exchange or replacement on a silent seller's behalf (support is told when a seller lapses). */
  exchangeDecide: ['admin', 'admin_operations', 'admin_support'],
  /**
   * The warehouse and logistics desk (Operations: Fulfilment): assign, reassign or unassign a rider, scan a parcel in or out,
   * build batches and transfer runs, raise and close incidents, read the delivery tasks and the warehouse lists (parcels,
   * custody, aged parcels, inventory, riders), and read the customer's address and phone on a task. Warehouse staff do the
   * same for their own warehouse and by tier (`logistics/tiers.ts`); no other admin role does, whatever its department.
   */
  logisticsDesk: ['admin', 'admin_operations'],
  /**
   * Read an order in full, customer address and phone included, READ-ONLY (Operations: Orders). Support is here because
   * a ticket, a dispute or a return about a delivery cannot be answered without seeing where the parcel goes; it still
   * cannot change an order, dispatch or scan (`orderOps` / `logisticsDesk`). Finance reads amounts only (`orderAmounts`).
   */
  orderDetail: ['admin', 'admin_operations', 'admin_support'],
  /**
   * Read an order's amounts, payment and lines but NOT where it goes: the customer's address (and the phone in it) is blanked.
   * Finance needs the amounts for refunds, payouts and dashboards; Moderation for the sales shown on a seller's page.
   * Marketing is in neither group: its screens run on campaign figures, not on orders.
   */
  orderAmounts: ['admin_finance', 'admin_moderation'],
} as const;

export type RoleGroup = keyof typeof ROLE_GROUPS;

/** Is this role in the group? */
export function inRoleGroup(role: string | null | undefined, group: RoleGroup): boolean {
  return (ROLE_GROUPS[group] as readonly string[]).includes(role ?? '');
}
