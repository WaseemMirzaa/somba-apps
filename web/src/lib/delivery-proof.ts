/** Proof of delivery (photo and signature) on a leg: which legs have it, and the one error that means "not for your role". */

/** Legs that end at the customer's door: the only ones a rider takes proof on, and only once they are delivered. */
export function takesProof(t: { kind: string; status: string }): boolean {
  return t.status === "delivered" && (t.kind === "delivery" || t.kind === "replacement_delivery");
}

/** The server's answer for a role that may not see the proof (or a task outside the caller's warehouse): show nothing. */
export const PROOF_DENIED = "Delivery task not found.";
