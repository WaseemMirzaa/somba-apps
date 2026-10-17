"use client";

import { Card, CardContent } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { PageHeader } from "@/components/ui/page-header";
import { LoadMore } from "@/components/ui/load-more";
import { OpsError } from "@/components/warehouse/ops-state";
import { useRealtime } from "@/context/realtime-context";

export function WarehouseListPage({
  title,
  subtitle,
  breadcrumbs,
  actions,
  filters,
  columns,
  data,
  paged,
  error,
  onRetry,
  emptyMessage,
}: {
  title: string;
  subtitle?: string;
  breadcrumbs?: { label: string; href?: string }[];
  actions?: React.ReactNode;
  filters?: React.ReactNode;
  columns: Parameters<typeof DataTable>[0]["columns"];
  data: Record<string, unknown>[];
  /** The rows come from the live delivery list (paged by the server): show "load more" and the load error. */
  paged?: boolean;
  /** Error of the query behind this list (shown with a retry). */
  error?: string | null;
  onRetry?: () => void;
  emptyMessage?: string;
}) {
  const rt = useRealtime();
  const shownError = error ?? (paged ? rt.listError : null);
  return (
    <div className="space-y-6">
      <PageHeader title={title} subtitle={subtitle} breadcrumbs={breadcrumbs} actions={actions} />
      {filters}
      {shownError && <OpsError message={shownError} onRetry={onRetry ?? (paged ? () => void rt.reloadLists() : undefined)} />}
      <Card>
        <CardContent className="p-0">
          <DataTable columns={columns} data={data} emptyMessage={emptyMessage} />
        </CardContent>
      </Card>
      {paged && (
        <LoadMore
          hasMore={rt.hasMoreDeliveries}
          onLoad={async () => {
            await rt.loadMoreDeliveries();
            // The parcels join each delivery with its order: keep the orders in step.
            if (rt.hasMoreOrders) await rt.loadMoreOrders();
          }}
          loaded={rt.deliveries.length}
          noun={{ en: "parcels", fr: "colis" }}
        />
      )}
    </div>
  );
}
