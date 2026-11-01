"use client";

/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { DetailGrid, DetailGridSection } from "@/components/ui/detail-grid";
import { InfoGrid } from "@/components/ui/info-grid";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DisputeActions } from "@/components/admin/dispute-actions";
import { SectionError, SectionLoading } from "@/components/admin/query-state";
import { useLocale } from "@/context/locale-context";
import { useRealtime } from "@/context/realtime-context";
import { useToast } from "@/context/toast-context";
import { localDateTime } from "@/lib/dates";
import { adminBreadcrumb } from "@/lib/admin-i18n";
import {
  DISPUTE_CATEGORY_LABEL,
  DISPUTE_OUTCOME_LABEL,
  DISPUTE_STAGE_BADGE,
  DISPUTE_STAGE_LABEL,
  DISPUTE_STATUS_BADGE,
  DISPUTE_STATUS_LABEL,
  DISPUTE_TYPE_LABEL,
  ITEM_CONDITION_LABEL,
  assetUrl,
  errMsg,
  lab,
  orderStatusLabel,
  type DisputeRow,
} from "@/lib/admin-live";
import { LEG_STATUS, pickL } from "@/lib/logistics";
import type { DisputeMessage } from "@/lib/realtime/types";
import { socketClient } from "@/lib/realtime/socket-client";
import { formatCurrency } from "@/lib/utils";
import { resolutionText } from "@/lib/i18n-fields";

/** Photos / evidence thumbnails that open full size. */
export function Photos({ urls, fr }: { urls: string[] | undefined; fr: boolean }) {
  if (!urls || urls.length === 0) return <p className="text-sm text-slate-400">{fr ? "Aucune photo" : "No photos"}</p>;
  return (
    <div className="flex flex-wrap gap-2">
      {urls.map((u) => (
        <a key={u} href={assetUrl(u)} target="_blank" rel="noreferrer" className="block h-20 w-20 overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
          <img src={assetUrl(u)} alt={fr ? "Pièce jointe" : "Attachment"} className="h-full w-full object-cover" loading="lazy" />
        </a>
      ))}
    </div>
  );
}

/**
 * One return or dispute, live: loads the full record with its thread (`disputes:get`) and follows
 * `dispute:updated` / `dispute:message`. Used by /admin/disputes/[id] and /admin/returns/[id].
 */
