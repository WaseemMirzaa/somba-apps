"use client";

import { useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { LoadError, SectionLoader } from "@/components/seller/data-state";
import { PeriodFilter, type AnalyticsPeriod } from "@/components/seller/analytics-kpi";
import { useLocale } from "@/context/locale-context";
import { useSellerAnalytics, type AnalyticsDays, type SellerAnalytics } from "@/lib/seller-analytics";

const DAYS: Record<AnalyticsPeriod, AnalyticsDays> = { "7D": 7, "30D": 30, "90D": 90 };

/**
 * Common frame of the seller analytics pages: header with the period switch,
 * and the loading / error / data states of `analytics:seller`.
 */
export function AnalyticsPage({
  title,
  subtitle,
  crumb,
  children,
}: {
  title: string;
  subtitle: string;
  /** Breadcrumb label; omitted on the overview page. */
  crumb?: string;
  children: (a: SellerAnalytics, ctx: { days: AnalyticsDays; periodLabel: string; fr: boolean }) => React.ReactNode;
}) {
  const { t, locale } = useLocale();
  const fr = locale === "fr";
  const [period, setPeriod] = useState<AnalyticsPeriod>("30D");
  const days = DAYS[period];
  const an = useSellerAnalytics(days);
  const periodLabel = fr ? `${days} derniers jours` : `last ${days} days`;

  return (
    <div className="space-y-6">
      <PageHeader
        title={title}
        subtitle={subtitle}
        backHref={crumb ? "/seller/analytics" : undefined}
        breadcrumbs={
          crumb
            ? [{ label: fr ? "Vendeur" : "Seller", href: "/seller" }, { label: t("analytics"), href: "/seller/analytics" }, { label: crumb }]
            : [{ label: fr ? "Vendeur" : "Seller", href: "/seller" }, { label: t("analytics") }]
        }
        actions={<PeriodFilter period={period} onChange={setPeriod} />}
      />
      {an.error && <LoadError message={an.error} onRetry={an.retry} />}
      {an.loading && !an.data && <SectionLoader />}
      {an.data && children(an.data, { days, periodLabel, fr })}
    </div>
  );
}
