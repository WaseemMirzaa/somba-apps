"use client";

import { useState } from "react";
import { OpsError } from "@/components/warehouse/ops-state";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { useLocale } from "@/context/locale-context";
import { fmtDateTime } from "@/lib/logistics";
import { useStockQuery, type LedgerLine } from "@/lib/stock";
import { KIND_TEXT, REASON_TEXT, movementText, signed, wording } from "@/lib/stock-codes";
import { pickText } from "@/lib/i18n-fields";

const KINDS = ["", "receive", "move", "count", "stock_out"] as const;

/** The ledger: every receipt, move, count and stock-out, newest first. `productId` / `variant` narrow it to one SKU. */
export function HistoryList({ productId, variant, showFilters = true }: { productId?: string; variant?: string; showFilters?: boolean }) {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const [kind, setKind] = useState("");
  const [limit, setLimit] = useState(100);
  const q = useStockQuery<LedgerLine[]>("stock:history", { ...(productId ? { productId } : {}), ...(variant ? { variant } : {}), ...(kind ? { kind } : {}), limit }, []);

  return (
    <div className="space-y-4">
      {showFilters && (
        <div className="flex flex-wrap items-center gap-3">
          <select value={kind} onChange={(e) => setKind(e.target.value)} className="input-premium px-3 py-2 text-sm" aria-label={fr ? "Type de mouvement" : "Movement type"}>
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {k ? wording(KIND_TEXT, k, fr) : fr ? "Tous les mouvements" : "All movements"}
              </option>
            ))}
          </select>
        </div>
      )}
      {q.error && <OpsError message={q.error} onRetry={() => void q.reload()} />}
      <Card>
        <CardContent className="p-0">
          <DataTable
            emptyMessage={q.loading ? (fr ? "Chargement…" : "Loading…") : fr ? "Aucun mouvement enregistré." : "No movements recorded yet."}
            columns={[
              { key: "createdAt", label: fr ? "Quand" : "When", hideOnMobile: true, render: (r) => <span className="whitespace-nowrap text-slate-600">{fmtDateTime(String(r.createdAt), fr)}</span> },
              {
                key: "kind",
                label: fr ? "Mouvement" : "Movement",
                primary: true,
                render: (r) => (
                  <span className="flex flex-wrap items-center gap-2">
                    <Badge variant={r.kind === "receive" ? "success" : r.kind === "stock_out" ? "danger" : r.kind === "count" ? "warning" : "info"}>{wording(KIND_TEXT, String(r.kind), fr)}</Badge>
                    <span className="text-slate-700">{movementText(r as unknown as LedgerLine, fr)}</span>
                  </span>
                ),
              },
              ...(productId
                ? []
                : [
                    {
                      key: "name",
                      label: fr ? "Produit" : "Product",
                      render: (r: Record<string, unknown>) => (
                        <span>
                          {pickText(fr, String(r.name), String(r.nameFr))}
                          {r.variant !== "Default" && <span className="ml-2 text-xs text-slate-500">{String(r.variant)}</span>}
                          <span className="ml-2 text-xs text-slate-400">{String(r.sku)}</span>
                        </span>
                      ),
                    },
                  ]),
              { key: "reason", label: fr ? "Motif" : "Reason", render: (r) => <span>{wording(REASON_TEXT, String(r.reason), fr)}{r.note ? <span className="ml-2 text-xs text-slate-500">{String(r.note)}</span> : null}</span> },
              { key: "delta", label: fr ? "Effet" : "Effect", render: (r) => <span className="font-semibold tabular-nums">{signed(Number(r.delta))}</span> },
              { key: "onHandAfter", label: fr ? "Stock après" : "On hand after", hideOnMobile: true },
              { key: "actorName", label: fr ? "Par" : "By", hideOnMobile: true, render: (r) => String(r.actorName ?? "—") },
            ]}
            data={q.data as unknown as Record<string, unknown>[]}
          />
        </CardContent>
      </Card>
      {q.data.length >= limit && (
        <div className="text-center">
          <button type="button" onClick={() => setLimit((n) => n + 100)} className="rounded-xl border border-[var(--border-strong)] bg-white px-5 py-2.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50">
            {fr ? "Voir plus" : "Show more"}
          </button>
        </div>
      )}
    </div>
  );
}

export function HistoryTab() {
  return <HistoryList />;
}
