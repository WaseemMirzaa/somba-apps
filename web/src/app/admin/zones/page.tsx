"use client";

import { useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/ui/stat-card";
import { Tabs } from "@/components/ui/tabs";
import { DataTable } from "@/components/ui/data-table";
import { MapPin, Bike, Layers, Plus, X } from "lucide-react";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";
import { ADMIN_ZONES, ZONE_RIDERS, ZONE_CITIES, type AdminZone } from "@/lib/zones-admin";

const ZONE_STATUS_FR: Record<string, string> = { active: "Active", paused: "En pause" };

export default function AdminZonesPage() {
  const { locale } = useLocale();
  const { toast } = useToast();
  const fr = locale === "fr";
  const [zones, setZones] = useState<AdminZone[]>(ADMIN_ZONES);
  const [city, setCity] = useState("all");
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ commune: "", city: "Kinshasa", fee: "3" });

  const filtered = city === "all" ? zones : zones.filter((z) => z.city === city);
  const assignedRiders = new Set(zones.flatMap((z) => z.riders)).size;
  const unassigned = zones.filter((z) => z.riders.length === 0).length;

  function addZone() {
    if (!form.commune.trim()) {
      toast(fr ? "Commune requise" : "Commune required", "error");
      return;
    }
    setZones((z) => [
      { id: `z-${Date.now()}`, commune: form.commune.trim(), city: form.city, deliveryFeeUsd: Number(form.fee) || 0, riders: [], status: "active" },
      ...z,
    ]);
    setForm({ commune: "", city: "Kinshasa", fee: "3" });
    setShowAdd(false);
    toast(fr ? "Zone ajoutée" : "Zone added", "success");
  }

  function assignRider(zoneId: string, rider: string) {
    if (!rider) return;
    setZones((zs) => zs.map((z) => (z.id === zoneId && !z.riders.includes(rider) ? { ...z, riders: [...z.riders, rider] } : z)));
    toast(fr ? `${rider} affecté` : `${rider} assigned`, "success");
  }
  function removeRider(zoneId: string, rider: string) {
    setZones((zs) => zs.map((z) => (z.id === zoneId ? { ...z, riders: z.riders.filter((r) => r !== rider) } : z)));
  }
  function toggleStatus(zoneId: string) {
    setZones((zs) => zs.map((z) => (z.id === zoneId ? { ...z, status: z.status === "active" ? "paused" : "active" } : z)));
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={fr ? "Zones de livraison" : "Delivery Zones"}
        subtitle={fr ? "Définies par commune · affectation manuelle des livreurs" : "Defined by commune · manual rider assignment"}
        breadcrumbs={[{ label: "Admin", href: "/admin" }, { label: "Zones" }]}
        actions={
          <Button size="sm" onClick={() => setShowAdd((s) => !s)}>
            <Plus className="h-4 w-4" />
            {fr ? "Ajouter une zone" : "Add zone"}
          </Button>
        }
      />

      <div className="rounded-xl border border-blue-100 bg-blue-50/60 px-4 py-3 text-sm text-blue-800">
        {fr
          ? "L'affectation des tâches aux livreurs est manuelle — choisie par l'équipe entrepôt."
          : "Rider task assignment is manual — chosen by the warehouse team."}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title={fr ? "Zones" : "Zones"} value={zones.length} icon={MapPin} />
        <StatCard title={fr ? "Actives" : "Active"} value={zones.filter((z) => z.status === "active").length} icon={Layers} />
        <StatCard title={fr ? "Livreurs affectés" : "Riders assigned"} value={assignedRiders} icon={Bike} />
        <StatCard title={fr ? "Sans livreur" : "Unassigned zones"} value={unassigned} icon={MapPin} />
      </div>

      {showAdd && (
        <div className="card-premium grid gap-3 p-5 sm:grid-cols-4">
          <input
            className="input-premium px-4 py-2 text-sm sm:col-span-2"
            placeholder={fr ? "Commune (ex. Ngaba)" : "Commune (e.g. Ngaba)"}
            value={form.commune}
            onChange={(e) => setForm({ ...form, commune: e.target.value })}
          />
          <select className="input-premium px-4 py-2 text-sm" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })}>
            {ZONE_CITIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <div className="flex gap-2">
            <input className="input-premium w-full px-4 py-2 text-sm" placeholder={fr ? "Frais $" : "Fee $"} value={form.fee} onChange={(e) => setForm({ ...form, fee: e.target.value })} />
            <Button size="sm" onClick={addZone}>{fr ? "Ajouter" : "Add"}</Button>
          </div>
        </div>
      )}

      <div className="card-premium overflow-hidden">
        <Tabs
          className="m-4"
          active={city}
          onChange={setCity}
          tabs={[{ id: "all", label: fr ? "Toutes" : "All" }, ...ZONE_CITIES.map((c) => ({ id: c, label: c }))]}
        />
        <DataTable
          data={filtered as unknown as Record<string, unknown>[]}
          columns={[
            { key: "commune", label: "Commune", render: (row) => <span className="font-semibold text-slate-900">{String(row.commune)}</span> },
            { key: "city", label: fr ? "Ville" : "City" },
            { key: "deliveryFeeUsd", label: fr ? "Frais" : "Fee", render: (row) => `$${Number(row.deliveryFeeUsd)}` },
            {
              key: "riders",
              label: fr ? "Livreurs" : "Riders",
              render: (row) => {
                const z = row as unknown as AdminZone;
                return (
                  <div className="flex flex-wrap items-center gap-1.5">
                    {z.riders.map((r) => (
                      <span key={r} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs">
                        {r}
                        <button onClick={() => removeRider(z.id, r)} className="text-slate-400 hover:text-red-500">
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                    <select
                      className="input-premium px-2 py-1 text-xs"
                      value=""
                      onChange={(e) => assignRider(z.id, e.target.value)}
                    >
                      <option value="">{fr ? "+ Affecter" : "+ Assign"}</option>
                      {ZONE_RIDERS.filter((r) => !z.riders.includes(r)).map((r) => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                  </div>
                );
              },
            },
            { key: "status", label: fr ? "Statut" : "Status", render: (row) => <Badge variant={row.status === "active" ? "success" : "warning"}>{fr ? (ZONE_STATUS_FR[String(row.status)] ?? String(row.status)) : String(row.status)}</Badge> },
            {
              key: "actions",
              label: "",
              render: (row) => {
                const z = row as unknown as AdminZone;
                return (
                  <button onClick={() => toggleStatus(z.id)} className="text-sm font-medium text-[var(--primary)] hover:underline">
                    {z.status === "active" ? (fr ? "Suspendre" : "Pause") : fr ? "Activer" : "Activate"}
                  </button>
                );
              },
            },
          ]}
        />
      </div>
    </div>
  );
}