export function DisputeCase({ id, kind }: { id: string; kind: "dispute" | "return" }) {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const rt = useRealtime();
  const { toast } = useToast();
  const [d, setD] = useState<DisputeRow | null>(null);
  const [messages, setMessages] = useState<DisputeMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
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
        const row = await socketClient.request<DisputeRow>("disputes:get", { id });
        if (!alive) return;
        setD(row);
        setMessages(row.messages ?? []);
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
  }, [connected, id, attempt]);

  useEffect(() => {
    if (!connected) return;
    const sock = socketClient.current;
    if (!sock) return;
    const onUpdated = (row: DisputeRow) => {
      if (row.id === d?.id || row.id === id) setD((cur) => (cur ? { ...cur, ...row, messages: cur.messages } : row));
    };
    const onMessage = (p: { disputeId: string; message: DisputeMessage }) => {
      if (p.disputeId !== (d?.id ?? id)) return;
      setMessages((cur) => (cur.some((m) => m.id === p.message.id) ? cur : [...cur, p.message]));
    };
    sock.on("dispute:updated", onUpdated);
    sock.on("dispute:message", onMessage);
    return () => {
      sock.off("dispute:updated", onUpdated);
      sock.off("dispute:message", onMessage);
    };
  }, [connected, d?.id, id]);

  const order = d ? rt.orders.find((o) => o.id === d.orderId) : undefined;
  // The legs of this case (return pickup and the way back), from the live delivery feed.
  const legs = useMemo(
    () => (d ? rt.deliveries.filter((t) => t.disputeId === d.id || (d.pickupTaskId && t.id === d.pickupTaskId)) : []),
    [rt.deliveries, d],
  );

  async function send() {
    const text = reply.trim();
    if (!d) return;
    if (!text) {
      toast(fr ? "Écrivez d'abord un message." : "Write a message first.", "error");
      return;
    }
    setSending(true);
    try {
      const m = await socketClient.request<DisputeMessage>("disputes:reply", { id: d.id, message: text });
      setMessages((cur) => (cur.some((x) => x.id === m.id) ? cur : [...cur, m]));
      setReply("");
      toast(fr ? "Message envoyé" : "Message sent", "success");
    } catch (e) {
      toast(errMsg(e), "error");
    } finally {
      setSending(false);
    }
  }

  const back = kind === "return" ? "/admin/returns" : "/admin/disputes";
  const kindLabel = kind === "return" ? (fr ? "Retours" : "Returns") : fr ? "Litiges" : "Disputes";

  if (loading) return <SectionLoading className="min-h-[40vh]" />;
  if (error && !d) return <SectionError message={error} onRetry={load} />;
  if (!d) return <div className="p-8 text-center text-slate-500">{fr ? "Dossier introuvable" : "Case not found"}</div>;

  const statusLabel = lab(DISPUTE_STATUS_LABEL, d.status, fr);
  const typeLabel = lab(DISPUTE_TYPE_LABEL, d.type, fr);
  const stage = d.status === "open" ? d.stage : "closed";
  const due = d.sellerDueAt ? localDateTime(d.sellerDueAt) : "—";

  return (
    <div className="space-y-6">
      <PageHeader
        title={d.reference}
        subtitle={`${localDateTime(d.createdAt).slice(0, 10)} · ${typeLabel} · ${statusLabel} · ${d.orderReference}`}
        backHref={back}
        breadcrumbs={[adminBreadcrumb(locale), { label: kindLabel, href: back }, { label: d.reference }]}
        actions={
          <>
            {stage && <Badge variant={DISPUTE_STAGE_BADGE[stage] ?? "default"}>{lab(DISPUTE_STAGE_LABEL, stage, fr)}</Badge>}
            <Badge variant={DISPUTE_STATUS_BADGE[d.status] ?? "default"}>{statusLabel}</Badge>
          </>
        }
      />

      <div className={`rounded-2xl border-2 p-5 shadow-sm ${d.type === "return" ? "border-amber-200 bg-amber-50" : "border-red-200 bg-gradient-to-r from-red-50 to-orange-50"}`}>
        <div className="flex items-start gap-3">
          <AlertCircle className={`mt-0.5 h-5 w-5 shrink-0 ${d.type === "return" ? "text-amber-600" : "text-red-600"}`} />
          <div className="min-w-0">
            <p className={`text-xs font-bold uppercase tracking-wide ${d.type === "return" ? "text-amber-700" : "text-red-700"}`}>
              {d.type === "return" ? (fr ? "Motif du retour" : "Return reason") : fr ? "Motif du litige" : "Dispute reason"}
              {d.category ? ` · ${lab(DISPUTE_CATEGORY_LABEL, d.category, fr)}` : ""}
            </p>
            <p className="mt-1 whitespace-pre-wrap text-lg font-bold text-slate-900">{d.reason}</p>
          </div>
        </div>
      </div>

      <DetailGrid>
        <DetailGridSection title={fr ? "Informations" : "Information"}>
          <InfoGrid
            items={[
              { label: fr ? "Référence" : "Reference", value: d.reference },
              { label: "Type", value: typeLabel },
              { label: fr ? "Ouvert le" : "Opened", value: localDateTime(d.createdAt) },
              { label: fr ? "Étape" : "Stage", value: lab(DISPUTE_STAGE_LABEL, stage, fr) },
              ...(d.type === "return"
                ? [{ label: fr ? "Marchandise reçue" : "Goods received", value: d.receivedAt ? localDateTime(d.receivedAt) : fr ? "Pas encore" : "Not yet" }]
                : []),
              ...(d.outcome ? [{ label: fr ? "Issue" : "Outcome", value: lab(DISPUTE_OUTCOME_LABEL, d.outcome, fr) }] : []),
              ...(d.refundUsd ? [{ label: fr ? "Remboursé" : "Refunded", value: `${formatCurrency(d.refundUsd, locale)} → ${d.refundTo === "phone" ? (fr ? "téléphone" : "phone") : fr ? "portefeuille" : "wallet"}` }] : []),
              ...(d.resolution ? [{ label: fr ? "Décision" : "Resolution", value: resolutionText(d, fr), full: true }] : []),
            ]}
          />
        </DetailGridSection>

        <DetailGridSection title={fr ? "Vendeur" : "Seller"}>
          <InfoGrid
            items={[
              { label: fr ? "Réponse attendue avant" : "Answer due", value: due },
              { label: fr ? "A répondu le" : "Answered", value: d.sellerRespondedAt ? localDateTime(d.sellerRespondedAt) : fr ? "Pas encore" : "Not yet" },
              ...(d.escalatedAt ? [{ label: fr ? "Escaladé le" : "Escalated", value: localDateTime(d.escalatedAt) }] : []),
              ...(d.sellerReason ? [{ label: fr ? "Motif du vendeur" : "Seller's reason", value: d.sellerReason, full: true }] : []),
            ]}
          />
        </DetailGridSection>

        <DetailGridSection title={fr ? "Commande et client" : "Order and customer"}>
          <InfoGrid
            items={[
              { label: fr ? "Commande" : "Order", value: <Link href={`/admin/orders/${d.orderId}`} className="text-[var(--primary)] hover:underline">{d.orderReference}</Link> },
              { label: fr ? "Client" : "Customer", value: <Link href={`/admin/customers/${d.customerId}`} className="text-[var(--primary)] hover:underline">{d.customerName}</Link> },
              ...(order
                ? [
                    { label: fr ? "Statut de la commande" : "Order status", value: orderStatusLabel(order.status, fr) },
                    { label: fr ? "Montant" : "Amount", value: formatCurrency(order.totalUsd, locale) },
                  ]
                : []),
            ]}
          />
        </DetailGridSection>

        <DetailGridSection title={fr ? "Articles concernés" : "Items concerned"} span={3}>
          {d.items && d.items.length > 0 ? (
            <DataTable
              columns={[
                { key: "productName", label: fr ? "Article" : "Item", render: (r) => <span className="font-medium text-slate-800">{fr && r.productNameFr ? String(r.productNameFr) : String(r.productName)}{r.variant && r.variant !== "Default" ? ` · ${fr && r.variantFr ? String(r.variantFr) : String(r.variant)}` : ""}</span> },
                { key: "qty", label: fr ? "Qté" : "Qty" },
                { key: "unitPriceUsd", label: fr ? "Prix unitaire" : "Unit price", render: (r) => formatCurrency(Number(r.unitPriceUsd), locale) },
                { key: "refundUsd", label: fr ? "Remboursé" : "Refunded", render: (r) => formatCurrency(Number(r.refundUsd ?? 0), locale) },
                { key: "condition", label: fr ? "État à la réception" : "Condition on arrival", render: (r) => (r.condition ? <Badge variant={r.condition === "resellable" ? "success" : "warning"}>{lab(ITEM_CONDITION_LABEL, String(r.condition), fr)}</Badge> : <span className="text-slate-400">—</span>) },
                { key: "restockedQty", label: fr ? "Remis en stock" : "Restocked" },
              ]}
              data={d.items as unknown as Record<string, unknown>[]}
            />
          ) : (
            <p className="text-sm text-slate-500">{fr ? "Toute la commande (aucune ligne précisée)." : "The whole order (no lines named)."}</p>
          )}
        </DetailGridSection>

        <DetailGridSection title={fr ? "Photos du client" : "Customer photos"} span={2}>
          <Photos urls={d.attachments} fr={fr} />
        </DetailGridSection>

        <DetailGridSection title={fr ? "Collecte et retour" : "Pickup and return legs"}>
          {legs.length === 0 ? (
            <p className="text-sm text-slate-500">{fr ? "Aucune collecte planifiée pour l'instant." : "No pickup planned yet."}</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {legs.map((l) => (
                <li key={l.id} className="flex items-center justify-between gap-2">
                  <span className="text-slate-700">{l.kind === "return_pickup" ? (fr ? "Collecte chez le client" : "Pickup from the customer") : l.kind === "return_transfer" ? (fr ? "Transfert vers l'entrepôt d'origine" : "Transfer to the origin warehouse") : l.kind === "return_to_seller" ? (fr ? "Retour au vendeur" : "Back to the seller") : (l.kind ?? "")}</span>
                  <Badge variant={l.status === "delivered" ? "success" : l.status === "failed" ? "danger" : "info"}>{pickL(LEG_STATUS[l.status], fr, l.status)}</Badge>
                </li>
              ))}
            </ul>
          )}
        </DetailGridSection>

        <DetailGridSection title={fr ? "Décision" : "Decision"} span={3}>
          <DisputeActions dispute={d} />
        </DetailGridSection>

        <DetailGridSection title={fr ? `Échanges (${messages.length})` : `Conversation (${messages.length})`} span={3}>
          <div className="space-y-3">
            {messages.length === 0 && <p className="text-sm text-slate-400">{fr ? "Aucun message pour l'instant." : "No messages yet."}</p>}
            {messages.map((m) => (
              <div key={m.id} className={`rounded-xl border p-3 text-sm ${m.role === "customer" ? "border-slate-200 bg-white" : m.role === "seller" ? "border-amber-200 bg-amber-50/50" : "border-blue-100 bg-blue-50/50"}`}>
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                  <span className="font-semibold text-slate-700">
                    {m.authorName}{" "}
                    <Badge variant={m.role === "customer" ? "default" : m.role === "seller" ? "warning" : "info"}>
                      {m.role === "customer" ? (fr ? "Client" : "Customer") : m.role === "seller" ? (fr ? "Vendeur" : "Seller") : "Somba"}
                    </Badge>
                  </span>
                  <span>{localDateTime(m.createdAt)}</span>
                </div>
                <p className="mt-1.5 whitespace-pre-wrap text-slate-800">{m.text}</p>
                {m.attachments?.length > 0 && <div className="mt-2"><Photos urls={m.attachments} fr={fr} /></div>}
              </div>
            ))}
            {d.status === "open" && (
              <div className="space-y-2">
                <textarea
                  className="input-premium w-full px-4 py-2 text-sm"
                  rows={2}
                  placeholder={fr ? "Répondre au client et au vendeur…" : "Reply to the customer and the seller…"}
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                />
                <Button size="sm" onClick={send} disabled={sending}>{sending ? "…" : fr ? "Envoyer" : "Send"}</Button>
              </div>
            )}
          </div>
        </DetailGridSection>
      </DetailGrid>
    </div>
  );
}
