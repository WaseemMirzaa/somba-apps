"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { DetailSection, InfoGrid } from "@/components/ui/info-grid";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { useLocale } from "@/context/locale-context";
import { useRealtime } from "@/context/realtime-context";
import { socketClient } from "@/lib/realtime/socket-client";
import { errorMessage, isOpsRole } from "@/lib/warehouse-live";
import { useOpsBase, useOpsPath } from "@/lib/ops-path";
import { formatCurrency } from "@/lib/utils";

type Zone = { id: string; name: string; city?: string; feeUsd?: number };

/** Read-only view of the platform settings that matter on the hub floor. Changing them is an admin job. */
export default function WarehouseSettingsPage() {
  const { t, locale } = useLocale();
  const fr = locale === "fr";
  const rt = useRealtime();
  const ops = useOpsPath();
  const base = useOpsBase();
  const [settings, setSettings] = useState<Record<string, string> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (rt.status !== "connected" || !isOpsRole(rt.user?.role)) return;
    let alive = true;
    socketClient
      .request<Record<string, string>>("settings:get")
      .then((s) => alive && setSettings(s))
      .catch((e) => alive && setError(errorMessage(e)));
    return () => {
      alive = false;
    };
  }, [rt.status, rt.user?.role]);

  let zones: Zone[] = [];
  try {
    const parsed = JSON.parse(settings?.deliveryZones ?? "[]") as unknown;
    if (Array.isArray(parsed)) zones = parsed as Zone[];
  } catch {
    zones = [];
  }
  const yes = fr ? "Oui" : "Yes";
  const no = fr ? "Non" : "No";

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("settings")}
        subtitle={fr ? "Paramètres de la plateforme utiles à l'entrepôt (lecture seule)" : "Platform settings that matter on the hub floor (read-only)"}
        breadcrumbs={[{ label: base.startsWith("/admin") ? "Admin" : (fr ? "Entrepôt" : "Warehouse"), href: base.startsWith("/admin") ? "/admin/fulfillment" : "/warehouse" }, { label: t("settings") }]}
        actions={<Link href={ops("/hubs")} className="rounded-lg border border-indigo-200 px-4 py-2 text-sm text-indigo-700 hover:bg-indigo-50">{fr ? "Voir les hubs" : "View hubs"}</Link>}
      />
      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <DetailSection title={fr ? "Livraison et paiement" : "Delivery and payment"}>
        <InfoGrid items={[
          { label: fr ? "Paiement à la livraison (COD)" : "Cash on delivery (COD)", value: settings ? <Badge variant={settings.codEnabled === "true" ? "success" : "warning"}>{settings.codEnabled === "true" ? (fr ? "Activé" : "Enabled") : (fr ? "Désactivé" : "Disabled")}</Badge> : "…" },
          { label: fr ? "Plafond COD" : "COD cap", value: settings?.codCapUsd ? formatCurrency(Number(settings.codCapUsd), locale) : "—" },
          { label: fr ? "Code de remise obligatoire" : "Delivery code required", value: settings ? (settings.requireDeliveryCode === "true" ? yes : no) : "…" },
          ...(settings?.hubAddress ? [{ label: fr ? "Adresse du hub" : "Hub address", value: settings.hubAddress, full: true }] : []),
        ]} />
      </DetailSection>

      <DetailSection title={fr ? "Zones de livraison" : "Delivery zones"}>
        {zones.length === 0 ? (
          <p className="text-sm text-slate-500">{settings ? (fr ? "Aucune zone configurée." : "No zones configured.") : "…"}</p>
        ) : (
          <InfoGrid items={zones.map((z) => ({
            label: z.name,
            value: `${z.city ?? ""}${z.feeUsd != null ? ` · ${formatCurrency(z.feeUsd, locale)}` : ""}`.replace(/^ · /, ""),
          }))} />
        )}
      </DetailSection>

      <p className="text-xs text-slate-500">
        {fr
          ? "Ces valeurs se modifient dans le portail admin (Paramètres). Les heures d'ouverture, la taille des lots et l'attribution automatique ne sont pas encore configurables."
          : "Change these in the admin portal (Settings). Working hours, batch size and auto-assignment are not configurable yet."}
      </p>
    </div>
  );
}
