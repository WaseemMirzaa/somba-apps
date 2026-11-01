"use client";

import Link from "next/link";
import { Banknote, CheckCircle, DollarSign, Package } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { useLocale } from "@/context/locale-context";
import { LEG_KIND, pickL } from "@/lib/logistics";
import { useRiderData } from "@/lib/rider";
import { formatCurrency } from "@/lib/utils";

export default function RiderEarningsPage() {
  const { t, locale } = useLocale();
  const fr = locale === "fr";
  const { earnings, mine, loading, error } = useRiderData();
  const delivered = mine.filter((x) => x.status === "delivered");
  // The server pays a flat amount per completed task of any kind (delivery, pickup, transfer...); show the rate it computed.
  const rate = earnings && earnings.delivered > 0 ? earnings.earningsUsd / earnings.delivered : null;

  return (
    <div className="space-y-6">
      <PageHeader title={t("earnings")} subtitle={fr ? "Calculé par le serveur à partir de vos tâches terminées" : "Calculated by the server from your completed tasks"} />
      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {!earnings ? (
        <p className="text-center text-sm text-slate-500">{loading ? (fr ? "Chargement…" : "Loading…") : (fr ? "Aucune donnée." : "No data.")}</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <StatCard title={fr ? "Gains" : "Earnings"} value={formatCurrency(earnings.earningsUsd, locale)} icon={DollarSign} />
            <StatCard title={fr ? "Tâches terminées" : "Tasks done"} value={earnings.delivered} icon={CheckCircle} />
            <StatCard title={fr ? "COD encaissé" : "COD collected"} value={formatCurrency(earnings.codCollectedUsd, locale)} icon={Banknote} />
            <StatCard title={fr ? "En cours" : "Active"} value={earnings.active} icon={Package} />
          </div>
          <p className="text-xs text-slate-500">
            {rate != null
              ? (fr ? `Tarif actuel : ${formatCurrency(rate, locale)} par tâche terminée (livraisons, collectes et transferts). ` : `Current rate: ${formatCurrency(rate, locale)} per completed task (deliveries, pickups and transfers). `)
              : ""}
            {fr
              ? "Les espèces COD encaissées doivent être remises à l'entrepôt."
              : "Cash collected on COD orders must be handed over at the warehouse."}
          </p>
          {earnings.byKind && earnings.byKind.length > 0 && (
            <Card>
              <CardContent className="p-4">
                <h2 className="mb-3 font-semibold text-slate-900">{fr ? "Gains par type de tâche" : "Earnings by kind of task"}</h2>
                <ul className="divide-y divide-[var(--border)] text-sm">
                  {earnings.byKind.map((k) => (
                    <li key={k.kind} className="flex items-center justify-between py-2">
                      <span>{pickL(LEG_KIND[k.kind], fr)} <span className="text-slate-400">× {k.count}</span></span>
                      <span className="font-semibold text-emerald-700">{formatCurrency(k.earningsUsd, locale)}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </>
      )}

      <Card>
        <CardContent className="p-4">
          <h2 className="mb-3 font-semibold text-slate-900">{fr ? "Tâches terminées" : "Completed tasks"}</h2>
          {delivered.length === 0 ? (
            <p className="text-sm text-slate-500">{fr ? "Aucune tâche terminée pour l'instant." : "No completed tasks yet."}</p>
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {delivered.map((d) => (
                <li key={d.id}>
                  <Link href={`/rider/tasks/${d.id}`} className="flex items-center justify-between py-3 text-sm">
                    <span>
                      <span className="font-medium text-slate-900">{d.orderId}</span>
                      <span className="block text-xs text-slate-500">{d.customer}</span>
                    </span>
                    <span className="text-right">
                      {rate != null && <span className="font-semibold text-emerald-700">{formatCurrency(rate, locale)}</span>}
                      {d.codAmount > 0 && <span className="block text-xs text-slate-500">COD {formatCurrency(d.codAmount, locale)}</span>}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
