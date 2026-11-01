"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DetailGrid, DetailGridSection } from "@/components/ui/detail-grid";
import { InfoGrid } from "@/components/ui/info-grid";
import { ListFilters, EMPTY_LIST_FILTERS } from "@/components/ui/list-filters";
import { ErrorNote, Modal } from "@/components/admin/modal";
import { SectionError, SectionLoading } from "@/components/admin/query-state";
import { Photos } from "@/components/admin/dispute-case";
import { applyListFilters } from "@/lib/list-filter-utils";
import { useLocale } from "@/context/locale-context";
import { useRealtime } from "@/context/realtime-context";
import { useToast } from "@/context/toast-context";
import { adminBreadcrumb } from "@/lib/admin-i18n";
import { localDateTime, localDay } from "@/lib/dates";
import { errMsg, useServerList } from "@/lib/admin-live";
import { LEG_KIND, LEG_STATUS, pickL } from "@/lib/logistics";
import { replacementConditionLabel } from "@/lib/replacement-condition";
import { socketClient } from "@/lib/realtime/socket-client";
import { formatCurrency } from "@/lib/utils";

export type AfterSaleKind = "replacement" | "exchange";

interface Row {
  id: string;
  reference: string;
  orderId: string;
  orderReference: string;
  customerName: string;
  sellerId: string | null;
  status: string;
  qty?: number;
  reason: string | null;
  sellerDueAt: string | null;
  sellerRespondedAt: string | null;
  sellerReason: string | null;
  stockTaken: number;
  deliveryTaskId: string | null;
  deliveredAt: string | null;
  createdAt: string;
  updatedAt: string;
  // replacement
  productName?: string;
  productNameFr?: string | null;
  condition?: string | null;
  variant?: string | null;
  attachments?: string[];
  dispatchStatus?: string | null;
  disputeId?: string | null;
  // exchange
  fromName?: string;
  fromNameFr?: string | null;
  fromVariant?: string | null;
  toName?: string;
  toNameFr?: string | null;
  toVariant?: string | null;
  priceDiffUsd?: number;
  heldUsd?: number;
}

type L2 = { en: string; fr: string };
const STATUS: Record<string, L2> = {
  requested: { en: "Waiting for the seller", fr: "En attente du vendeur" },
  approved: { en: "Approved", fr: "Approuvé" },
  received: { en: "Old item received", fr: "Ancien article reçu" },
  allocated: { en: "New unit allocated", fr: "Nouvelle unité allouée" },
  ready: { en: "New item ready", fr: "Nouvel article prêt" },
  dispatched: { en: "On its way", fr: "En route" },
  delivered: { en: "Delivered", fr: "Livré" },
  rejected: { en: "Rejected", fr: "Rejeté" },
};
const STATUS_BADGE: Record<string, "success" | "warning" | "danger" | "info" | "default"> = {
  requested: "warning",
  approved: "info",
  received: "info",
  allocated: "info",
  ready: "info",
  dispatched: "info",
  delivered: "success",
  rejected: "danger",
};
const lbl = (s: string, fr: boolean) => (STATUS[s] ? (fr ? STATUS[s].fr : STATUS[s].en) : s);

const CFG = {
  replacement: {
    list: "replacements:list",
    get: "replacements:get",
    respond: "replacements:respond",
    push: "replacement:updated",
    base: "/admin/replacements",
    titleEn: "Replacements",
    titleFr: "Remplacements",
    subEn: "Replacement requests: the seller approves, the destination warehouse delivers the new unit and collects the old one",
    subFr: "Demandes de remplacement : le vendeur approuve, l'entrepôt de destination livre la nouvelle unité et reprend l'ancienne",
    notFoundEn: "Replacement not found",
    notFoundFr: "Remplacement introuvable",
  },
  exchange: {
    list: "exchanges:list",
    get: "exchanges:get",
    respond: "exchanges:respond",
    push: "exchange:updated",
    base: "/admin/exchanges",
    titleEn: "Exchanges",
    titleFr: "Échanges",
    subEn: "Exchange requests: another option or item, with the price difference charged to or refunded from the wallet",
    subFr: "Demandes d'échange : une autre option ou un autre article, avec différence de prix débitée ou remboursée sur le portefeuille",
    notFoundEn: "Exchange not found",
    notFoundFr: "Échange introuvable",
  },
} as const;

