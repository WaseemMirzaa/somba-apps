"use client";

import { localDay } from "@/lib/dates";
import { useMemo, useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PayoutStatement } from "@/components/payouts/statement-view";
import { ListFilters, EMPTY_LIST_FILTERS } from "@/components/ui/list-filters";
import { Modal, ErrorNote } from "@/components/admin/modal";
import { NoticeBar } from "@/components/admin/notice-bar";
import { applyListFilters } from "@/lib/list-filter-utils";
import { useLocale } from "@/context/locale-context";
import { useRealtime } from "@/context/realtime-context";
import { adminBreadcrumb } from "@/lib/admin-i18n";
import { useToast } from "@/context/toast-context";
import { canMoveMoney, errMsg, useRole, useServerList, type PaymentCapabilities, type PayoutRow } from "@/lib/admin-live";
import { useSocketQuery } from "@/lib/admin-stats";
import { socketClient } from "@/lib/realtime/socket-client";
import type { Seller } from "@/lib/realtime/types";
import { formatCurrency } from "@/lib/utils";

type PayoutStatus = PayoutRow["status"];

const STATUS_OPTIONS = [
  { value: "requested", label: "Requested", labelFr: "Demandé" },
  { value: "sending", label: "Being sent", labelFr: "Envoi en cours" },
  { value: "paid", label: "Paid", labelFr: "Payé" },
  { value: "rejected", label: "Rejected", labelFr: "Rejeté" },
];

const statusVariant: Record<PayoutStatus, "success" | "warning" | "danger" | "info" | "default"> = {
  requested: "warning",
  sending: "info",
  rejected: "danger",
  paid: "success",
};

const statusLabel: Record<PayoutStatus, { en: string; fr: string }> = {
  requested: { en: "Requested", fr: "Demandé" },
  sending: { en: "Being sent (pawaPay)", fr: "Envoi en cours (pawaPay)" },
  rejected: { en: "Rejected", fr: "Rejeté" },
  paid: { en: "Paid", fr: "Payé" },
};

const METHOD_LABEL: Record<string, { en: string; fr: string }> = {
  bank: { en: "Bank transfer", fr: "Virement bancaire" },
  mobile_money: { en: "Mobile money", fr: "Mobile money" },
  wallet: { en: "In-app wallet", fr: "Portefeuille appli" },
};

type Dialog = { kind: "approve" | "reject" | "send"; payout: PayoutRow } | null;

/** One answer of `payouts:approveBatch`: each payout succeeds or fails on its own. */
type BatchResult = { payoutId: string; ok: boolean; error?: string; payout?: PayoutRow };

