"use client";

import { useMemo, useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/ui/stat-card";
import { DataTable } from "@/components/ui/data-table";
import { Truck, ArrowRight } from "lucide-react";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";
import { socketClient } from "@/lib/realtime/socket-client";
import { TRANSFER_STATUS, errorMessage, pick, shortDate, useOpsQuery, type TransferRow } from "@/lib/warehouse-live";
import { useWarehouseData } from "@/lib/warehouse";
import { useOpsBase } from "@/lib/ops-path";

export default function WarehouseTransfersPage() {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const { toast } = useToast();
  const base = useOpsBase();
  const { inventory } = useWarehouseData();
  const transfersQ = useOpsQuery<TransferRow[]>("warehouse:transfers", { initial: [] as TransferRow[], push: ["transfer:updated"] });
  const hubsQ = useOpsQuery<{ id: string; name: string }[]>("warehouse:hubs", { initial: [] });
  const [form, setForm] = useState({ fromHub: "", toHub: "", sku: "", productName: "", qty: "1" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requested = transfersQ.data.filter((r) => r.status === "requested").length;
  const inTransit = transfersQ.data.filter((r) => r.status === "in_transit").length;
  const units = transfersQ.data.reduce((n, r) => n + r.qty, 0);
  const skuOptions = useMemo(() => inventory.map((i) => ({ sku: i.sku, name: i.name })), [inventory]);

  function pickSku(sku: string) {
    const hit = skuOptions.find((o) => o.sku === sku);
    setForm((f) => ({ ...f, sku, productName: hit?.name ?? f.productName }));
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const qty = Number(form.qty);
    if (!form.fromHub.trim() || !form.toHub.trim() || !form.sku.trim() || !Number.isFinite(qty) || qty < 1) {
      setError(fr ? "Renseignez hub d'origine, hub de destination, SKU et quantité (≥ 1)." : "Enter from hub, to hub, SKU and a quantity of at least 1.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const created = await socketClient.request<TransferRow>("warehouse:createTransfer", {
        fromHub: form.fromHub.trim(),
        toHub: form.toHub.trim(),
        sku: form.sku.trim(),
        productName: form.productName.trim() || undefined,
        qty: Math.floor(qty),
      });
      toast(fr ? `Transfert ${created.reference} créé` : `Transfer ${created.reference} created`);
      setForm({ fromHub: "", toHub: "", sku: "", productName: "", qty: "1" });
      await transfersQ.reload();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={fr ? "Transferts inter-entrepôts" : "Inter-warehouse Transfers"}
        subtitle={fr ? "Demandes de transfert de stock entre hubs" : "Stock transfer requests between hubs"}
        breadcrumbs={[{ label: base.startsWith("/admin") ? "Admin" : (fr ? "Entrepôt" : "Warehouse"), href: base.startsWith("/admin") ? "/admin/fulfillment" : "/warehouse" }, { label: fr ? "Transferts" : "Transfers" }]}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard title={fr ? "Demandés" : "Requested"} value={requested} icon={Truck} />
        <StatCard title={fr ? "En transit" : "In transit"} value={inTransit} icon={Truck} />
        <StatCard title={fr ? "Unités concernées" : "Units across transfers"} value={units} icon={ArrowRight} />
      </div>

      <Card>
        <CardContent className="p-5">
          <h2 className="mb-3 font-semibold text-slate-900">{fr ? "Nouveau transfert" : "New transfer"}</h2>
          <form onSubmit={create} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <label className="block text-xs font-medium text-slate-600">
              {fr ? "Hub d'origine" : "From hub"}
              <input list="hub-names" className="input-premium mt-1 w-full px-3 py-2 text-sm" value={form.fromHub} onChange={(e) => setForm({ ...form, fromHub: e.target.value })} />
            </label>
            <label className="block text-xs font-medium text-slate-600">
              {fr ? "Hub de destination" : "To hub"}
              <input list="hub-names" className="input-premium mt-1 w-full px-3 py-2 text-sm" value={form.toHub} onChange={(e) => setForm({ ...form, toHub: e.target.value })} />
            </label>
            <label className="block text-xs font-medium text-slate-600">
              SKU
              <input list="sku-list" className="input-premium mt-1 w-full px-3 py-2 text-sm" value={form.sku} onChange={(e) => pickSku(e.target.value)} />
            </label>
            <label className="block text-xs font-medium text-slate-600">
              {fr ? "Produit" : "Product name"}
              <input className="input-premium mt-1 w-full px-3 py-2 text-sm" value={form.productName} onChange={(e) => setForm({ ...form, productName: e.target.value })} />
            </label>
            <label className="block text-xs font-medium text-slate-600">
              {fr ? "Quantité" : "Quantity"}
              <input type="number" min={1} className="input-premium mt-1 w-full px-3 py-2 text-sm" value={form.qty} onChange={(e) => setForm({ ...form, qty: e.target.value })} />
            </label>
            <datalist id="hub-names">
              {hubsQ.data.map((h) => <option key={h.id} value={h.name} />)}
            </datalist>
            <datalist id="sku-list">
              {skuOptions.map((o) => <option key={o.sku} value={o.sku}>{o.name}</option>)}
            </datalist>
            <div className="sm:col-span-2 lg:col-span-5">
              {error && <p role="alert" className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
              <button type="submit" disabled={busy} className="btn-primary rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-60">
                {busy ? (fr ? "Création…" : "Creating…") : (fr ? "Créer le transfert" : "Create transfer")}
              </button>
              <span className="ml-3 text-xs text-slate-500">
                {fr ? "Le serveur n'offre pas encore d'étape « arrivé / reçu » : le statut reste « demandé »." : "The server has no arrive / receive step yet: a new transfer stays at \"requested\"."}
              </span>
            </div>
          </form>
        </CardContent>
      </Card>

      {transfersQ.error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{transfersQ.error}</p>}
      <Card>
        <CardContent className="p-0">
          <DataTable
            emptyMessage={fr ? "Aucun transfert." : "No transfers yet."}
            columns={[
              { key: "reference", label: fr ? "Référence" : "Reference" },
              { key: "fromHub", label: fr ? "De" : "From" },
              { key: "toHub", label: fr ? "Vers" : "To" },
              { key: "sku", label: "SKU" },
              { key: "productName", label: fr ? "Produit" : "Product", render: (row) => String(row.productName ?? "—") },
              { key: "qty", label: fr ? "Qté" : "Qty" },
              { key: "status", label: fr ? "Statut" : "Status", render: (row) => <Badge variant="info">{pick(TRANSFER_STATUS[String(row.status)], fr, String(row.status))}</Badge> },
              { key: "createdAt", label: fr ? "Créé le" : "Created", render: (row) => shortDate(String(row.createdAt), locale) },
            ]}
            data={transfersQ.data as unknown as Record<string, unknown>[]}
          />
        </CardContent>
      </Card>
    </div>
  );
}
