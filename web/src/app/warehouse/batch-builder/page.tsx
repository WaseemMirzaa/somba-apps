"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { useRouter } from "next/navigation";
import { useToast } from "@/context/toast-context";
import { batchParcels } from "@/lib/warehouse-hubs";
import { useLocale } from "@/context/locale-context";
import { L } from "@/lib/locale-helpers";

export default function WarehouseBatchBuilderPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { t, locale } = useLocale();
  const [batch, setBatch] = useState<string[]>([]);
  const available = batchParcels.filter((p) => !batch.includes(p.id));

  function add(id: string) {
    setBatch([...batch, id]);
  }

  function remove(id: string) {
    setBatch(batch.filter((x) => x !== id));
  }

  const batchRows = batch.map((id, i) => {
    const p = batchParcels.find((x) => x.id === id)!;
    return { ...p, stop: i + 1 };
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("batchBuilder")}
        subtitle={t("batchBuilderSubtitle")}
        breadcrumbs={[{ label: t("warehouseBreadcrumb"), href: "/warehouse" }, { label: t("batchBuilder") }]}
        actions={<Button size="sm" onClick={() => { setBatch((b) => [...b].reverse()); toast(t("routeOptimized")); }}>{t("optimizeRoute")}</Button>}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardContent className="p-0">
            <DataTable
              columns={[
                { key: "id", label: t("parcel") },
                { key: "customer", label: t("customer") },
                { key: "zone", label: t("zone") },
                { key: "weight", label: t("weight"), render: (row) => `${row.weight}kg` },
                {
                  key: "actions",
                  label: t("action"),
                  render: (row) => (
                    <Button variant="secondary" size="sm" onClick={() => add(String(row.id))}>
                      <Plus className="h-4 w-4" />
                    </Button>
                  ),
                },
              ]}
              data={available as unknown as Record<string, unknown>[]}
            />
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardContent className="p-0">
              {batch.length === 0 ? (
                <p className="px-5 py-8 text-center text-sm text-slate-400">{t("batchBuilderSubtitle")}</p>
              ) : (
                <DataTable
                  columns={[
                    { key: "stop", label: "#" },
                    { key: "id", label: t("parcel") },
                    { key: "zone", label: t("zone") },
                    {
                      key: "actions",
                      label: t("action"),
                      render: (row) => (
                        <button type="button" onClick={() => remove(String(row.id))} className="text-red-500">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      ),
                    },
                  ]}
                  data={batchRows as unknown as Record<string, unknown>[]}
                />
              )}
            </CardContent>
          </Card>
          {batch.length > 0 && (
            <Button className="w-full" onClick={() => { toast(L(locale, "Batch BATCH-002 created", "Lot BATCH-002 créé")); router.push("/warehouse/batches/BATCH-002"); }}>
              {L(locale, "Create Batch & Assign Rider", "Créer le lot et assigner livreur")}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
