/**
 * Who may use the warehouse desk and read orders, by SERVER role (`rt.user.role`: "admin", "admin_support", ...).
 * Mirrors `api/src/common/role-groups.ts` (`logisticsDesk`, `orderDetail`, `orderAmounts`): the server is the guard, this only
 * keeps the portals from asking for what it will refuse (an error banner on every page) and from linking to pages a role cannot open.
 *
 * - Desk (dispatch, scan, batches, runs, delivery tasks, incidents): the super admin, operations, and warehouse staff by tier.
 * - Orders: the super admin, operations and support read them whole (support read-only, to answer tickets, disputes and returns);
 *   finance and moderation read them without the customer's delivery address; marketing reads none.
 */

const DESK_ADMINS = ["admin", "admin_operations"];
const ORDER_FULL = ["admin", "admin_operations", "admin_support"];
const ORDER_AMOUNTS = ["admin_finance", "admin_moderation"];

/** Works the warehouse desk as an admin (warehouse staff and riders are judged by their own portals). */
export function isDeskAdmin(role: string | null | undefined): boolean {
  return DESK_ADMINS.includes(role ?? "");
}

/** May ask the server for the delivery tasks (`delivery:list`): riders (their own), warehouse staff, and the desk admins. */
export function canListDeliveries(role: string | null | undefined): boolean {
  return role === "rider" || role === "warehouse_staff" || isDeskAdmin(role);
}

/** May ask the server for orders (`orders:list`). Marketing is the only admin role that may not; everyone else gets what they own or may see. */
export function canReadOrders(role: string | null | undefined): boolean {
  return role !== "admin_marketing";
}

/** Sees the customer's delivery address and phone on an order (`shippingAddress`). */
export function canSeeOrderAddress(role: string | null | undefined): boolean {
  return ORDER_FULL.includes(role ?? "");
}

/** Opens the back-office order page (`/admin/orders/<id>`): read-only unless the role runs orders (`canActOnOrders`). */
export function canOpenAdminOrder(role: string | null | undefined): boolean {
  return ORDER_FULL.includes(role ?? "") || ORDER_AMOUNTS.includes(role ?? "");
}

/** Changes an order, cancels it or looks at its routing (`orders:updateStatus`, `orders:adminCancel`, the desk): the order operators. */
export function canActOnOrders(role: string | null | undefined): boolean {
  return isDeskAdmin(role);
}
