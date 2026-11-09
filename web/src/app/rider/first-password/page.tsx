import { redirect } from "next/navigation";

/**
 * Retired address. The forced first-password step is not a page: a rider whose account still has the temporary password sees
 * the change screen in place of every rider page (components/layout/password-change-gate.tsx), so old links just open the portal.
 */
export default function RiderFirstPasswordRedirect() {
  redirect("/rider");
}
