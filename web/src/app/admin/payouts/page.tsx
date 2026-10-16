"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ListFilters, EMPTY_LIST_FILTERS } from "@/components/ui/list-filters";
import { Modal, ErrorNote } from "@/components/admin/modal";
import { NoticeBar } from "@/components/admin/demo-badge";
import { applyListFilters } from "@/lib/list-filter-utils";
import { useLocale } from "@/context/locale-context";
import { useRealtime } from "@/context/realtime-context";
import { adminBreadcrumb } from "@/lib/admin-i18n";
import { useToast } from "@/context/toast-context";
import { canMoveMoney, errMsg, useRole, useServerList, type PayoutRow } from "@/lib/admin-live";
import { socketClient } from "@/lib/realtime/socket-client";
import type { Seller } from "@/lib/realtime/types";
import { formatCurrency } from "@/lib/utils";

type PayoutStatus = PayoutRow["status"];

const STATUS_OPTIONS = [
  { value: "requested", label: "Requested", labelFr: "Demandé" },
  { value: "approved", label: "Approved", labelFr: "Approuvé" },
  { value: "paid", label: "Paid", labelFr: "Payé" },
  { value: "rejected", label: "Rejected", labelFr: "Rejeté" },
];

const statusVariant: Record<PayoutStatus, "success" | "warning" | "danger" | "info" | "default"> = {
  requested: "warning",
  approved: "info",
  rejected: "danger",
  paid: "success",
};

const statusLabel: Record<PayoutStatus, { en: string; fr: string }> = {
  requested: { en: "Requested", fr: "Demandé" },
  approved: { en: "Approved", fr: "Approuvé" },
  rejected: { en: "Rejected", fr: "Rejeté" },
  paid: { en: "Paid", fr: "Payé" },
};

const METHOD_LABEL: Record<string, { en: string; fr: string }> = {
  bank: { en: "Bank transfer", fr: "Virement bancaire" },
  mobile_money: { en: "Mobile money", fr: "Mobile money" },
  wallet: { en: "In-app wallet", fr: "Portefeuille appli" },
};

type Dialog = { kind: "approve" | "reject"; payout: PayoutRow } | null;

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
  const [filters, setFilters] = useState(EMPTY_LIST_FILTERS);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [providerRef, setProviderRef] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sellerLink = (sellerId: string) => {
    const s = sellers.find((x) => x.userId === sellerId || x.id === sellerId);
    return s ? `/admin/sellers/${s.id}` : null;
  };

  const rows = useMemo(
    () =>
      payouts.map((p) => ({
        ...p,
        requestedAt: p.createdAt.slice(0, 10),
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

  const pendingCount = payouts.filter((p) => p.status === "requested").length;

  function open(kind: "approve" | "reject", payout: PayoutRow) {
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
              {
                key: "reference",
                label: fr ? "Référence" : "Reference",
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
                      {row.providerRef ? <p className="mt-1 text-xs text-slate-400">ref {String(row.providerRef)}</p> : null}
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
                  if (p.status === "requested" && mayAct) {
                    return (
                      <div className="flex flex-wrap items-center gap-2">
                        <Button variant="approve" size="sm" onClick={() => open("approve", p)}>
                          {t("approve")}
                        </Button>
                        <Button variant="reject" size="sm" onClick={() => open("reject", p)}>
                          {t("reject")}
                        </Button>
                      </div>
                    );
                  }
                  const href = sellerLink(p.sellerId);
                  return href ? (
                    <Link href={href} className="text-sm text-[var(--primary)] hover:underline">
                      {t("view")}
                    </Link>
                  ) : (
                    <span className="text-sm text-slate-400">—</span>
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
        open={!!d}
        onClose={() => !busy && setDialog(null)}
        title={
          d?.kind === "approve"
            ? fr ? "Approuver le versement" : "Approve payout"
            : fr ? "Rejeter le versement" : "Reject payout"
        }
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setDialog(null)} disabled={busy}>
              {fr ? "Annuler" : "Cancel"}
            </Button>
            <Button variant={d?.kind === "reject" ? "danger" : "primary"} size="sm" onClick={submit} disabled={busy}>
              {busy ? "…" : d?.kind === "approve" ? (fr ? "Confirmer le paiement" : "Confirm payment") : fr ? "Rejeter" : "Reject"}
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
