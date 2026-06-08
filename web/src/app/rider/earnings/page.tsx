"use client";

import { DollarSign } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { Card, CardContent } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { useLocale } from "@/context/locale-context";
import { riderProfile } from "@/lib/rider-entities";
import { formatCurrency } from "@/lib/utils";

const history = [
  { date: "Today", amount: 84000, trips: 12 },
  { date: "Yesterday", amount: 72000, trips: 10 },
  { date: "Jun 6", amount: 91000, trips: 14 },
  { date: "Jun 5", amount: 68000, trips: 9 },
];

export default function RiderEarningsPage() {
  const { t, locale } = useLocale();

  return (
    <div className="space-y-6">
      <PageHeader title={t("earnings")} />

      <StatCard
        title="Today"
        value={formatCurrency(riderProfile.earningsToday, locale)}
        icon={DollarSign}
        trend={`${riderProfile.deliveriesToday} deliveries`}
      />

      <Card>
        <CardContent className="p-0">
          <DataTable
            columns={[
              { key: "date", label: t("date") },
              { key: "trips", label: "Trips" },
              {
                key: "amount",
                label: t("amount"),
                render: (row) => (
                  <span className="font-semibold text-emerald-600">
                    {formatCurrency(row.amount as number, locale)}
                  </span>
                ),
              },
            ]}
            data={history as unknown as Record<string, unknown>[]}
          />
        </CardContent>
      </Card>
    </div>
  );
}
