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
    // Live: the admin changes a setting, the page follows (the push carries the whole settings object).
    const sock = socketClient.current;
    const onUpdate = (all: Record<string, string>) => {
      if (all && typeof all === "object") setSettings(all);
    };
    sock?.on("settings:updated", onUpdate);
    return () => {
      alive = false;
      sock?.off("settings:updated", onUpdate);
    };
  }, [rt.status, rt.user?.role]);

  const money = (v: string | undefined) => (settings ? (v != null && v !== "" ? formatCurrency(Number(v), locale) : "—") : "…");
  const yes = fr ? "Oui" : "Yes";
  const no = fr ? "Non" : "No";

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("settings")}
        subtitle={fr ? "Paramètres de la plateforme utiles à l'entrepôt (lecture seule)" : "Platform settings that matter on the hub floor (read-only)"}
        breadcrumbs={[{ label: base.startsWith("/admin") ? "Admin" : (fr ? "Entrepôt" : "Warehouse"), href: base.startsWith("/admin") ? "/admin/fulfillment" : "/warehouse" }, { label: t("settings") }]}
        actions={<Link href={ops("/hubs")} className="rounded-lg border border-indigo-200 px-4 py-2 text-sm text-indigo-700 hover:bg-indigo-50">{fr ? "Mon entrepôt" : "My warehouse"}</Link>}
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

      <DetailSection title={fr ? "Frais de livraison" : "Delivery fees"}>
        <InfoGrid items={[
          { label: fr ? "Frais de base" : "Base fee", value: money(settings?.deliveryBaseUsd) },
          { label: fr ? "Par kilomètre (entrepôt → client)" : "Per km (warehouse → customer)", value: money(settings?.deliveryPerKmUsd) },
          { label: fr ? "Plafond (base + distance)" : "Cap (base + distance)", value: money(settings?.deliveryMaxUsd) },
          { label: fr ? "Supplément transfert entre entrepôts" : "Warehouse-to-warehouse transfer fee", value: money(settings?.deliveryTransferUsd) },
          { label: fr ? "Adresse localisée obligatoire" : "Map pin required", value: settings ? (settings.requirePinnedAddress === "true" ? yes : no) : "…" },
        ]} />
      </DetailSection>

      <p className="text-xs text-slate-500">
        {fr
          ? "Ces valeurs se modifient dans le portail admin (Paramètres). Les heures d'ouverture, la taille des lots et l'attribution automatique ne sont pas encore configurables."
          : "Change these in the admin portal (Settings). Working hours, batch size and auto-assignment are not configurable yet."}
      </p>
    </div>
  );
}
