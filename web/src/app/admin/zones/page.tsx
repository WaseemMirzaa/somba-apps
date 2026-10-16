"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/ui/stat-card";
import { Tabs } from "@/components/ui/tabs";
import { DataTable } from "@/components/ui/data-table";
import { NoticeBar } from "@/components/admin/demo-badge";
import { MapPin, Bike, Layers, Plus, X } from "lucide-react";
import { useLocale } from "@/context/locale-context";
import { useRealtime } from "@/context/realtime-context";
import { useToast } from "@/context/toast-context";
import { adminBreadcrumb } from "@/lib/admin-i18n";
import { errMsg, type ZoneSetting } from "@/lib/admin-live";
import { socketClient } from "@/lib/realtime/socket-client";
import { ZONE_RIDERS } from "@/lib/zones-admin";

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
  // Rider planning notes: local to this browser, never sent to the server.
  const [feeText, setFeeText] = useState<Record<string, string>>({});
  const [plan, setPlan] = useState<Record<string, string[]>>({});
  const [riderNames, setRiderNames] = useState<string[]>([...ZONE_RIDERS]);

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
    socketClient
      .request<{ id: string; name: string }[]>("warehouse:riders")
      .then((r) => {
        if (Array.isArray(r) && r.length) setRiderNames(r.map((x) => x.name));
      })
      .catch(() => {});
  }, [rt.status, load]);

  const cities = useMemo(() => Array.from(new Set(zones.map((z) => z.city))), [zones]);
  const filtered = city === "all" ? zones : zones.filter((z) => z.city === city);
  const dirty = JSON.stringify(zones) !== JSON.stringify(saved);
  const assignedRiders = new Set(Object.values(plan).flat()).size;

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

      {loadError && <NoticeBar tone="warn">{loadError}</NoticeBar>}
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
          ? "Les frais par zone sont ceux facturés au paiement. La colonne livreurs est une aide de planification locale à ce navigateur : elle n'est pas enregistrée et n'affecte pas la répartition."
          : "Zone fees are what shoppers are charged at checkout. The riders column is a planning aid local to this browser: it is not saved and does not drive dispatch."}
      </NoticeBar>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard title={fr ? "Zones" : "Zones"} value={zones.length} icon={MapPin} />
        <StatCard title={fr ? "Villes" : "Cities"} value={cities.length} icon={Layers} />
        <StatCard title={fr ? "Livreurs notés (local)" : "Riders noted (local)"} value={assignedRiders} icon={Bike} />
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
                key: "riders",
                label: fr ? "Livreurs (note locale)" : "Riders (local note)",
                render: (row) => {
                  const id = String(row.id);
                  const assigned = plan[id] ?? [];
                  return (
                    <div className="flex flex-wrap items-center gap-1.5">
                      {assigned.map((r) => (
                        <span key={r} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs">
                          {r}
                          <button onClick={() => setPlan((p) => ({ ...p, [id]: (p[id] ?? []).filter((x) => x !== r) }))} className="text-slate-400 hover:text-red-500">
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                      <select
                        className="input-premium px-2 py-1 text-xs"
                        value=""
                        onChange={(e) => e.target.value && setPlan((p) => ({ ...p, [id]: [...(p[id] ?? []), e.target.value] }))}
                      >
                        <option value="">{fr ? "+ Noter" : "+ Note"}</option>
                        {riderNames.filter((r) => !assigned.includes(r)).map((r) => (
                          <option key={r} value={r}>{r}</option>
                        ))}
                      </select>
                    </div>
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
