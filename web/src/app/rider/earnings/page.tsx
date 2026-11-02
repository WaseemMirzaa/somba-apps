"use client";

import Link from "next/link";
import { Banknote, CheckCircle, DollarSign, Package } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { useLocale } from "@/context/locale-context";
import { LEG_KIND, pickL } from "@/lib/logistics";
import { useRiderCash, useRiderData } from "@/lib/rider";
import { formatCurrency } from "@/lib/utils";

export default function RiderEarningsPage() {
  const { t, locale } = useLocale();
  const fr = locale === "fr";
  const { earnings, mine, loading, error } = useRiderData();
  const { cash } = useRiderCash();
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
            <StatCard title={fr ? "Espèces à remettre" : "Cash to hand over"} value={formatCurrency(cash?.heldUsd ?? 0, locale)} icon={Banknote} />
            <StatCard title={fr ? "En cours" : "Active"} value={earnings.active} icon={Package} />
          </div>
          <p className="text-xs text-slate-500">
            {rate != null
              ? (fr ? `Tarif actuel : ${formatCurrency(rate, locale)} par tâche terminée (livraisons, collectes et transferts). ` : `Current rate: ${formatCurrency(rate, locale)} per completed task (deliveries, pickups and transfers). `)
              : ""}
            {fr
              ? "Remettez les espèces COD encaissées à votre entrepôt : un superviseur enregistre la remise et votre solde diminue d'autant."
              : "Hand the COD cash you collected to your warehouse: a supervisor records the hand-over and your balance goes down by that amount."}
          </p>
          {cash && (
            <Card>
              <CardContent className="p-4">
                <h2 className="mb-1 font-semibold text-slate-900">{fr ? "Espèces COD" : "COD cash"}</h2>
                <p data-testid="cash-summary" className="mb-3 text-xs text-slate-500">
                  {fr
                    ? `Encaissé ${formatCurrency(cash.collectedUsd, locale)} · remis ${formatCurrency(cash.handedOverUsd, locale)} · reste ${formatCurrency(cash.heldUsd, locale)}`
                    : `Collected ${formatCurrency(cash.collectedUsd, locale)} · handed in ${formatCurrency(cash.handedOverUsd, locale)} · still held ${formatCurrency(cash.heldUsd, locale)}`}
                </p>
                {cash.handovers.length === 0 ? (
                  <p className="text-sm text-slate-500">{fr ? "Aucune remise enregistrée pour l'instant." : "No hand-over recorded yet."}</p>
                ) : (
                  <ul className="divide-y divide-[var(--border)] text-sm">
                    {cash.handovers.map((h) => (
                      <li key={h.id} className="py-2">
                        <span className="font-semibold text-emerald-700">{formatCurrency(h.amountUsd, locale)}</span>{" "}
                        {fr ? `reçus par ${h.receivedByName}` : `received by ${h.receivedByName}`}
                        <span className="block text-xs text-slate-500">
                          {new Date(h.createdAt).toLocaleString(locale)} · {fr ? `reste ${formatCurrency(h.heldAfterUsd, locale)}` : `${formatCurrency(h.heldAfterUsd, locale)} left to hand over`}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          )}
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
