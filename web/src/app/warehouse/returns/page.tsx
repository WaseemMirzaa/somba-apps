"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { WarehouseListPage } from "@/components/warehouse/list-page";
import { ListFilters, EMPTY_LIST_FILTERS } from "@/components/ui/list-filters";
import { applyListFilters } from "@/lib/list-filter-utils";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";
import { errorMessage, shortDate } from "@/lib/warehouse-live";
import { RETURN_PHASE_LABEL, RETURN_PHASE_OPTIONS, useReturns, type ReturnPhase } from "@/lib/warehouse-returns";
import { useOpsBase, useOpsPath } from "@/lib/ops-path";

const PHASE_VARIANT: Record<ReturnPhase, "warning" | "info" | "success" | "danger"> = {
  awaiting_goods: "warning",
  received: "info",
  refunded: "success",
  rejected: "danger",
};

export default function WarehouseReturnsPage() {
  const { t, locale } = useLocale();
  const fr = locale === "fr";
  const { toast } = useToast();
  const ops = useOpsPath();
  const base = useOpsBase();
  const { returns, error, markReceived } = useReturns();
  const [filters, setFilters] = useState(EMPTY_LIST_FILTERS);
  const [busyId, setBusyId] = useState<string | null>(null);

  const filtered = useMemo(
    () =>
      applyListFilters(returns, filters, {
        searchFields: ["reference", "orderReference", "customerName", "reason"],
        dateField: "createdAt",
        statusField: "phase",
      }),
    [returns, filters],
  );

  async function receive(id: string, reference: string) {
    setBusyId(id);
    try {
      await markReceived(id, true);
      toast(fr ? `Retour ${reference} : articles reçus` : `Return ${reference}: goods received`);
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <WarehouseListPage
      title={t("returns")}
      subtitle={
        fr
          ? "Demandes de retour en direct. Confirmez la réception des articles ; la décision de remboursement appartient à la finance admin."
          : "Live return requests. Confirm the goods arrived; the refund decision belongs to admin finance."
      }
      breadcrumbs={[{ label: base.startsWith("/admin") ? "Admin" : (fr ? "Entrepôt" : "Warehouse"), href: base.startsWith("/admin") ? "/admin/fulfillment" : "/warehouse" }, { label: t("returns") }]}
      filters={
        <div className="space-y-3">
          {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <ListFilters
            values={filters}
            onChange={setFilters}
            statusOptions={RETURN_PHASE_OPTIONS}
            searchPlaceholder={fr ? "Référence, commande, client…" : "Reference, order, customer…"}
          />
        </div>
      }
      columns={[
        { key: "reference", label: fr ? "ID retour" : "Return ID", render: (row) => (
          <Link href={ops(`/returns/${row.id}`)} className="font-medium text-[var(--primary)] hover:underline">{String(row.reference)}</Link>
        )},
        { key: "orderReference", label: fr ? "ID commande" : "Order ID" },
        { key: "customerName", label: t("customer") },
        { key: "reason", label: fr ? "Motif" : "Reason" },
        { key: "createdAt", label: fr ? "Demandé le" : "Requested", render: (row) => shortDate(String(row.createdAt), locale) },
        { key: "phase", label: t("status"), render: (row) => {
          const p = String(row.phase) as ReturnPhase;
          return <Badge variant={PHASE_VARIANT[p]}>{fr ? RETURN_PHASE_LABEL[p].fr : RETURN_PHASE_LABEL[p].en}</Badge>;
        }},
        { key: "actions", label: t("action"), render: (row) => (
          <div className="flex gap-3 text-xs">
            <Link href={ops(`/returns/${row.id}`)} className="text-[var(--primary)] hover:underline">{t("view")}</Link>
            {row.phase === "awaiting_goods" && (
              <button
                disabled={busyId === row.id}
                onClick={() => void receive(String(row.id), String(row.reference))}
                className="text-emerald-600 hover:underline disabled:opacity-50"
              >
                {busyId === row.id ? "…" : (fr ? "Marquer reçu" : "Mark goods received")}
              </button>
            )}
          </div>
        )},
      ]}
      data={filtered as unknown as Record<string, unknown>[]}
    />
  );
}
