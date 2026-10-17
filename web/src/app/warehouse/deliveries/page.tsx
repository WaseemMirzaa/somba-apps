"use client";

import { useMemo } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/data-table";
import { OpsError } from "@/components/warehouse/ops-state";
import { LoadMore } from "@/components/ui/load-more";
import { useLocale } from "@/context/locale-context";
import { useRealtime } from "@/context/realtime-context";
import { STAGE_LABEL, stageVariant, useWarehouseData, type ParcelStage } from "@/lib/warehouse";
import { shortDate } from "@/lib/warehouse-live";
import { useOpsBase, useOpsPath } from "@/lib/ops-path";

export default function WarehouseDeliveriesPage() {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const ops = useOpsPath();
  const base = useOpsBase();
  const rt = useRealtime();
  const { parcels } = useWarehouseData();
  const live = useMemo(() => parcels.filter((p) => p.status !== "inbound" && p.status !== "received"), [parcels]);

  return (
    <div className="space-y-6">
      <PageHeader
        title={fr ? "Livraisons" : "Deliveries"}
        subtitle={
          fr
            ? "Suivi en direct des livraisons : en route, livrées et échouées"
            : "Live delivery tracking: on the way, delivered and failed"
        }
        breadcrumbs={[{ label: base.startsWith("/admin") ? "Admin" : (fr ? "Entrepôt" : "Warehouse"), href: base.startsWith("/admin") ? "/admin/fulfillment" : "/warehouse" }, { label: fr ? "Livraisons" : "Deliveries" }]}
      />

      {rt.listError && <OpsError message={rt.listError} onRetry={() => void rt.reloadLists()} />}

      <Card>
        <CardContent className="p-0">
          <DataTable
            emptyMessage={rt.status !== "connected" ? (fr ? "Chargement…" : "Loading…") : fr ? "Aucune livraison en cours." : "No deliveries yet."}
            columns={[
              { key: "id", label: fr ? "Colis" : "Parcel", render: (row) => (
                <Link href={ops(`/deliveries/${row.id}`)} className="font-medium text-[var(--primary)] hover:underline">{String(row.id)}</Link>
              )},
              { key: "orderId", label: fr ? "Commande" : "Order" },
              { key: "customer", label: fr ? "Client" : "Customer" },
              { key: "customerAddress", label: fr ? "Adresse" : "Address" },
              { key: "rider", label: fr ? "Livreur" : "Rider" },
              { key: "attempts", label: fr ? "Tentatives" : "Attempts" },
              { key: "status", label: fr ? "Statut" : "Status", render: (row) => {
                const st = String(row.status) as ParcelStage;
                return <Badge variant={stageVariant(st)}>{fr ? STAGE_LABEL[st].fr : STAGE_LABEL[st].en}</Badge>;
              }},
              { key: "updatedAt", label: fr ? "Mis à jour" : "Updated", render: (row) => shortDate(String(row.updatedAt), locale) },
            ]}
            data={live as unknown as Record<string, unknown>[]}
          />
        </CardContent>
      </Card>

      <LoadMore
        hasMore={rt.hasMoreDeliveries}
        onLoad={async () => {
          await rt.loadMoreDeliveries();
          if (rt.hasMoreOrders) await rt.loadMoreOrders();
        }}
        loaded={rt.deliveries.length}
        noun={{ en: "deliveries", fr: "livraisons" }}
      />
    </div>
  );
}
