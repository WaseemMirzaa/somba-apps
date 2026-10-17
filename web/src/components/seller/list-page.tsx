"use client";

import { Card, CardContent } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { PageHeader } from "@/components/ui/page-header";
import { LoadError, SectionLoader } from "@/components/seller/data-state";
import { useLocale } from "@/context/locale-context";
import { useSellerLoad } from "@/lib/seller";

/**
 * Standard seller list page. While the portal's first read is in flight it shows
 * a loader; when a core read failed it shows the server's message with a retry
 * (the rows we already have stay visible); an empty answer reads as "nothing yet".
 */
export function SellerListPage({
  title,
  subtitle,
  breadcrumbs,
  actions,
  filters,
  columns,
  data,
  rowAction,
  emptyMessage,
}: {
  title: string;
  subtitle?: string;
  breadcrumbs?: { label: string; href?: string }[];
  actions?: React.ReactNode;
  filters?: React.ReactNode;
  columns: Parameters<typeof DataTable>[0]["columns"];
  data: Record<string, unknown>[];
  rowAction?: Parameters<typeof DataTable>[0]["rowAction"];
  emptyMessage?: string;
}) {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const load = useSellerLoad();
  const waiting = load.loading && data.length === 0;
  return (
    <div className="space-y-6">
      <PageHeader title={title} subtitle={subtitle} breadcrumbs={breadcrumbs} actions={actions} />
      {load.error && <LoadError message={load.error} onRetry={load.retry} />}
      {filters}
      <Card>
        <CardContent className="p-0">
          {waiting ? (
            <SectionLoader />
          ) : (
            <DataTable
              columns={columns}
              data={data}
              rowAction={rowAction}
              emptyMessage={emptyMessage ?? (fr ? "Rien à afficher pour le moment." : "Nothing to show yet.")}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
