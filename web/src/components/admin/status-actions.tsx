"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal, ErrorNote } from "@/components/admin/modal";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";
import { errMsg } from "@/lib/admin-live";
import { socketClient } from "@/lib/realtime/socket-client";

type Action = {
  /** Status sent to the server. */
  status: string;
  label: string;
  labelFr: string;
  variant: "approve" | "reject" | "secondary";
  confirm: string;
  confirmFr: string;
  done: string;
  doneFr: string;
};

function useStatusFlow(event: string, idKey: string, onDone?: () => void) {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const { toast } = useToast();
  const [action, setAction] = useState<Action | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(id: string, patchWrap: (status: string) => Record<string, unknown>) {
    if (!action) return;
    setBusy(true);
    setError(null);
    try {
      await socketClient.request(event, { [idKey]: id, ...patchWrap(action.status) });
      toast(fr ? action.doneFr : action.done, "success");
      setAction(null);
      onDone?.();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  }
  return { fr, action, setAction, busy, error, setError, run };
}

const SELLER_ACTIONS: Record<string, Action> = {
  approved: {
    status: "approved", label: "Approve", labelFr: "Approuver", variant: "approve",
    confirm: "Approve this store? The seller can publish products and request payouts.",
    confirmFr: "Approuver cette boutique ? Le vendeur pourra publier et demander des versements.",
    done: "Seller approved", doneFr: "Vendeur approuvé",
  },
  rejected: {
    status: "rejected", label: "Reject", labelFr: "Rejeter", variant: "reject",
    confirm: "Reject this store application?", confirmFr: "Rejeter cette candidature ?",
    done: "Seller rejected", doneFr: "Vendeur rejeté",
  },
  suspended: {
    status: "suspended", label: "Suspend", labelFr: "Suspendre", variant: "reject",
    confirm: "Suspend this store? The seller can no longer operate until reinstated.",
    confirmFr: "Suspendre cette boutique ? Le vendeur ne peut plus opérer tant qu'elle n'est pas rétablie.",
    done: "Seller suspended", doneFr: "Vendeur suspendu",
  },
  reinstated: {
    status: "approved", label: "Reinstate", labelFr: "Rétablir", variant: "approve",
    confirm: "Reinstate this store?", confirmFr: "Rétablir cette boutique ?",
    done: "Seller reinstated", doneFr: "Vendeur rétabli",
  },
};

export function sellerActionsFor(status: string): Action[] {
  switch (status) {
    case "pending":
      return [SELLER_ACTIONS.approved, SELLER_ACTIONS.rejected];
    case "approved":
      return [SELLER_ACTIONS.suspended];
    case "suspended":
      return [SELLER_ACTIONS.reinstated];
    case "rejected":
      return [SELLER_ACTIONS.approved];
    default:
      return [];
  }
}

/** Approve / Reject / Suspend / Reinstate a store through `sellers:setStatus`. */
export function SellerStatusActions({
  sellerId,
  status,
  name,
  size = "sm",
  onDone,
}: {
  sellerId: string;
  status: string;
  name: string;
  size?: "sm" | "md";
  onDone?: () => void;
}) {
  const { fr, action, setAction, busy, error, setError, run } = useStatusFlow("sellers:setStatus", "id", onDone);
  const actions = sellerActionsFor(status);
  if (actions.length === 0) return null;
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {actions.map((a) => (
          <Button key={a.label} variant={a.variant} size={size} onClick={() => { setError(null); setAction(a); }}>
            {fr ? a.labelFr : a.label}
          </Button>
        ))}
      </div>
      <Modal
        open={!!action}
        onClose={() => !busy && setAction(null)}
        title={action ? `${fr ? action.labelFr : action.label} — ${name}` : ""}
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setAction(null)} disabled={busy}>{fr ? "Annuler" : "Cancel"}</Button>
            <Button size="sm" variant={action?.variant === "reject" ? "danger" : "primary"} onClick={() => run(sellerId, (s) => ({ status: s }))} disabled={busy}>
              {busy ? "…" : fr ? "Confirmer" : "Confirm"}
            </Button>
          </>
        }
      >
        <p>{action ? (fr ? action.confirmFr : action.confirm) : ""}</p>
        <ErrorNote message={error} />
      </Modal>
    </>
  );
}

const PRODUCT_ACTIONS: Record<string, Action> = {
  live: {
    status: "live", label: "Approve", labelFr: "Approuver", variant: "approve",
    confirm: "Approve this product? It becomes visible to shoppers.", confirmFr: "Approuver ce produit ? Il devient visible des clients.",
    done: "Product approved", doneFr: "Produit approuvé",
  },
  rejected: {
    status: "rejected", label: "Reject", labelFr: "Rejeter", variant: "reject",
    confirm: "Reject this product? It stays hidden.", confirmFr: "Rejeter ce produit ? Il reste masqué.",
    done: "Product rejected", doneFr: "Produit rejeté",
  },
  removed: {
    status: "removed", label: "Block", labelFr: "Bloquer", variant: "reject",
    confirm: "Block this product? It is removed from the storefront for everyone.", confirmFr: "Bloquer ce produit ? Il est retiré de la boutique pour tous.",
    done: "Product blocked", doneFr: "Produit bloqué",
  },
  unblock: {
    status: "live", label: "Unblock", labelFr: "Débloquer", variant: "approve",
    confirm: "Put this product back on the storefront?", confirmFr: "Remettre ce produit en vente ?",
    done: "Product unblocked", doneFr: "Produit débloqué",
  },
};

export function productActionsFor(status: string): Action[] {
  switch (status) {
    case "pending":
      return [PRODUCT_ACTIONS.live, PRODUCT_ACTIONS.rejected];
    case "live":
    case "approved":
      return [PRODUCT_ACTIONS.removed];
    case "removed":
      return [PRODUCT_ACTIONS.unblock];
    case "rejected":
      return [PRODUCT_ACTIONS.live];
    default:
      return [];
  }
}

/** Approve / Reject / Block / Unblock a product through `products:update`. */
export function ProductStatusActions({
  productId,
  status,
  name,
  size = "sm",
  onDone,
}: {
  productId: string;
  status: string;
  name: string;
  size?: "sm" | "md";
  onDone?: () => void;
}) {
  const { fr, action, setAction, busy, error, setError, run } = useStatusFlow("products:update", "id", onDone);
  const actions = productActionsFor(status);
  if (actions.length === 0) return null;
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {actions.map((a) => (
          <Button key={a.label} variant={a.variant} size={size} onClick={() => { setError(null); setAction(a); }}>
            {fr ? a.labelFr : a.label}
          </Button>
        ))}
      </div>
      <Modal
        open={!!action}
        onClose={() => !busy && setAction(null)}
        title={action ? `${fr ? action.labelFr : action.label} — ${name}` : ""}
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setAction(null)} disabled={busy}>{fr ? "Annuler" : "Cancel"}</Button>
            <Button size="sm" variant={action?.variant === "reject" ? "danger" : "primary"} onClick={() => run(productId, (s) => ({ patch: { status: s } }))} disabled={busy}>
              {busy ? "…" : fr ? "Confirmer" : "Confirm"}
            </Button>
          </>
        }
      >
        <p>{action ? (fr ? action.confirmFr : action.confirm) : ""}</p>
        <ErrorNote message={error} />
      </Modal>
    </>
  );
}
