/**
 * Fraud "Block" suspends the customer's account, so it is offered only to the roles the server lets suspend
 * accounts (the same rule as `customers:setActive`; the server enforces it, this only hides the buttons).
 */
export function canSuspendAccounts(role: string | null | undefined): boolean {
  return role === "admin" || role === "admin_support";
}

export type FraudDialogMode = "block" | "unblock";

/** The wording of the confirmation dialog and the toast that follows it, English and French. */
export function fraudDialogText(mode: FraudDialogMode, customer: string, fr: boolean) {
  if (mode === "block") {
    return {
      title: fr ? "Bloquer ce client ?" : "Block this customer?",
      body: fr
        ? `Bloquer suspend le compte de ${customer} : le client est déconnecté tout de suite et ne peut plus se connecter ni commander tant que vous ne le débloquez pas. L'action est inscrite au journal d'audit.`
        : `Blocking suspends ${customer}'s account: they are signed out at once and cannot sign in or order until you unblock them. The action is recorded in the audit log.`,
      confirm: fr ? "Bloquer le compte" : "Block account",
      done: fr ? `Compte de ${customer} suspendu` : `${customer}'s account was suspended`,
    };
  }
  return {
    title: fr ? "Débloquer ce client ?" : "Unblock this customer?",
    body: fr
      ? `Cela réactive le compte de ${customer} : il pourra de nouveau se connecter et commander. L'action est inscrite au journal d'audit.`
      : `This reactivates ${customer}'s account: they can sign in and order again. The action is recorded in the audit log.`,
    confirm: fr ? "Débloquer le compte" : "Unblock account",
    done: fr ? `Compte de ${customer} réactivé` : `${customer}'s account was reactivated`,
  };
}
