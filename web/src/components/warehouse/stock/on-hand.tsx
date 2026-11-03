"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Boxes, Layers } from "lucide-react";
import { CameraButton } from "@/components/warehouse/camera-scanner";
import { OpsError } from "@/components/warehouse/ops-state";
import { BinChips } from "@/components/warehouse/stock/shared";
import { Card, CardContent } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { StatCard } from "@/components/ui/stat-card";
import { useLocale } from "@/context/locale-context";
import { useOpsPath } from "@/lib/ops-path";
import { useStockQuery, type OnHand } from "@/lib/stock";
import { classifyScan } from "@/lib/stock-codes";
import { pickText } from "@/lib/i18n-fields";

const EMPTY: OnHand = { total: 0, units: 0, rows: [] };

/** What the warehouse holds, by SKU (product option) and bin. Live: it reloads when any stock movement is recorded. */
export function OnHandTab() {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const ops = useOpsPath();
  const [text, setText] = useState("");
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState(100);
  useEffect(() => {
    const t = setTimeout(() => setSearch(text.trim()), 250);
    return () => clearTimeout(t);
  }, [text]);
  const q = useStockQuery<OnHand>("stock:onHand", { search, limit }, EMPTY);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <StatCard title={fr ? "Unités en stock" : "Units on hand"} value={q.data.units} icon={Boxes} />
        <StatCard title={fr ? "Références (SKU)" : "SKUs on hand"} value={q.data.total} icon={Layers} />
      </div>
      <div className="flex items-center gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="input-premium w-full max-w-sm px-3 py-2 text-sm"
          placeholder={fr ? "SKU ou nom du produit…" : "SKU or product name…"}
          aria-label={fr ? "Rechercher dans le stock" : "Search the stock"}
        />
        <CameraButton
          title={fr ? "Scanner un produit" : "Scan a product"}
          hint={fr ? "Cadrez l'étiquette SKU." : "Point at the SKU label."}
          onCode={(raw) => {
            const c = classifyScan(raw);
            setText(c.kind === "sku" ? c.value : c.value || raw);
            return { text: c.value || raw };
          }}
        />
      </div>
      {q.error && <OpsError message={q.error} onRetry={() => void q.reload()} />}
      <Card>
        <CardContent className="p-0">
          <DataTable
            emptyMessage={q.loading ? (fr ? "Chargement…" : "Loading…") : search ? (fr ? "Aucun stock ne correspond." : "No stock matches.") : fr ? "Aucun stock enregistré. Réceptionnez un colis ou saisissez une réception." : "No stock recorded yet. Put a parcel away or enter a receipt."}
            columns={[
              {
                key: "sku",
                label: "SKU",
                render: (r) => (
                  <Link href={ops(`/inventory/${encodeURIComponent(String(r.sku))}`)} className="font-medium text-[var(--primary)] hover:underline">
                    {String(r.sku)}
                  </Link>
                ),
              },
              {
                key: "name",
                label: fr ? "Produit" : "Product",
                primary: true,
                render: (r) => (
                  <span>
                    {pickText(fr, String(r.name), String(r.nameFr))}
                    {r.variant !== "Default" && <span className="ml-2 text-xs text-slate-500">{String(r.variant)}</span>}
                  </span>
                ),
              },
              { key: "onHand", label: fr ? "En stock" : "On hand", render: (r) => <span className="font-semibold tabular-nums">{String(r.onHand)}</span> },
              { key: "bins", label: fr ? "Emplacements" : "Bins", render: (r) => <BinChips bins={r.bins as { binId: string; code: string; qty: number }[]} /> },
            ]}
            data={q.data.rows as unknown as Record<string, unknown>[]}
          />
        </CardContent>
      </Card>
      {q.data.total > q.data.rows.length && (
        <div className="text-center">
          <button type="button" onClick={() => setLimit((n) => n + 100)} className="rounded-xl border border-[var(--border-strong)] bg-white px-5 py-2.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50">
            {fr ? "Voir plus" : "Show more"}
          </button>
        </div>
      )}
    </div>
  );
}
