/**
 * What a rider can do with a task on the web portal, as pure rules: which button comes next, what is asked before
 * "delivered", what a failure report says, and what is sent to the server. (The delivered form's code check stays in
 * the component.) The web twin of the
 * Flutter rider app (`nextStatusFor` in `deliveries_screen.dart`). The portal components (`rider-task-actions.tsx`) call these;
 * they only draw. The server checks every move again (only the assigned rider, only the next status).
 *
 * No imports: `npm test` loads this file on its own.
 */

export const FAIL_REASONS = [
  { value: "Customer unavailable", fr: "Client indisponible" },
  { value: "Customer not reachable", fr: "Client injoignable" },
  { value: "Wrong address", fr: "Mauvaise adresse" },
  { value: "Refused delivery", fr: "Livraison refusée" },
  { value: "Payment issue", fr: "Problème de paiement" },
  { value: "Seller not ready", fr: "Vendeur pas prêt" },
  { value: "Parcel damaged or missing", fr: "Colis endommagé ou manquant" },
  { value: "Other", fr: "Autre" },
];

/** Why a leg is closed when the system (not the rider) voided it, as the server writes it. */
const VOID_REASONS_FR: Record<string, string> = {
  "Order cancelled": "Commande annulée",
  "Seller cancelled": "Annulé par le vendeur",
  "Returned to seller": "Retourné au vendeur",
};

/**
 * A leg's failure reason in the viewer's language. The rider picks one of FAIL_REASONS (stored in English, optionally
 * followed by ": a note"), and the system writes the void reasons above; the note itself is the rider's own words and
 * stays as typed. Anything unknown comes back untouched.
 */
export function failureReasonText(reason: string | null | undefined, fr: boolean): string {
  const text = (reason ?? "").trim();
  if (!fr || !text) return text;
  if (VOID_REASONS_FR[text]) return VOID_REASONS_FR[text];
  const missing = /^Parcel missing from run (.+)$/.exec(text);
  if (missing) return `Colis manquant dans la tournée ${missing[1]}`;
  for (const r of FAIL_REASONS) {
    if (text === r.value) return r.fr;
    if (text.startsWith(`${r.value}:`)) return `${r.fr} :${text.slice(r.value.length + 1)}`;
  }
  return text;
}

export type RiderStep = "picked_up" | "in_transit" | "deliver" | "handover" | "none";

/**
 * The next thing the rider does on a leg. `deliver` opens the delivered form (customer and seller legs only);
 * `handover` is NOT a button: a leg that ends at a warehouse is finished by the warehouse staff scanning the parcel in.
 */
export function nextStep(task: { status: string; hubBound: boolean }): RiderStep {
  switch (task.status) {
    case "assigned":
      return "picked_up";
    case "picked_up":
      return "in_transit";
    case "in_transit":
      return task.hubBound ? "handover" : "deliver";
    default:
      return "none";
  }
}

/** Can the rider still report the leg as impossible? Any open leg. */
export const canReportFailure = (task: { status: string }): boolean => task.status === "assigned" || task.status === "picked_up" || task.status === "in_transit";

/** "Reason: notes", cut to what the server keeps (200 characters). */
export const failureText = (reason: string, notes: string): string => `${reason}${notes.trim() ? `: ${notes.trim()}` : ""}`.slice(0, 200);

/** The body of `delivery:updateStatus` for a failed attempt. */
export const failedPayload = (taskId: string, reason: string, notes: string): { taskId: string; status: "failed"; reason: string } => ({
  taskId,
  status: "failed",
  reason: failureText(reason, notes),
});

/** The body of `delivery:updateStatus` for a plain step. */
export const stepPayload = (taskId: string, status: "picked_up" | "in_transit"): { taskId: string; status: "picked_up" | "in_transit" } => ({ taskId, status });

/** The kinds of leg that end at the customer's door (a warehouse delivery or an express run). */
const CUSTOMER_LEG_KINDS = ["delivery", "express"];

/**
 * What the rider is reminded of before they set off, as short lines: an express run goes seller -> customer with no
 * warehouse in between, the customer's code is asked at the door, a partial delivery carries only
 * some of the order. Empty for legs that end at a warehouse.
 */
export function riderBrief(
  task: { kind: string; needsCode?: boolean; partial?: boolean },
  fr: boolean,
  opts: { requireCode?: boolean } = {},
): string[] {
  const out: string[] = [];
  if (task.kind === "express") {
    out.push(
      fr
        ? "Livraison express : collectez le colis chez le vendeur puis allez directement chez le client, sans passer par l'entrepôt."
        : "Express: collect the parcel from the seller, then go straight to the customer. No warehouse in between.",
    );
  }
  if (CUSTOMER_LEG_KINDS.includes(task.kind)) {
    out.push(fr ? "Vous remettez le colis au client en main propre." : "You hand the parcel to the customer in person.");
    if (task.needsCode && opts.requireCode !== false) out.push(fr ? "Demandez le code à 4 chiffres du client." : "Ask the customer for their 4-digit code.");
    if (task.partial) out.push(fr ? "Livraison partielle : seuls ces articles sont à remettre, le reste suit." : "Partial delivery: hand over only these items, the rest follows.");
  }
  return out;
}
