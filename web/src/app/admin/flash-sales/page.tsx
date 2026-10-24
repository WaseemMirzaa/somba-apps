"use client";

import { useMemo, useState } from "react";
import { localDateTime } from "@/lib/dates";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { ErrorNote, Modal } from "@/components/admin/modal";
import { SectionError, SectionLoading } from "@/components/admin/query-state";
import { useRealtime } from "@/context/realtime-context";
import { useToast } from "@/context/toast-context";
import { useLocale } from "@/context/locale-context";
import { adminBreadcrumb } from "@/lib/admin-i18n";
import { errMsg, useServerList, type FlashSaleServerRow } from "@/lib/admin-live";
import { socketClient } from "@/lib/realtime/socket-client";
import { formatCurrency } from "@/lib/utils";
import { autoTranslateHint, localized, pickText } from "@/lib/i18n-fields";

const SALE_STATUS_EN: Record<string, string> = { active: "Active", scheduled: "Scheduled", ended: "Ended" };
const SALE_STATUS_FR: Record<string, string> = { active: "En cours", scheduled: "Planifiée", ended: "Terminée" };

function saleState(fs: FlashSaleServerRow): "active" | "scheduled" | "ended" {
  const now = Date.now();
  const start = fs.startsAt ? new Date(fs.startsAt).getTime() : null;
  const end = fs.endsAt ? new Date(fs.endsAt).getTime() : null;
  if (end !== null && !Number.isNaN(end) && end < now) return "ended";
  if (start !== null && !Number.isNaN(start) && start > now) return "scheduled";
  // A sale the server deactivated (ended early) no longer runs.
  if (fs.active === false) return "ended";
  return "active";
}

function fmt(iso: string | null): string {
  return iso ? localDateTime(iso) : "—";
}

