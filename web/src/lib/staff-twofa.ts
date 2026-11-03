/**
 * Staff two-factor authentication in the admin portal. When the platform requires it (`requireStaffTwoFactor`) an admin
 * without it can only use the account page, where they enrol; the server refuses every other event until they do
 * (the menu and this redirect only follow the server).
 */
export const ADMIN_ACCOUNT_PATH = "/admin/account";

/** What `auth:2fa:status` says about the signed-in account. */
export interface StaffTwoFaStatus {
  enabled: boolean;
  required: boolean;
}

/**
 * `ok`: show the page; `stay`: held at enrolment and already on the account page; `enrol`: held, so send them to the
 * account page. An unknown status (the call failed) is `ok`: the server enforces the rule, the page only explains it.
 */
export function staffTwoFaDecision(status: StaffTwoFaStatus | null | undefined, pathname: string): "ok" | "stay" | "enrol" {
  if (!status || !status.required || status.enabled) return "ok";
  return pathname === ADMIN_ACCOUNT_PATH || pathname.startsWith(`${ADMIN_ACCOUNT_PATH}/`) ? "stay" : "enrol";
}