const itemOf = (r: Row, kind: AfterSaleKind, fr: boolean) =>
  kind === "replacement"
    ? `${fr && r.productNameFr ? r.productNameFr : r.productName}${r.variant ? ` · ${r.variant}` : ""}`
    : `${fr && r.fromNameFr ? r.fromNameFr : r.fromName}${r.fromVariant ? ` (${r.fromVariant})` : ""} → ${fr && r.toNameFr ? r.toNameFr : r.toName}${r.toVariant ? ` (${r.toVariant})` : ""}`;

export function AfterSaleList({ kind }: { kind: AfterSaleKind }) {
  const c = CFG[kind];
  const { locale } = useLocale();
  const fr = locale === "fr";
  const [filters, setFilters] = useState(EMPTY_LIST_FILTERS);
  const { items, loading, error, reload } = useServerList<Row>(c.list, { pushEvents: [c.push] });
  const rows = useMemo(
    () => [...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((r) => ({ ...r, date: localDay(r.createdAt), item: itemOf(r, kind, fr) })),
    [items, kind, fr],
  );
  const filtered = useMemo(
    () => applyListFilters(rows, filters, { searchFields: ["reference", "orderReference", "customerName", "item", "reason"], dateField: "date", statusField: "status" }),
    [rows, filters],
  );
  const statusOptions = Object.entries(STATUS).map(([value, l]) => ({ value, label: l.en, labelFr: l.fr }));

  return (
    <div className="space-y-6">
      <PageHeader
        title={fr ? c.titleFr : c.titleEn}
        subtitle={fr ? c.subFr : c.subEn}
        breadcrumbs={[adminBreadcrumb(locale), { label: fr ? c.titleFr : c.titleEn }]}
      />
      <ListFilters
        values={filters}
        onChange={setFilters}
        statusOptions={statusOptions}
        searchPlaceholder={fr ? "Référence, commande, client, article…" : "Reference, order, customer, item…"}
      />
      {error && <SectionError message={error} onRetry={reload} />}
      <Card>
        <CardContent className="p-0">
          {loading && !error ? (
            <SectionLoading />
          ) : (
            <DataTable
              emptyMessage={fr ? "Aucune demande" : "No requests"}
              columns={[
                { key: "reference", label: fr ? "Référence" : "Reference", render: (r) => <Link href={`${c.base}/${r.id}`} className="font-medium text-[var(--primary)] hover:underline">{String(r.reference)}</Link> },
                { key: "orderReference", label: fr ? "Commande" : "Order", render: (r) => <Link href={`/admin/orders/${r.orderId}`} className="text-[var(--primary)] hover:underline">{String(r.orderReference)}</Link> },
                { key: "customerName", label: fr ? "Client" : "Customer" },
                { key: "item", label: fr ? "Article" : "Item", render: (r) => <span className="line-clamp-2 max-w-[18rem] text-slate-700">{String(r.item)}</span> },
                ...(kind === "exchange"
                  ? [{ key: "priceDiffUsd", label: fr ? "Différence" : "Difference", render: (r: Record<string, unknown>) => { const d = Number(r.priceDiffUsd ?? 0); return <span className={d > 0 ? "text-red-600" : d < 0 ? "text-emerald-600" : "text-slate-500"}>{d > 0 ? "+" : ""}{formatCurrency(d, locale)}</span>; } }]
                  : [{ key: "condition", label: fr ? "État" : "Condition", render: (r: Record<string, unknown>) => replacementConditionLabel(r.condition as string | null | undefined, fr) }]),
                { key: "status", label: fr ? "Statut" : "Status", render: (r) => <Badge variant={STATUS_BADGE[String(r.status)] ?? "default"}>{lbl(String(r.status), fr)}</Badge> },
                { key: "date", label: "Date" },
                { key: "actions", label: "", render: (r) => <Link href={`${c.base}/${r.id}`} className="text-sm text-[var(--primary)] hover:underline">{fr ? "Voir" : "View"}</Link> },
              ]}
              data={filtered as unknown as Record<string, unknown>[]}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export function AfterSaleDetail({ id, kind }: { id: string; kind: AfterSaleKind }) {
  const c = CFG[kind];
  const { locale } = useLocale();
  const fr = locale === "fr";
  const rt = useRealtime();
  const { toast } = useToast();
  const [r, setR] = useState<Row | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<"approve" | "reject" | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const connected = rt.status === "connected";

  const [attempt, setAttempt] = useState(0);
  const load = useCallback(() => {
    setLoading(true);
    setAttempt((n) => n + 1);
  }, []);

  useEffect(() => {
    if (!connected) return;
    let alive = true;
    (async () => {
      try {
        const row = await socketClient.request<Row>(c.get, { id });
        if (!alive) return;
        setR(row);
        setError(null);
      } catch (e) {
        if (alive) setError(errMsg(e));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [connected, c.get, id, attempt]);

  useEffect(() => {
    if (!connected) return;
    const sock = socketClient.current;
    const h = (row: Row) => row.id === id && setR((cur) => ({ ...(cur ?? row), ...row }));
    sock?.on(c.push, h);
    return () => {
      sock?.off(c.push, h);
    };
  }, [connected, c.push, id]);

  const legs = useMemo(
    () =>
      r
        ? rt.deliveries.filter((t) => (kind === "replacement" ? t.replacementId === r.id : t.exchangeId === r.id) || t.id === r.deliveryTaskId).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        : [],
    [rt.deliveries, r, kind],
  );

  async function submit() {
    if (!r || !mode) return;
    const text = reason.trim();
    if (mode === "reject" && text.length < 5) {
      setFormError(fr ? `Expliquez au client pourquoi vous refusez ${kind === "replacement" ? "ce remplacement" : "cet échange"} (5 caractères minimum).` : `Tell the customer why you are rejecting this ${kind} (at least 5 characters).`);
      return;
    }
    setBusy(true);
    setFormError(null);
    try {
      const row = await socketClient.request<Row>(c.respond, { id: r.id, approve: mode === "approve", ...(text ? { reason: text } : {}) });
      setR((cur) => ({ ...(cur ?? row), ...row }));
      toast(mode === "approve" ? (fr ? "Demande approuvée : une livraison est planifiée" : "Approved: a delivery is being planned") : fr ? "Demande rejetée" : "Request rejected", "success");
      setMode(null);
      setReason("");
    } catch (e) {
      setFormError(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <SectionLoading className="min-h-[40vh]" />;
  if (error && !r) return <SectionError message={error} onRetry={load} />;
  if (!r) return <div className="p-8 text-center text-slate-500">{fr ? c.notFoundFr : c.notFoundEn}</div>;

  const diff = Number(r.priceDiffUsd ?? 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title={r.reference}
        subtitle={`${localDay(r.createdAt)} · ${lbl(r.status, fr)} · ${r.orderReference}`}
        backHref={c.base}
        breadcrumbs={[adminBreadcrumb(locale), { label: fr ? c.titleFr : c.titleEn, href: c.base }, { label: r.reference }]}
        actions={<Badge variant={STATUS_BADGE[r.status] ?? "default"}>{lbl(r.status, fr)}</Badge>}
      />

      <DetailGrid>
        <DetailGridSection title={fr ? "Demande" : "Request"}>
          <InfoGrid
            items={[
              { label: fr ? "Référence" : "Reference", value: r.reference },
              { label: fr ? "Commande" : "Order", value: <Link href={`/admin/orders/${r.orderId}`} className="text-[var(--primary)] hover:underline">{r.orderReference}</Link> },
              { label: fr ? "Client" : "Customer", value: r.customerName },
              { label: fr ? "Article" : "Item", value: itemOf(r, kind, fr), full: true },
              { label: fr ? "Quantité" : "Quantity", value: r.qty ?? 1 },
              ...(r.condition ? [{ label: fr ? "État" : "Condition", value: replacementConditionLabel(r.condition, fr) }] : []),
              { label: fr ? "Motif" : "Reason", value: r.reason ?? "—", full: true },
            ]}
          />
        </DetailGridSection>

        <DetailGridSection title={fr ? "Vendeur" : "Seller"}>
          <InfoGrid
            items={[
              { label: fr ? "Réponse attendue avant" : "Answer due", value: r.sellerDueAt ? localDateTime(r.sellerDueAt) : "—" },
              { label: fr ? "A répondu le" : "Answered", value: r.sellerRespondedAt ? localDateTime(r.sellerRespondedAt) : fr ? "Pas encore" : "Not yet" },
              { label: fr ? "Stock pris chez le vendeur" : "Stock taken from the seller", value: r.stockTaken ?? 0 },
              ...(r.sellerReason ? [{ label: fr ? "Motif du vendeur" : "Seller's reason", value: r.sellerReason, full: true }] : []),
            ]}
          />
        </DetailGridSection>

        {kind === "exchange" ? (
          <DetailGridSection title={fr ? "Argent" : "Money"}>
            <InfoGrid
              items={[
                { label: fr ? "Différence de prix" : "Price difference", value: <span className={diff > 0 ? "text-red-600" : diff < 0 ? "text-emerald-600" : ""}>{diff > 0 ? "+" : ""}{formatCurrency(diff, locale)}</span> },
                { label: fr ? "Retenu sur le portefeuille" : "Held from the wallet", value: formatCurrency(r.heldUsd ?? 0, locale) },
              ]}
            />
            <p className="mt-2 text-xs text-slate-500">
              {fr ? "Une différence positive est retenue à la demande ; une différence négative est remboursée à la livraison." : "A positive difference is held when the request is filed; a negative one is refunded on delivery."}
            </p>
          </DetailGridSection>
        ) : (
          <DetailGridSection title={fr ? "Photos du client" : "Customer photos"}>
            <Photos urls={r.attachments} fr={fr} />
          </DetailGridSection>
        )}

        <DetailGridSection title={fr ? "Livraison" : "Delivery"} span={2}>
          <InfoGrid
            items={[
              { label: fr ? "Livré le" : "Delivered", value: r.deliveredAt ? localDateTime(r.deliveredAt) : "—" },
            ]}
          />
          {legs.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500">{fr ? "Aucun trajet pour l'instant : ils sont créés à l'approbation." : "No legs yet: they are created on approval."}</p>
          ) : (
            <ul className="mt-3 space-y-2 text-sm">
              {legs.map((l) => (
                <li key={l.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 px-3 py-2">
                  <span className="text-slate-700">{pickL(LEG_KIND[l.kind ?? "delivery"], fr)}{l.collectOld ? (fr ? " · reprend l'ancien article" : " · collects the old item") : ""}</span>
                  <Badge variant={l.status === "delivered" ? "success" : l.status === "failed" ? "danger" : "info"}>{pickL(LEG_STATUS[l.status], fr, l.status)}</Badge>
                </li>
              ))}
            </ul>
          )}
        </DetailGridSection>

        <DetailGridSection title={fr ? "Décision" : "Decision"} span={3}>
          {r.status === "requested" ? (
            <div className="space-y-2">
              <p className="text-sm text-slate-600">
                {fr ? "Le vendeur répond normalement. Le support peut répondre à sa place si le délai est dépassé." : "The seller normally answers. Support can answer for them when the time has passed."}
              </p>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => { setMode("approve"); setReason(""); setFormError(null); }}>{fr ? "Approuver" : "Approve"}</Button>
                <Button size="sm" variant="reject" onClick={() => { setMode("reject"); setReason(""); setFormError(null); }}>{fr ? "Rejeter" : "Reject"}</Button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-500">{r.status === "rejected" ? (fr ? "Demande rejetée." : "Request rejected.") : fr ? "La suite suit les trajets de livraison ci-dessus." : "What happens next follows the delivery legs above."}</p>
          )}
        </DetailGridSection>
      </DetailGrid>

      <Modal
        open={mode !== null}
        onClose={() => !busy && setMode(null)}
        title={mode === "approve" ? (fr ? "Approuver la demande" : "Approve the request") : fr ? "Rejeter la demande" : "Reject the request"}
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setMode(null)} disabled={busy}>{fr ? "Annuler" : "Cancel"}</Button>
            <Button size="sm" variant={mode === "reject" ? "danger" : "primary"} onClick={submit} disabled={busy}>{busy ? "…" : fr ? "Confirmer" : "Confirm"}</Button>
          </>
        }
      >
        <p>{r.reference} · {r.orderReference}</p>
        {mode === "approve" && (
          <p className="text-slate-600">{fr ? "Le stock est pris chez le vendeur et la livraison part de son entrepôt (l'ancien article est repris au passage)." : "Stock is taken from the seller and the delivery leaves from their warehouse (the old item is collected on the way)."}</p>
        )}
        <label className="block text-xs font-medium text-slate-500">
          {mode === "reject" ? (fr ? "Motif (obligatoire, vu par le client)" : "Reason (required, shown to the customer)") : fr ? "Message (optionnel)" : "Message (optional)"}
          <textarea className="input-premium mt-1 w-full px-4 py-2 text-sm" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
        </label>
        <ErrorNote message={formError} />
      </Modal>
    </div>
  );
}