export default function AdminPayoutsPage() {
  const { t, locale } = useLocale();
  const { toast } = useToast();
  const fr = locale === "fr";
  const role = useRole();
  const rt = useRealtime();
  const mayAct = canMoveMoney(role);
  // Live payouts straight from the realtime context (updated by `payout:updated`).
  const payouts = rt.payouts as PayoutRow[];
  const { items: sellers } = useServerList<Seller>("sellers:list", { pushEvents: ["seller:updated"] });
  // pawaPay connected: mobile-money payouts can be sent from here instead of by hand.
  const caps = useSocketQuery<PaymentCapabilities>("payments:provider", undefined, { enabled: mayAct });
  const canSend = !!caps.data?.pawapayPayouts;
  const [filters, setFilters] = useState(EMPTY_LIST_FILTERS);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [providerRef, setProviderRef] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Statement drawer, and batch approval of the ticked `requested` rows.
  const [statementOf, setStatementOf] = useState<PayoutRow | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [batchOpen, setBatchOpen] = useState(false);
  const [batchRef, setBatchRef] = useState("");
  const [batchBusy, setBatchBusy] = useState(false);
  const [batchError, setBatchError] = useState<string | null>(null);
  const [batchFailures, setBatchFailures] = useState<{ reference: string; error: string }[]>([]);

  const sellerLink = (sellerId: string) => {
    const s = sellers.find((x) => x.userId === sellerId || x.id === sellerId);
    return s ? `/admin/sellers/${s.id}` : null;
  };

  const rows = useMemo(
    () =>
      payouts.map((p) => ({
        ...p,
        requestedAt: localDay(p.createdAt),
        methodLabel: (METHOD_LABEL[p.method]?.[fr ? "fr" : "en"] ?? p.method),
      })),
    [payouts, fr],
  );

  const filtered = useMemo(
    () =>
      applyListFilters(rows, filters, {
        searchFields: ["reference", "sellerName", "method"],
        dateField: "requestedAt",
        statusField: "status",
      }),
    [rows, filters],
  );

  const pendingRows = payouts.filter((p) => p.status === "requested");
  const pendingCount = pendingRows.length;
  // Only rows still awaiting approval can stay ticked (a push may have approved or rejected one meanwhile).
  const selected = pendingRows.filter((p) => picked.has(p.id));
  const selectedTotal = selected.reduce((t, p) => t + p.amountUsd, 0);
  const needsBatchRef = selected.some((p) => p.method !== "wallet");

  function toggle(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function openBatch() {
    setBatchRef("");
    setBatchError(null);
    setBatchFailures([]);
    setBatchOpen(true);
  }

  async function submitBatch() {
    if (!selected.length) return;
    if (needsBatchRef && batchRef.trim().length < 3) {
      setBatchError(fr ? "Saisissez la référence du virement groupé (3 caractères minimum)." : "Enter the batch transfer reference (3 characters minimum).");
      return;
    }
    setBatchBusy(true);
    setBatchError(null);
    setBatchFailures([]);
    try {
      const results = await socketClient.request<BatchResult[]>("payouts:approveBatch", {
        items: selected.map((p) => ({ payoutId: p.id, ...(p.method !== "wallet" ? { providerRef: batchRef.trim() } : {}) })),
      });
      const done = results.filter((r) => r.ok);
      const failed = results.filter((r) => !r.ok);
      const refOf = (id: string) => payouts.find((p) => p.id === id)?.reference ?? id;
      // Approved rows leave the selection (rows refresh from the `payout:updated` pushes); failures stay ticked for a retry.
      setPicked(new Set(failed.map((r) => r.payoutId)));
      if (done.length) {
        toast(
          fr
            ? `${done.length} versement(s) approuvé(s) sur ${results.length}`
            : `${done.length} of ${results.length} payout(s) approved`,
          failed.length ? "info" : "success",
        );
      }
      if (failed.length) {
        const list = failed.map((r) => ({ reference: refOf(r.payoutId), error: r.error ?? "Failed." }));
        setBatchFailures(list);
        toast(
          fr
            ? `${failed.length} versement(s) en échec : ${list.map((f) => `${f.reference} (${f.error})`).join(" · ")}`
            : `${failed.length} payout(s) failed: ${list.map((f) => `${f.reference} (${f.error})`).join(" · ")}`,
          "error",
        );
      } else {
        setBatchOpen(false);
      }
    } catch (e) {
      setBatchError(errMsg(e));
      toast(errMsg(e), "error");
    } finally {
      setBatchBusy(false);
    }
  }

  function open(kind: "approve" | "reject" | "send", payout: PayoutRow) {
    setDialog({ kind, payout });
    setProviderRef("");
    setNote("");
    setError(null);
  }

  async function submit() {
    if (!dialog) return;
    const { kind, payout } = dialog;
    const needsRef = kind === "approve" && payout.method !== "wallet";
    if (needsRef && !providerRef.trim()) {
      setError(fr ? "Saisissez la référence du virement effectué." : "Enter the reference of the transfer you made.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (kind === "send") {
        await socketClient.request("payouts:send", { payoutId: payout.id });
        toast(fr ? `Versement ${payout.reference} envoyé à pawaPay` : `Payout ${payout.reference} sent to pawaPay`, "success");
        setDialog(null);
        return;
      }
      if (kind === "approve") {
        await socketClient.request("payouts:approve", {
          payoutId: payout.id,
          ...(needsRef ? { providerRef: providerRef.trim() } : {}),
        });
      } else {
        await socketClient.request("payouts:reject", { payoutId: payout.id, note: note.trim() || undefined });
      }
      // Row refreshes from the `payout:updated` push.
      toast(
        kind === "approve"
          ? fr ? `Versement ${payout.reference} approuvé` : `Payout ${payout.reference} approved`
          : fr ? `Versement ${payout.reference} rejeté` : `Payout ${payout.reference} rejected`,
        "success",
      );
      setDialog(null);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  const d = dialog;
  const dp = d?.payout;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("payouts")}
        subtitle={
          fr
            ? `Approbation des versements — ${pendingCount} en attente`
            : `Payout approval — ${pendingCount} pending`
        }
        breadcrumbs={[adminBreadcrumb(locale), { label: t("payouts") }]}
      />

      {!mayAct && (
        <NoticeBar tone="warn">
          {fr ? "Seuls l'admin et la finance peuvent approuver ou rejeter un versement." : "Only admin and finance can approve or reject payouts."}
        </NoticeBar>
      )}

      {mayAct && pendingCount > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--border)] bg-white px-4 py-3 text-sm">
          <label className="flex items-center gap-2 text-slate-700">
            <input
              type="checkbox"
              className="h-4 w-4 accent-[var(--primary)]"
              checked={selected.length === pendingCount}
              onChange={(e) => setPicked(e.target.checked ? new Set(pendingRows.map((p) => p.id)) : new Set())}
            />
            {fr ? `Tout sélectionner (${pendingCount} en attente)` : `Select all (${pendingCount} pending)`}
          </label>
          {selected.length > 0 && (
            <span className="text-slate-500">
              {fr
                ? `${selected.length} sélectionné(s) · ${formatCurrency(selectedTotal, locale)}`
                : `${selected.length} selected · ${formatCurrency(selectedTotal, locale)}`}
            </span>
          )}
          <Button variant="primary" size="sm" className="ml-auto" disabled={selected.length === 0} onClick={openBatch}>
            {fr ? "Approuver la sélection" : "Approve selected"}
          </Button>
        </div>
      )}

      <ListFilters
        values={filters}
        onChange={setFilters}
        statusOptions={STATUS_OPTIONS}
        searchPlaceholder={fr ? "Référence, vendeur, méthode…" : "Reference, seller, method…"}
      />

      <Card>
        <CardContent className="p-0">
          <DataTable
            columns={[
              ...(mayAct && pendingCount > 0
                ? [
                    {
                      key: "select",
                      label: fr ? "Sél." : "Select",
                      render: (row: Record<string, unknown>) =>
                        row.status === "requested" ? (
                          <input
                            type="checkbox"
                            className="h-4 w-4 accent-[var(--primary)]"
                            checked={picked.has(String(row.id))}
                            onChange={() => toggle(String(row.id))}
                            aria-label={`${fr ? "Sélectionner" : "Select"} ${String(row.reference)}`}
                          />
                        ) : (
                          <span className="text-slate-300">—</span>
                        ),
                    },
                  ]
                : []),
              {
                key: "reference",
                label: fr ? "Référence" : "Reference",
                primary: true,
                render: (row) => <span className="font-medium text-slate-900">{String(row.reference)}</span>,
              },
              {
                key: "sellerName",
                label: fr ? "Vendeur" : "Seller",
                render: (row) => {
                  const href = sellerLink(String(row.sellerId));
                  return href ? (
                    <Link href={href} className="font-medium text-[var(--primary)] hover:underline">
                      {String(row.sellerName)}
                    </Link>
                  ) : (
                    <span className="font-medium">{String(row.sellerName)}</span>
                  );
                },
              },
              { key: "amountUsd", label: t("amount"), render: (row) => formatCurrency(row.amountUsd as number, locale) },
              { key: "methodLabel", label: fr ? "Méthode" : "Method" },
              {
                key: "status",
                label: t("status"),
                render: (row) => {
                  const status = row.status as PayoutStatus;
                  return (
                    <div>
                      <Badge variant={statusVariant[status] ?? "default"}>{statusLabel[status]?.[fr ? "fr" : "en"] ?? status}</Badge>
                      {row.receiptRef ? <p className="mt-1 text-xs text-slate-400">{fr ? "reçu" : "receipt"} {String(row.receiptRef)}</p> : row.providerRef ? <p className="mt-1 text-xs text-slate-400">ref {String(row.providerRef)}</p> : null}
                      {row.status === "requested" && row.note ? <p className="mt-1 text-xs text-amber-600">{String(row.note)}</p> : null}
                      {row.status === "rejected" && row.note ? <p className="mt-1 text-xs text-slate-400">{String(row.note)}</p> : null}
                    </div>
                  );
                },
              },
              { key: "requestedAt", label: fr ? "Date demande" : "Request date" },
              {
                key: "actions",
                label: t("action"),
                render: (row) => {
                  const p = row as unknown as PayoutRow;
                  const statementBtn = (
                    <Button variant="secondary" size="sm" onClick={() => setStatementOf(p)}>
                      {fr ? "Relevé" : "Statement"}
                    </Button>
                  );
                  if (p.status === "requested" && mayAct) {
                    return (
                      <div className="flex flex-wrap items-center gap-2">
                        {canSend && p.method === "mobile_money" && (
                          <Button size="sm" onClick={() => open("send", p)}>
                            {fr ? "Envoyer avec pawaPay" : "Send with pawaPay"}
                          </Button>
                        )}
                        <Button variant="approve" size="sm" onClick={() => open("approve", p)}>
                          {canSend && p.method === "mobile_money" ? (fr ? "Payé à la main" : "Paid by hand") : t("approve")}
                        </Button>
                        <Button variant="reject" size="sm" onClick={() => open("reject", p)}>
                          {t("reject")}
                        </Button>
                        {statementBtn}
                      </div>
                    );
                  }
                  const href = sellerLink(p.sellerId);
                  return (
                    <div className="flex flex-wrap items-center gap-3">
                      {statementBtn}
                      {href ? (
                        <Link href={href} className="text-sm text-[var(--primary)] hover:underline">
                          {t("view")}
                        </Link>
                      ) : null}
                    </div>
                  );
                },
              },
            ]}
            data={filtered as unknown as Record<string, unknown>[]}
            emptyMessage={fr ? "Aucun versement" : "No payouts yet"}
          />
        </CardContent>
      </Card>

      <Modal
        open={!!statementOf}
        size="xl"
        onClose={() => setStatementOf(null)}
        title={statementOf ? `${fr ? "Relevé" : "Statement"} ${statementOf.reference} · ${statementOf.sellerName}` : ""}
        footer={
          <Button variant="secondary" size="sm" onClick={() => setStatementOf(null)}>
            {fr ? "Fermer" : "Close"}
          </Button>
        }
      >
        {statementOf && (
          <>
            <p className="text-slate-600">
              {formatCurrency(statementOf.amountUsd, locale)} · {METHOD_LABEL[statementOf.method]?.[fr ? "fr" : "en"] ?? statementOf.method} ·{" "}
              {statusLabel[statementOf.status]?.[fr ? "fr" : "en"] ?? statementOf.status} · {localDay(statementOf.createdAt)}
            </p>
            <PayoutStatement payoutId={statementOf.id} />
          </>
        )}
      </Modal>

      <Modal
        open={batchOpen}
        onClose={() => !batchBusy && setBatchOpen(false)}
        title={fr ? "Approuver les versements sélectionnés" : "Approve selected payouts"}
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setBatchOpen(false)} disabled={batchBusy}>
              {batchFailures.length ? (fr ? "Fermer" : "Close") : fr ? "Annuler" : "Cancel"}
            </Button>
            <Button variant="primary" size="sm" onClick={submitBatch} disabled={batchBusy || selected.length === 0}>
              {batchBusy ? "…" : fr ? `Confirmer ${selected.length} paiement(s)` : `Confirm ${selected.length} payment(s)`}
            </Button>
          </>
        }
      >
        <p>
          <span className="font-semibold">{selected.length}</span> {fr ? "versement(s)" : "payout(s)"} · {formatCurrency(selectedTotal, locale)}
        </p>
        <ul className="max-h-40 space-y-1 overflow-y-auto rounded-lg bg-slate-50 p-3 text-xs text-slate-700">
          {selected.map((p) => (
            <li key={p.id} className="flex justify-between gap-3">
              <span>
                {p.reference} · {p.sellerName} · {METHOD_LABEL[p.method]?.[fr ? "fr" : "en"] ?? p.method}
              </span>
              <span className="font-medium">{formatCurrency(p.amountUsd, locale)}</span>
            </li>
          ))}
        </ul>
        {needsBatchRef ? (
          <>
            <p className="text-slate-600">
              {fr
                ? "Effectuez d'abord les transferts réels, puis saisissez la référence du virement groupé : elle est enregistrée sur chaque versement bancaire / mobile money. Les versements portefeuille n'en ont pas besoin."
                : "Make the real transfers first, then enter the batch transfer reference: it is stored on every bank / mobile-money payout. Wallet payouts need none."}
            </p>
            <label className="block text-xs font-medium text-slate-500">
              {fr ? "Référence du virement groupé" : "Batch transfer reference"}
              <input
                className="input-premium mt-1 w-full px-4 py-2 text-sm"
                value={batchRef}
                onChange={(e) => setBatchRef(e.target.value)}
                placeholder={fr ? "ex. BATCH-2026-10-22" : "e.g. BATCH-2026-10-22"}
                autoFocus
              />
            </label>
          </>
        ) : (
          <p className="text-slate-600">
            {fr ? "Versements vers le portefeuille de l'appli : aucune référence requise, les soldes des vendeurs sont crédités." : "In-app wallet payouts: no reference needed, the sellers' wallets are credited."}
          </p>
        )}
        <ErrorNote message={batchError} />
        {batchFailures.length > 0 && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">
            <p className="font-semibold">{fr ? "Non approuvés (restent sélectionnés) :" : "Not approved (still selected):"}</p>
            <ul className="mt-1 list-disc pl-5">
              {batchFailures.map((f) => (
                <li key={f.reference}>
                  {f.reference} — {f.error}
                </li>
              ))}
            </ul>
          </div>
        )}
      </Modal>

      <Modal
        open={!!d}
        onClose={() => !busy && setDialog(null)}
        title={
          d?.kind === "send"
            ? fr ? "Envoyer avec pawaPay" : "Send with pawaPay"
            : d?.kind === "approve"
              ? fr ? "Approuver le versement" : "Approve payout"
              : fr ? "Rejeter le versement" : "Reject payout"
        }
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setDialog(null)} disabled={busy}>
              {fr ? "Annuler" : "Cancel"}
            </Button>
            <Button variant={d?.kind === "reject" ? "danger" : "primary"} size="sm" onClick={submit} disabled={busy}>
              {busy ? "…" : d?.kind === "send" ? (fr ? "Envoyer" : "Send") : d?.kind === "approve" ? (fr ? "Confirmer le paiement" : "Confirm payment") : fr ? "Rejeter" : "Reject"}
            </Button>
          </>
        }
      >
        {dp && (
          <>
            <p>
              <span className="font-semibold">{dp.reference}</span> · {dp.sellerName} · {formatCurrency(dp.amountUsd, locale)} ·{" "}
              {METHOD_LABEL[dp.method]?.[fr ? "fr" : "en"] ?? dp.method}
            </p>
            {d?.kind === "approve" && dp.method !== "wallet" && (
              <>
                <div className="rounded-lg bg-slate-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {fr ? "Destination du vendeur" : "Seller destination"}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap break-words font-mono text-sm text-slate-900">
                    {dp.account || (fr ? "Aucune destination enregistrée" : "No destination on record")}
                  </p>
                </div>
                <p className="text-slate-600">
                  {fr
                    ? "Effectuez d'abord le transfert réel vers cette destination, puis saisissez sa référence."
                    : "Make the real transfer to this destination first, then enter its reference."}
                </p>
                <label className="block text-xs font-medium text-slate-500">
                  {fr ? "Référence du transfert" : "Transfer reference"}
                  <input
                    className="input-premium mt-1 w-full px-4 py-2 text-sm"
                    value={providerRef}
                    onChange={(e) => setProviderRef(e.target.value)}
                    placeholder={fr ? "ex. TXN-123456" : "e.g. TXN-123456"}
                    autoFocus
                  />
                </label>
              </>
            )}
            {d?.kind === "send" && (
              <>
                <div className="rounded-lg bg-slate-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{fr ? "Numéro du vendeur" : "Seller's number"}</p>
                  <p className="mt-1 whitespace-pre-wrap break-words font-mono text-sm text-slate-900">{dp.account || "—"}</p>
                </div>
                <p className="text-slate-600">
                  {fr
                    ? "pawaPay envoie le montant sur ce numéro mobile money. Le versement reste « Envoi en cours » jusqu'à la confirmation, puis passe à « Payé » avec le reçu du réseau. En cas d'échec, il revient dans la file."
                    : "pawaPay sends the amount to this mobile-money number. The payout stays “Being sent” until it is confirmed, then becomes “Paid” with the network receipt. If it fails, it goes back in the queue."}
                </p>
              </>
            )}
            {d?.kind === "approve" && dp.method === "wallet" && (
              <p className="text-slate-600">
                {fr
                  ? "Versement vers le portefeuille de l'appli : aucune référence requise, le solde du vendeur est crédité."
                  : "In-app wallet payout: no reference needed, the seller's wallet is credited."}
              </p>
            )}
            {d?.kind === "reject" && (
              <label className="block text-xs font-medium text-slate-500">
                {fr ? "Motif (visible par le vendeur)" : "Reason (shown to the seller)"}
                <textarea
                  className="input-premium mt-1 w-full px-4 py-2 text-sm"
                  rows={3}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  autoFocus
                />
              </label>
            )}
            <ErrorNote message={error} />
          </>
        )}
      </Modal>
    </div>
  );
}
