"use client";

import { useState } from "react";
import { Modal, ErrorNote } from "@/components/admin/modal";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";
import { useSellerData } from "@/lib/seller";
import { errMessage } from "@/lib/seller-labels";
import { CANCEL_REASONS, buildCancelReason, type CancelReasonKey } from "@/lib/seller-packages";
import { formatCurrency } from "@/lib/utils";

export interface CancellableLine {
  itemId: string;
  name: string;
  variant: string;
  qty: number;
  price: number;
}

/**
 * "Cancel items" — orders:sellerCancel for the seller's own open / ready lines only.
 * Mount it only while open (`{open && <CancelItemsDialog … />}`) so every opening starts with all lines ticked.
 */
export function CancelItemsDialog({
  orderId,
  lines,
  onClose,
}: {
  orderId: string;
  lines: CancellableLine[];
  onClose: () => void;
}) {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const { toast } = useToast();
  const { sellerCancel } = useSellerData();
  const [selected, setSelected] = useState<Set<string>>(() => new Set(lines.map((l) => l.itemId)));
  const [reasonKey, setReasonKey] = useState<CancelReasonKey | "">("");
  const [other, setOther] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reason = buildCancelReason(reasonKey, other);
  const chosen = lines.filter((l) => selected.has(l.itemId));
  const valid = chosen.length > 0 && reason !== null;
  const total = chosen.reduce((s, l) => s + l.price * l.qty, 0);

  function toggle(id: string) {
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function confirm() {
    if (!valid || reason === null) return;
    setBusy(true);
    setError(null);
    try {
      // All lines ticked = cancel everything of mine (no itemIds); otherwise only the ticked ones.
      const ids = chosen.length === lines.length ? undefined : chosen.map((l) => l.itemId);
      await sellerCancel(orderId, reason, ids);
      toast(
        fr
          ? "Articles annulés : le client est remboursé pour ces articles"
          : "Items cancelled: the customer is refunded for those items",
      );
      onClose();
    } catch (e) {
      const msg = errMessage(e);
      setError(msg);
      toast(msg, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      title={fr ? "Annuler des articles" : "Cancel items"}
      onClose={() => { if (!busy) onClose(); }}
      footer={
        <>
          <button type="button" disabled={busy} onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 disabled:opacity-50">
            {fr ? "Retour" : "Back"}
          </button>
          <button type="button" disabled={!valid || busy} onClick={() => void confirm()} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
            {busy ? (fr ? "Annulation…" : "Cancelling…") : fr ? "Confirmer l'annulation" : "Confirm cancellation"}
          </button>
        </>
      }
    >
      <fieldset className="space-y-2">
        <legend className="mb-1 font-medium text-slate-900">{fr ? "Articles à annuler" : "Items to cancel"}</legend>
        {lines.map((l) => (
          <label key={l.itemId} className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 p-2">
            <input type="checkbox" className="mt-1" checked={selected.has(l.itemId)} disabled={busy} onChange={() => toggle(l.itemId)} />
            <span className="flex-1">
              <span className="block font-medium text-slate-900">{l.name}</span>
              <span className="block text-xs text-slate-500">{l.variant ? `${l.variant} · ` : ""}{fr ? "Qté" : "Qty"}: {l.qty}</span>
            </span>
            <span className="text-sm">{formatCurrency(l.price * l.qty, locale)}</span>
          </label>
        ))}
      </fieldset>

      <div>
        <label htmlFor="cancel-reason" className="mb-1 block font-medium text-slate-900">{fr ? "Motif" : "Reason"}</label>
        <select
          id="cancel-reason"
          value={reasonKey}
          disabled={busy}
          onChange={(e) => setReasonKey(e.target.value as CancelReasonKey | "")}
          className="input-premium w-full px-3 py-2 text-sm"
        >
          <option value="">{fr ? "Choisir un motif…" : "Choose a reason…"}</option>
          {CANCEL_REASONS.map((r) => (
            <option key={r.key} value={r.key}>{fr ? r.fr : r.en}</option>
          ))}
        </select>
      </div>

      {reasonKey === "other" && (
        <div>
          <label htmlFor="cancel-other" className="mb-1 block font-medium text-slate-900">{fr ? "Précisez le motif" : "Describe the reason"}</label>
          <textarea
            id="cancel-other"
            rows={3}
            maxLength={300}
            value={other}
            disabled={busy}
            onChange={(e) => setOther(e.target.value)}
            className="input-premium w-full px-3 py-2 text-sm"
          />
          {reason === null && <p className="mt-1 text-xs text-red-600">{fr ? "Au moins 3 caractères." : "At least 3 characters."}</p>}
        </div>
      )}

      <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
        {fr
          ? `Le client sera remboursé uniquement pour ces articles (${formatCurrency(total, locale)}) ; les articles seront remis en stock. La commande continue avec les autres vendeurs, et si rien ne reste elle est annulée en entier. Cette action est définitive.`
          : `The customer is refunded for these items only (${formatCurrency(total, locale)}) and they go back into stock. The order continues with the other sellers, and if nothing is left the whole order is cancelled. This cannot be undone.`}
      </p>
      <ErrorNote message={error} />
    </Modal>
  );
}
