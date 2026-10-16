"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { DetailGrid, DetailGridSection } from "@/components/ui/detail-grid";
import { InfoGrid } from "@/components/ui/info-grid";
import { Badge } from "@/components/ui/badge";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";
import { errorMessage, shortDate } from "@/lib/warehouse-live";
import { RETURN_PHASE_LABEL, useReturns } from "@/lib/warehouse-returns";
import { useOpsBase, useOpsPath } from "@/lib/ops-path";

export default function WarehouseReturnDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t, locale } = useLocale();
  const fr = locale === "fr";
  const { toast } = useToast();
  const ops = useOpsPath();
  const base = useOpsBase();
  const { returns, loading, error, markReceived } = useReturns();
  const [restock, setRestock] = useState(true);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const ret = returns.find((r) => r.id === id || r.reference === id);

  if (!ret) {
    return (
      <div className="p-8 text-center text-slate-500">
        {loading ? (fr ? "Chargement…" : "Loading…") : error ?? (fr ? "Retour introuvable" : "Return not found")}
      </div>
    );
  }

  const phase = RETURN_PHASE_LABEL[ret.phase];

  async function receive() {
    if (!ret || busy) return;
    setBusy(true);
    setActionError(null);
    try {
      await markReceived(ret.id, restock);
      toast(fr ? "Articles marqués comme reçus" : "Goods marked as received");
    } catch (e) {
      setActionError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={ret.reference}
        subtitle={`${fr ? "Commande" : "Order"} ${ret.orderReference} · ${fr ? phase.fr : phase.en}`}
        backHref={ops("/returns")}
        breadcrumbs={[
          { label: base.startsWith("/admin") ? "Admin" : (fr ? "Entrepôt" : "Warehouse"), href: base.startsWith("/admin") ? "/admin/fulfillment" : "/warehouse" },
          { label: t("returns"), href: ops("/returns") },
          { label: ret.reference },
        ]}
        actions={<Badge variant={ret.phase === "received" ? "info" : ret.phase === "awaiting_goods" ? "warning" : ret.phase === "rejected" ? "danger" : "success"}>{fr ? phase.fr : phase.en}</Badge>}
      />

      <DetailGrid>
        <DetailGridSection title={fr ? "Aperçu" : "Overview"}>
          <InfoGrid items={[
            { label: fr ? "ID retour" : "Return ID", value: ret.reference },
            { label: fr ? "Commande" : "Order", value: ret.orderReference },
            { label: t("customer"), value: ret.customerName },
            { label: fr ? "Demandé le" : "Requested", value: shortDate(ret.createdAt, locale) },
            { label: fr ? "Articles reçus le" : "Goods received", value: ret.receivedAt ? shortDate(ret.receivedAt, locale) : "—" },
            { label: fr ? "Motif" : "Reason", value: ret.reason, full: true },
          ]} />
        </DetailGridSection>

        <DetailGridSection title={fr ? "Action de l'entrepôt" : "Warehouse action"}>
          {ret.phase === "awaiting_goods" ? (
            <div className="space-y-3">
              <p className="text-sm text-slate-600">
                {fr
                  ? "Quand les articles retournés arrivent au hub, confirmez-le. Le remboursement ne peut être accordé qu'après cette étape."
                  : "When the returned goods reach the hub, confirm it here. A refund can only be granted after this step."}
              </p>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={restock} onChange={(e) => setRestock(e.target.checked)} />
                {fr ? "Remettre les articles en stock" : "Put the goods back into stock"}
              </label>
              {actionError && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{actionError}</p>}
              <button onClick={() => void receive()} disabled={busy} className="btn-primary rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-60">
                {busy ? "…" : (fr ? "Marquer les articles reçus" : "Mark goods received")}
              </button>
            </div>
          ) : (
            <p className="text-sm text-slate-600">
              {ret.phase === "received"
                ? (fr ? "Articles reçus. La décision de remboursement revient à la finance admin." : "Goods received. The refund decision belongs to admin finance.")
                : ret.phase === "refunded"
                  ? (fr ? "Dossier résolu par l'administration." : "Resolved by admin.")
                  : (fr ? "Demande rejetée par l'administration." : "Request rejected by admin.")}
            </p>
          )}
          {ret.resolution && <p className="mt-3 text-sm text-slate-500">{fr ? "Résolution : " : "Resolution: "}{ret.resolution}</p>}
          <p className="mt-3 text-xs text-slate-400">
            {fr ? "Approuver, rejeter ou rembourser un retour se fait dans le portail admin (finance)." : "Approving, rejecting or refunding a return is done in the admin portal (finance)."}
          </p>
        </DetailGridSection>
      </DetailGrid>
    </div>
  );
}
