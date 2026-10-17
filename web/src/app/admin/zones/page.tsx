"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/ui/stat-card";
import { Tabs } from "@/components/ui/tabs";
import { DataTable } from "@/components/ui/data-table";
import { NoticeBar } from "@/components/admin/notice-bar";
import { MapPin, Package, Layers, Plus } from "lucide-react";
import { useLocale } from "@/context/locale-context";
import { useRealtime } from "@/context/realtime-context";
import { useToast } from "@/context/toast-context";
import { adminBreadcrumb } from "@/lib/admin-i18n";
import { errMsg, type ZoneSetting } from "@/lib/admin-live";
import { socketClient } from "@/lib/realtime/socket-client";
import { useSocketQuery, type WarehouseStats } from "@/lib/admin-stats";
import { SectionError } from "@/components/admin/query-state";

function slug(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 36);
}

function parseZones(raw: string | undefined): ZoneSetting[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw) as ZoneSetting[];
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export default function AdminZonesPage() {
  const { t, locale } = useLocale();
  const { toast } = useToast();
  const rt = useRealtime();
  const fr = locale === "fr";
  const [saved, setSaved] = useState<ZoneSetting[]>([]);
  const [zones, setZones] = useState<ZoneSetting[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [city, setCity] = useState("all");
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: "", nameFr: "", city: "Kinshasa", fee: "3" });
  const [feeText, setFeeText] = useState<Record<string, string>>({});
  const wh = useSocketQuery<WarehouseStats>("analytics:warehouse");
  const parcelsByZone = useMemo(() => new Map((wh.data?.byZone ?? []).map((z) => [z.zoneId, z])), [wh.data]);

  const load = useCallback(async () => {
    try {
      const all = await socketClient.request<Record<string, string>>("settings:get");
      const z = parseZones(all.deliveryZones);
      setSaved(z);
      setZones(z);
      setLoadError(null);
      setLoaded(true);
    } catch (e) {
      setLoadError(errMsg(e));
    }
  }, []);

  useEffect(() => {
    if (rt.status !== "connected") return;
    void load();
  }, [rt.status, load]);

  const cities = useMemo(() => Array.from(new Set(zones.map((z) => z.city))), [zones]);
  const filtered = city === "all" ? zones : zones.filter((z) => z.city === city);
  const dirty = JSON.stringify(zones) !== JSON.stringify(saved);
  const parcels30 = (wh.data?.byZone ?? []).reduce((sum, z) => sum + z.parcels, 0);

  function addZone() {
    const name = form.name.trim();
    if (!name) {
      toast(fr ? "Nom de zone requis" : "Zone name required", "error");
      return;
    }
    const id = slug(`${form.city}-${name}`) || `z-${Date.now()}`;
    if (zones.some((z) => z.id === id)) {
      toast(fr ? "Cette zone existe déjà" : "That zone already exists", "error");
      return;
    }
    const fee = Number(form.fee);
    if (!Number.isFinite(fee) || fee < 0) {
      toast(fr ? "Frais invalides" : "Invalid fee", "error");
      return;
    }
    setZones((z) => [...z, { id, name, nameFr: form.nameFr.trim() || undefined, city: form.city.trim() || "-", feeUsd: fee }]);
    setForm({ name: "", nameFr: "", city: form.city, fee: "3" });
    setShowAdd(false);
  }

  async function save() {
    setSaving(true);
    setSaveError(null);
    try {
      const all = await socketClient.request<Record<string, string>>("settings:set", {
        key: "deliveryZones",
        value: JSON.stringify(zones),
      });
      const z = parseZones(all.deliveryZones);
      setSaved(z);
      setZones(z);
      setFeeText({});
      toast(fr ? "Zones enregistrées" : "Zones saved", "success");
    } catch (e) {
      setSaveError(errMsg(e));
    } finally {
      setSaving(false);
    }
  }

  function setFee(id: string, value: string) {
    setFeeText((f) => ({ ...f, [id]: value }));
    setZones((zs) => zs.map((z) => (z.id === id ? { ...z, feeUsd: value === "" ? 0 : Number(value) } : z)));
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={fr ? "Zones de livraison" : "Delivery Zones"}
        subtitle={fr ? "Zones et frais enregistrés sur le serveur (réglage deliveryZones)" : "Zones and fees stored on the server (deliveryZones setting)"}
        breadcrumbs={[adminBreadcrumb(locale), { label: t("zones") }]}
        actions={
          <>
            <Button size="sm" variant="secondary" onClick={() => setShowAdd((s) => !s)}>
              <Plus className="h-4 w-4" />
              {fr ? "Ajouter une zone" : "Add zone"}
            </Button>
            <Button size="sm" onClick={save} disabled={!dirty || saving}>
              {saving ? "…" : fr ? "Enregistrer les zones" : "Save zones"}
            </Button>
          </>
        }
      />

      {loadError && <SectionError message={loadError} onRetry={load} />}
      {saveError && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {saveError}
        </p>
      )}
      {dirty && (
        <NoticeBar tone="warn">
          {fr ? "Modifications non enregistrées — cliquez sur « Enregistrer les zones »." : "Unsaved changes — click “Save zones” to apply them."}
        </NoticeBar>
      )}
      <NoticeBar>
        {fr
          ? "Les frais par zone sont ceux facturés au paiement. Les colis par zone viennent des livraisons réelles des 30 derniers jours."
          : "Zone fees are what shoppers are charged at checkout. Parcel counts per zone come from real deliveries over the last 30 days."}
      </NoticeBar>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard title={fr ? "Zones" : "Zones"} value={zones.length} icon={MapPin} />
        <StatCard title={fr ? "Villes" : "Cities"} value={cities.length} icon={Layers} />
        <StatCard title={fr ? "Colis (30 j)" : "Parcels (30 d)"} value={wh.data ? parcels30 : "…"} icon={Package} />
      </div>

      {showAdd && (
        <div className="card-premium grid gap-3 p-5 sm:grid-cols-5">
          <input className="input-premium px-4 py-2 text-sm" placeholder={fr ? "Nom (ex. Ngaba)" : "Name (e.g. Ngaba)"} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input className="input-premium px-4 py-2 text-sm" placeholder={fr ? "Nom FR (optionnel)" : "French name (optional)"} value={form.nameFr} onChange={(e) => setForm({ ...form, nameFr: e.target.value })} />
          <input className="input-premium px-4 py-2 text-sm" list="zone-cities" placeholder={fr ? "Ville" : "City"} value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
          <datalist id="zone-cities">
            {cities.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
          <input className="input-premium px-4 py-2 text-sm" inputMode="decimal" placeholder={fr ? "Frais $" : "Fee $"} value={form.fee} onChange={(e) => setForm({ ...form, fee: e.target.value })} />
          <Button size="sm" onClick={addZone}>{fr ? "Ajouter" : "Add"}</Button>
        </div>
      )}

      <div className="card-premium overflow-hidden">
        <Tabs
          className="m-4"
          active={city}
          onChange={setCity}
          tabs={[{ id: "all", label: fr ? "Toutes" : "All" }, ...cities.map((c) => ({ id: c, label: c }))]}
        />
        {!loaded && !loadError ? (
          <p className="px-5 py-8 text-center text-sm text-slate-400">{fr ? "Chargement…" : "Loading…"}</p>
        ) : (
          <DataTable
            data={filtered as unknown as Record<string, unknown>[]}
            emptyMessage={fr ? "Aucune zone — ajoutez-en une puis enregistrez." : "No zones yet — add one, then save."}
            columns={[
              { key: "name", label: fr ? "Zone" : "Zone", render: (row) => <span className="font-semibold text-slate-900">{fr ? String((row as unknown as ZoneSetting).nameFr || row.name) : String(row.name)}</span> },
              { key: "city", label: fr ? "Ville" : "City" },
              {
                key: "feeUsd",
                label: fr ? "Frais ($)" : "Fee ($)",
                render: (row) => (
                  <input
                    className="input-premium w-24 px-3 py-1 text-sm"
                    inputMode="decimal"
                    value={feeText[String(row.id)] ?? String(row.feeUsd)}
                    onChange={(e) => setFee(String(row.id), e.target.value)}
                  />
                ),
              },
              {
                key: "parcels",
                label: fr ? "Colis (30 j)" : "Parcels (30 d)",
                render: (row) => {
                  const z = parcelsByZone.get(String(row.id));
                  if (wh.error) return <span className="text-xs text-red-600">—</span>;
                  if (!wh.data) return <span className="text-xs text-slate-400">…</span>;
                  return z ? (
                    <span className="text-xs text-slate-600">{z.parcels} · {z.delivered} {fr ? "livrés" : "delivered"}{z.failed ? ` · ${z.failed} ${fr ? "échecs" : "failed"}` : ""}</span>
                  ) : (
                    <span className="text-xs text-slate-400">0</span>
                  );
                },
              },
              {
                key: "actions",
                label: "",
                render: (row) => (
                  <button onClick={() => setZones((zs) => zs.filter((z) => z.id !== row.id))} className="text-sm font-medium text-red-600 hover:underline">
                    {fr ? "Retirer" : "Remove"}
                  </button>
                ),
              },
            ]}
          />
        )}
      </div>
    </div>
  );
}
