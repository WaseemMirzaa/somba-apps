"use client";

import { Card, CardContent } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { PageHeader } from "@/components/ui/page-header";

export function SellerListPage({
  title,
  subtitle,
  breadcrumbs,
  actions,
  filters,
  columns,
  data,
  rowAction,
}: {
  title: string;
  subtitle?: string;
  breadcrumbs?: { label: string; href?: string }[];
  actions?: React.ReactNode;
  filters?: React.ReactNode;
  columns: Parameters<typeof DataTable>[0]["columns"];
  data: Record<string, unknown>[];
  rowAction?: Parameters<typeof DataTable>[0]["rowAction"];
}) {
  return (
    <div className="space-y-6">
      <PageHeader title={title} subtitle={subtitle} breadcrumbs={breadcrumbs} actions={actions} />
      {filters}
      <Card>
        <CardContent className="p-0">
          <DataTable columns={columns} data={data} rowAction={rowAction} />
        </CardContent>
      </Card>
    </div>
  );
}
