"use client";

import { useMemo, useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ErrorNote } from "@/components/admin/modal";
import { SectionError, SectionLoading } from "@/components/admin/query-state";
import { useRealtime } from "@/context/realtime-context";
import { useToast } from "@/context/toast-context";
import { useLocale } from "@/context/locale-context";
import { adminBreadcrumb } from "@/lib/admin-i18n";
import { errMsg, useServerList, type FlashSaleServerRow } from "@/lib/admin-live";
import { socketClient } from "@/lib/realtime/socket-client";
import { formatCurrency } from "@/lib/utils";

const SALE_STATUS_FR: Record<string, string> = { active: "En cours", scheduled: "Planifiée", ended: "Terminée" };

function saleState(fs: FlashSaleServerRow): "active" | "scheduled" | "ended" {
  const now = Date.now();
  const start = fs.startsAt ? new Date(fs.startsAt).getTime() : null;
  const end = fs.endsAt ? new Date(fs.endsAt).getTime() : null;
  if (end !== null && !Number.isNaN(end) && end < now) return "ended";
  if (start !== null && !Number.isNaN(start) && start > now) return "scheduled";
  return "active";
}

function fmt(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toISOString().slice(0, 16).replace("T", " ");
}

export default function AdminFlashSalesPage() {
  const { toast } = useToast();
  const { locale } = useLocale();
  const fr = locale === "fr";
  const rt = useRealtime();
  const { items: sales, reload, error: loadError, loading } = useServerList<FlashSaleServerRow>("flashsales:list", {
    pushEvents: ["flashsale:updated"],
  });
  const liveProducts = useMemo(() => rt.products.filter((p) => p.status === "live"), [rt.products]);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ title: "", productId: "", flashPrice: "", startsAt: "", endsAt: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const product = liveProducts.find((p) => p.id === form.productId);
  // Normal price (the server reports `originalPrice` while a sale already runs).
  const basePrice = product ? (product.originalPrice ?? product.price) : null;
  const flash = Number(form.flashPrice);
  const discount = basePrice && flash > 0 && flash < basePrice ? Math.round((1 - flash / basePrice) * 100) : 0;

  async function save() {
    if (!form.title.trim() || !product) {
      setError(fr ? "Titre et produit requis." : "Title and product are required.");
      return;
    }
    if (!(flash > 0)) {
      setError(fr ? "Saisissez un prix flash valide." : "Enter a valid flash price.");
      return;
    }
    if (form.startsAt && form.endsAt && new Date(form.endsAt) <= new Date(form.startsAt)) {
      setError(fr ? "La fin doit être après le début." : "The end must be after the start.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await socketClient.request("flashsales:create", {
        title: form.title.trim(),
        productId: product.id,
        productName: product.name,
        flashPrice: flash,
        discount,
        startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : undefined,
        endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : undefined,
      });
      await reload();
      setShowCreate(false);
      setForm({ title: "", productId: "", flashPrice: "", startsAt: "", endsAt: "" });
      toast(fr ? "Vente flash créée" : "Flash sale created", "success");
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={fr ? "Ventes flash" : "Flash Sales"}
        subtitle={fr ? "Le prix flash est appliqué par le serveur pendant la fenêtre choisie" : "The server applies the flash price during the chosen window"}
        breadcrumbs={[adminBreadcrumb(locale), { label: fr ? "Ventes flash" : "Flash Sales" }]}
        actions={<Button size="sm" onClick={() => { setShowCreate((s) => !s); setError(null); }}>{fr ? "Créer une vente flash" : "Create flash sale"}</Button>}
      />

      {loadError && <SectionError message={loadError} onRetry={reload} />}
      {loading && !loadError && <SectionLoading />}

      {showCreate && (
        <Card>
          <CardContent className="space-y-4 p-6">
            <input className="input-premium w-full px-4 py-2.5 text-sm" placeholder={fr ? "Titre de la vente" : "Sale title"} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="text-xs font-medium text-slate-500">{fr ? "Produit" : "Product"}</label>
                <select className="input-premium mt-1 w-full px-4 py-2.5 text-sm" value={form.productId} onChange={(e) => setForm({ ...form, productId: e.target.value })}>
                  <option value="">{fr ? "Choisir un produit…" : "Choose a product…"}</option>
                  {liveProducts.map((p) => (
                    <option key={p.id} value={p.id}>{p.name} — {formatCurrency(p.originalPrice ?? p.price, locale)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500">
                  {fr ? "Prix flash (USD)" : "Flash price (USD)"}
                  {basePrice ? ` — ${fr ? "remise" : "discount"} ${discount}%` : ""}
                </label>
                <input className="input-premium mt-1 w-full px-4 py-2.5 text-sm" inputMode="decimal" value={form.flashPrice} onChange={(e) => setForm({ ...form, flashPrice: e.target.value })} />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500">{fr ? "Début" : "Starts"}</label>
                <input type="datetime-local" className="input-premium mt-1 w-full px-4 py-2.5 text-sm" value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500">{fr ? "Fin" : "Ends"}</label>
                <input type="datetime-local" className="input-premium mt-1 w-full px-4 py-2.5 text-sm" value={form.endsAt} onChange={(e) => setForm({ ...form, endsAt: e.target.value })} />
              </div>
            </div>
            <ErrorNote message={error} />
            <Button onClick={save} disabled={saving}>{saving ? "…" : fr ? "Enregistrer la vente flash" : "Save flash sale"}</Button>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {sales.length === 0 && <p className="text-sm text-slate-400">{fr ? "Aucune vente flash." : "No flash sales yet."}</p>}
        {sales.map((fs) => {
          const st = saleState(fs);
          return (
            <Card key={fs.id}>
              <CardContent className="p-6">
                <div className="flex justify-between gap-3">
                  <h3 className="font-semibold">{fs.title}</h3>
                  <Badge variant={st === "active" ? "success" : st === "scheduled" ? "warning" : "default"}>{fr ? SALE_STATUS_FR[st] : st}</Badge>
                </div>
                <p className="mt-2 text-sm text-slate-700">{fs.productName}</p>
                <p className="mt-1 text-sm text-slate-500">{fmt(fs.startsAt)} → {fmt(fs.endsAt)}</p>
                <p className="mt-1 text-sm">{formatCurrency(fs.flashPrice, locale)} · {fr ? `${fs.discount} % de remise` : `${fs.discount}% off`}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
