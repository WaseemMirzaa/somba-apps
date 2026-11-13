/**
 * Who may do what in the admin controls added after the seller left returns, chat, express and policies
 * (docs/contracts/admin-controls.md §9). The server enforces each rule; these mirror it so a button never shows to a role the server refuses.
 */

/** `logisticsDesk`: switches express delivery per store. */
export const canSetExpress = (role: string): boolean => role === "admin" || role === "admin_operations";

/** `storePolicy`: the policy queue, approve, reject, edit-and-publish. */
export const canReviewPolicies = (role: string): boolean => role === "admin" || role === "admin_moderation";

/** `support`: the read-only seller chats. */
export const canReadChats = (role: string): boolean => role === "admin" || role === "admin_support";

/** `exchangeDecide`: decides exchanges and replacements, price-difference ones included. */
export const canDecideExchange = (role: string): boolean => role === "admin" || role === "admin_operations" || role === "admin_support";

/** `disputeDesk`: decides returns and disputes. */
export const canDecideReturn = (role: string): boolean => ["admin", "admin_operations", "admin_support", "admin_finance"].includes(role);

/**
 * `sellerAfterSaleManage` (docs/contracts/admin-controls.md §13): switches the seller portal's read-only after-sale sections (the
 * defaults and each store's override) and writes in the private seller <-> support threads. Finance only reads the threads.
 */
export const canManageSellerPortal = (role: string): boolean => role === "admin" || role === "admin_operations" || role === "admin_support";
export const canReadSellerThread = (role: string): boolean => canManageSellerPortal(role) || role === "admin_finance";

/** The line under the express switch while the platform-wide express setting is off. */
export function expressNote(platformOn: boolean, fr: boolean): string {
  if (platformOn) return "";
  return fr
    ? "L'express est désactivé pour toute la plateforme (Paramètres) : ce réglage prendra effet dès qu'il sera activé."
    : "Express delivery is off for the whole platform (Settings): this store's switch takes effect once it is turned on.";
}