export default function AdminFlashSalesPage() {
  const { toast } = useToast();
  const { locale } = useLocale();
  const fr = locale === "fr";
  const rt = useRealtime();
  const { items: sales, reload, error: loadError, loading } = useServerList<FlashSaleServerRow>("flashsales:list", {
    body: { all: true },
    pushEvents: ["flashsale:updated"],
  });
  const liveProducts = useMemo(() => rt.products.filter((p) => p.status === "live"), [rt.products]);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ title: "", titleFr: "", productId: "", flashPrice: "", startsAt: "", endsAt: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [endTarget, setEndTarget] = useState<FlashSaleServerRow | null>(null);
  const [ending, setEnding] = useState(false);
  const [endError, setEndError] = useState<string | null>(null);

  const product = liveProducts.find((p) => p.id === form.productId);
  // Normal price (the server reports `originalPrice` while a sale already runs).
  const basePrice = product ? (product.originalPrice ?? product.price) : null;
  const flash = Number(form.flashPrice);
  const discount = basePrice && flash > 0 && flash < basePrice ? Math.round((1 - flash / basePrice) * 100) : 0;

  async function save() {
    if ((!form.title.trim() && !form.titleFr.trim()) || !product) {
      setError(fr ? "Un titre (anglais ou français) et un produit sont requis." : "A title (English or French) and a product are required.");
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
        // A language left empty is not sent: the platform translates it from the other one.
        ...(form.title.trim() ? { title: form.title.trim() } : {}),
        ...(form.titleFr.trim() ? { titleFr: form.titleFr.trim() } : {}),
        productId: product.id,
        productName: product.name,
        flashPrice: flash,
        discount,
        startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : undefined,
        endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : undefined,
      });
      await reload();
      setShowCreate(false);
      setForm({ title: "", titleFr: "", productId: "", flashPrice: "", startsAt: "", endsAt: "" });
      toast(fr ? "Vente flash créée" : "Flash sale created", "success");
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setSaving(false);
    }
  }

  async function endNow() {
    if (!endTarget) return;
    setEnding(true);
    setEndError(null);
    try {
      await socketClient.request("flashsales:end", { id: endTarget.id });
      await reload();
      toast(fr ? "Vente flash terminée" : "Flash sale ended", "success");
      setEndTarget(null);
    } catch (e) {
      setEndError(errMsg(e));
    } finally {
      setEnding(false);
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
            <div className="grid gap-4 sm:grid-cols-2">
              <input className="input-premium w-full px-4 py-2.5 text-sm" placeholder={fr ? "Titre de la vente (EN)" : "Sale title (EN)"} aria-label={fr ? "Titre de la vente (EN)" : "Sale title (EN)"} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
              <input className="input-premium w-full px-4 py-2.5 text-sm" placeholder={fr ? "Titre de la vente (FR)" : "Sale title (FR)"} aria-label={fr ? "Titre de la vente (FR)" : "Sale title (FR)"} value={form.titleFr} onChange={(e) => setForm({ ...form, titleFr: e.target.value })} />
              <p className="text-xs text-slate-500 sm:col-span-2">{autoTranslateHint(fr)}</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="text-xs font-medium text-slate-500">{fr ? "Produit" : "Product"}</label>
                <select className="input-premium mt-1 w-full px-4 py-2.5 text-sm" value={form.productId} onChange={(e) => setForm({ ...form, productId: e.target.value })}>
                  <option value="">{fr ? "Choisir un produit…" : "Choose a product…"}</option>
                  {liveProducts.map((p) => (
                    <option key={p.id} value={p.id}>{pickText(fr, p.name, p.nameFr)} — {formatCurrency(p.originalPrice ?? p.price, locale)}</option>
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

      <Card>
        <CardContent className="p-0">
          <DataTable
            emptyMessage={loading ? (fr ? "Chargement…" : "Loading…") : fr ? "Aucune vente flash." : "No flash sales yet."}
            data={sales as unknown as Record<string, unknown>[]}
            columns={[
              {
                key: "title",
                label: fr ? "Vente flash" : "Flash sale",
                render: (row) => {
                  const fs = row as unknown as FlashSaleServerRow;
                  return (
                    <div>
                      <p className="font-semibold text-slate-900">{localized(fs, "title", fr)}</p>
                      <p className="text-xs text-slate-500">{localized(fs, "productName", fr)}</p>
                    </div>
                  );
                },
              },
              {
                key: "startsAt",
                label: fr ? "Période" : "Window",
                render: (row) => {
                  const fs = row as unknown as FlashSaleServerRow;
                  return <span className="text-xs text-slate-500">{fmt(fs.startsAt)} → {fmt(fs.endsAt)}</span>;
                },
              },
              {
                key: "flashPrice",
                label: fr ? "Prix flash" : "Flash price",
                render: (row) => {
                  const fs = row as unknown as FlashSaleServerRow;
                  return <span>{formatCurrency(fs.flashPrice, locale)} · {fr ? `${fs.discount} % de remise` : `${fs.discount}% off`}</span>;
                },
              },
              {
                key: "status",
                label: fr ? "Statut" : "Status",
                render: (row) => {
                  const st = saleState(row as unknown as FlashSaleServerRow);
                  return (
                    <Badge variant={st === "active" ? "success" : st === "scheduled" ? "warning" : "default"}>
                      {fr ? SALE_STATUS_FR[st] : SALE_STATUS_EN[st]}
                    </Badge>
                  );
                },
              },
              {
                key: "actions",
                label: "",
                render: (row) => {
                  const fs = row as unknown as FlashSaleServerRow;
                  if (saleState(fs) === "ended") return <span className="text-sm text-slate-400">—</span>;
                  return (
                    <Button size="sm" variant="reject" className="whitespace-nowrap" onClick={() => { setEndError(null); setEndTarget(fs); }}>
                      {fr ? "Terminer maintenant" : "End now"}
                    </Button>
                  );
                },
              },
            ]}
          />
        </CardContent>
      </Card>

      <Modal
        open={!!endTarget}
        onClose={() => !ending && setEndTarget(null)}
        title={fr ? "Terminer la vente flash" : "End flash sale"}
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setEndTarget(null)} disabled={ending}>{fr ? "Annuler" : "Cancel"}</Button>
            <Button variant="danger" size="sm" onClick={endNow} disabled={ending}>{ending ? "…" : fr ? "Terminer maintenant" : "End now"}</Button>
          </>
        }
      >
        {endTarget && (
          <>
            <p>
              {fr
                ? `Terminer « ${localized(endTarget, "title", true)} » maintenant ? Le prix normal de ${localized(endTarget, "productName", true)} est rétabli immédiatement.`
                : `End "${localized(endTarget, "title", false)}" now? The normal price of ${localized(endTarget, "productName", false)} is restored immediately.`}
            </p>
            <ErrorNote message={endError} />
          </>
        )}
      </Modal>
    </div>
  );
}
