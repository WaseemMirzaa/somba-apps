/**
 * Who may do the sensitive staff jobs that are not a whole admin department (round 2 least-privilege pass). The server is the
 * guard; `web/src/lib/admin-access.ts` and the warehouse menus only follow it. Warehouse staff are limited by tier on top
 * of this (`logistics/tiers.ts`) and by their own warehouse.
 */

/** Review a store application and read its identity papers: legal name, ID, RCCM, tax number, KYC documents. */
export const KYC_REVIEWERS: readonly string[] = ['admin', 'admin_moderation', 'admin_operations'];

/** Admin roles that run the returns desk (receive and grade returned goods). Support decides a return but never touches the goods. */
export const RETURNS_DESK_ADMINS: readonly string[] = ['admin', 'admin_operations'];

/** Is the role a store-application reviewer? */
export const isKycReviewer = (role: string | null | undefined): boolean => KYC_REVIEWERS.includes(role ?? '');

/** Admin roles that send an aged parcel back to its seller (the same two that run the warehouse job and edit warehouse settings). */
export const RETURN_TO_SELLER_ADMINS: readonly string[] = ['admin', 'admin_operations'];
