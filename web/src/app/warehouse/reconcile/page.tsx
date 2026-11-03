"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Banknote, Bike, HandCoins, Package } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { StatCard } from "@/components/ui/stat-card";
import { Modal, ErrorNote } from "@/components/admin/modal";
import { useLocale } from "@/context/locale-context";
import { useRealtime } from "@/context/realtime-context";
import { useToast } from "@/context/toast-context";
import { socketClient } from "@/lib/realtime/socket-client";
import { useHubScope, useWarehouseData } from "@/lib/warehouse";
import { HubScopeBar } from "@/components/warehouse/hub-scope";
import { errorMessage, isOpsRole, useOpsQuery, type CashHandover, type ReconcileRow } from "@/lib/warehouse-live";
import { useOpsBase } from "@/lib/ops-path";
import { parseCashAmount } from "@/lib/cash-amount";
import { formatCurrency } from "@/lib/utils";

/**
 * COD cash per rider (`warehouse:reconcile`): what the delivered parcels were due to bring in, what the riders recorded
 * taking at the door, what the warehouse has received since and what each rider still holds. A supervisor or manager
 * records a hand-over (`cash:handover`): who received how much and when; it can be partial and never more than the rider
 * holds. The receipts are listed below (`cash:history`). Shown only while cash on delivery is offered (`codEnabled`): when
 * it is off the menu has no entry for it, and anyone who opens the address is sent back to the warehouse home.
 */
type Row = ReconcileRow & { name: string };

export default function WarehouseReconcilePage() {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const base = useOpsBase();
  const router = useRouter();
  const rt = useRealtime();
  const { toast } = useToast();
  const { riders } = useWarehouseData();
  const { hubId } = useHubScope();
  const recQ = useOpsQuery<ReconcileRow[]>("warehouse:reconcile", { initial: [] as ReconcileRow[], body: hubId ? { hubId } : {}, push: ["task:updated", "cash:updated"] });
  const histQ = useOpsQuery<CashHandover[]>("cash:history", { initial: [] as CashHandover[], body: hubId ? { hubId } : {}, push: ["cash:updated"] });
  const [codEnabled, setCodEnabled] = useState<boolean | null>(null);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [target, setTarget] = useState<Row | null>(null);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [ref, setRef] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (rt.status !== "connected" || !isOpsRole(rt.user?.role)) return;
    let alive = true;
    socketClient
      .request<Record<string, string>>("settings:get")
      .then((s) => {
        if (alive) setCodEnabled(String(s?.codEnabled) === "true");
      })
      .catch((e) => {
        if (alive) setSettingsError(errorMessage(e));
      });
    return () => {
      alive = false;
    };
  }, [rt.status, rt.user?.role]);

  // COD is not offered: this page has nothing to show. Wait for the setting before deciding (null = still loading).
  useEffect(() => {
    if (codEnabled === false) router.replace(base);
  }, [codEnabled, router, base]);

  const nameOf = (id: string) => (id === "unassigned" ? (fr ? "Sans livreur" : "No rider") : riders.find((x) => x.id === id)?.name ?? `Rider ${id.slice(0, 6).toUpperCase()}`);
  const rows: Row[] = useMemo(
    () => recQ.data.map((r) => ({ ...r, name: nameOf(r.riderId) })).sort((a, b) => b.heldUsd - a.heldUsd || b.codUsd - a.codUsd),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [recQ.data, riders, fr],
  );
  const held = rows.reduce((s, r) => s + r.heldUsd, 0);
  const collected = rows.reduce((s, r) => s + r.collectedUsd, 0);
  const handed = rows.reduce((s, r) => s + r.handedOverUsd, 0);

  function openHandover(r: Row) {
    setTarget(r);
    setAmount(r.heldUsd.toFixed(2));
    setNote("");
    setRef(typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
    setFormError(null);
  }

  async function submit() {
    if (!target || busy) return;
    const usd = parseCashAmount(amount);
    if (usd === null) {
      setFormError(fr ? "Saisissez le montant reçu en dollars et centimes, par exemple 25,50." : "Enter the amount received in dollars and cents, for example 25.50.");
      return;
    }
    if (usd > target.heldUsd + 0.005) {
      setFormError(fr ? `${target.name} détient ${formatCurrency(target.heldUsd, locale)} : vous ne pouvez pas enregistrer plus.` : `${target.name} holds ${formatCurrency(target.heldUsd, locale)}: you cannot record more than that.`);
      return;
    }
    setBusy(true);
    setFormError(null);
    try {
      await socketClient.request("cash:handover", { riderId: target.riderId, amountUsd: usd, note: note.trim() || undefined, clientRef: ref });
      toast(fr ? `Remise de ${formatCurrency(usd, locale)} enregistrée` : `Hand-over of ${formatCurrency(usd, locale)} recorded`);
      setTarget(null);
      await Promise.all([recQ.reload(), histQ.reload()]);
    } catch (e) {
      setFormError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (codEnabled !== true) return null;

  return (
    <div className="space-y-6">
      <PageHeader
        title={fr ? "Espèces COD" : "COD cash"}
        subtitle={fr ? "Espèces encaissées par les livreurs et remises à l'entrepôt" : "Cash the riders collected and handed in at the warehouse"}
        breadcrumbs={[{ label: base.startsWith("/admin") ? "Admin" : (fr ? "Entrepôt" : "Warehouse"), href: base.startsWith("/admin") ? "/admin/fulfillment" : "/warehouse" }, { label: fr ? "Espèces COD" : "COD cash" }]}
        actions={
          codEnabled === null ? undefined : (
            <Badge variant={codEnabled ? "success" : "warning"}>
              {codEnabled
                ? (fr ? "Le paiement à la livraison est activé" : "COD is currently enabled")
                : (fr ? "Le paiement à la livraison est désactivé" : "COD is currently disabled")}
            </Badge>
          )
        }
      />
      <HubScopeBar />
      {settingsError && <p className="text-xs text-slate-500">{fr ? "Réglage COD indisponible : " : "COD setting unavailable: "}{settingsError}</p>}
      {recQ.error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{recQ.error}</p>}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title={fr ? "Encore détenu par les livreurs" : "Still held by riders"} value={formatCurrency(held, locale)} icon={Banknote} />
        <StatCard title={fr ? "Encaissé (enregistré)" : "Collected (recorded)"} value={formatCurrency(collected, locale)} icon={HandCoins} />
        <StatCard title={fr ? "Remis à l'entrepôt" : "Handed in"} value={formatCurrency(handed, locale)} icon={Package} />
        <StatCard title={fr ? "Livreurs" : "Riders"} value={rows.filter((r) => r.riderId !== "unassigned").length} icon={Bike} />
      </div>

      <Card>
        <CardContent className="p-0">
          <DataTable
            emptyMessage={recQ.loading ? (fr ? "Chargement…" : "Loading…") : (fr ? "Aucune livraison terminée." : "No delivered parcels yet.")}
            columns={[
              { key: "name", label: fr ? "Livreur" : "Rider" },
              { key: "parcels", label: fr ? "Colis livrés" : "Delivered parcels" },
              { key: "codUsd", label: fr ? "Dû" : "Due", render: (row) => formatCurrency(Number(row.codUsd), locale) },
              { key: "collectedUsd", label: fr ? "Encaissé" : "Collected", render: (row) => formatCurrency(Number(row.collectedUsd), locale) },
              { key: "handedOverUsd", label: fr ? "Remis" : "Handed in", render: (row) => formatCurrency(Number(row.handedOverUsd), locale) },
              { key: "heldUsd", label: fr ? "Reste à remettre" : "Still to hand over", render: (row) => (
                <span className="font-semibold">{formatCurrency(Number(row.heldUsd), locale)}</span>
              )},
              { key: "lastHandoverAt", label: fr ? "Dernière remise" : "Last hand-over", render: (row) => (row.lastHandoverAt ? new Date(String(row.lastHandoverAt)).toLocaleString(locale) : "—") },
              { key: "action", label: "", render: (row) =>
                row.riderId !== "unassigned" && Number(row.heldUsd) > 0.004 ? (
                  <Button size="sm" variant="secondary" onClick={() => openHandover(row as unknown as Row)}>
                    {fr ? "Enregistrer une remise" : "Record hand-over"}
                  </Button>
                ) : null },
            ]}
            data={rows as unknown as Record<string, unknown>[]}
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <h2 className="mb-3 font-semibold text-slate-900">{fr ? "Remises enregistrées" : "Recorded hand-overs"}</h2>
          {histQ.data.length === 0 ? (
            <p className="text-sm text-slate-500">{histQ.loading ? (fr ? "Chargement…" : "Loading…") : (fr ? "Aucune remise enregistrée pour l'instant." : "No hand-over recorded yet.")}</p>
          ) : (
            <ul className="divide-y divide-[var(--border)] text-sm">
              {histQ.data.map((h) => (
                <li key={h.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>
                    <span className="font-semibold">{formatCurrency(h.amountUsd, locale)}</span> {fr ? "de" : "from"} {h.riderName}{" "}
                    <span className="text-slate-500">{fr ? `reçus par ${h.receivedByName}` : `received by ${h.receivedByName}`}</span>
                    {h.note && <span className="block text-xs text-slate-500">{h.note}</span>}
                  </span>
                  <span className="text-right text-xs text-slate-500">
                    {new Date(h.createdAt).toLocaleString(locale)}
                    <span className="block">{fr ? `reste ${formatCurrency(h.heldAfterUsd, locale)}` : `${formatCurrency(h.heldAfterUsd, locale)} left`}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-slate-500">
        {fr
          ? "« Dû » est ce que les colis livrés devaient rapporter ; « Encaissé » est le montant que le livreur a confirmé au moment de la livraison. Les livraisons d'avant l'enregistrement des espèces ne figurent que sous « Dû »."
          : "\"Due\" is what the delivered parcels were meant to bring in; \"Collected\" is the amount the rider confirmed at the door. Deliveries from before the cash record only appear under \"Due\"."}
      </p>

      <Modal
        open={target !== null}
        title={fr ? "Enregistrer une remise d'espèces" : "Record a cash hand-over"}
        onClose={() => (busy ? undefined : setTarget(null))}
        footer={
          <>
            <Button variant="secondary" onClick={() => setTarget(null)} disabled={busy}>{fr ? "Annuler" : "Cancel"}</Button>
            <Button onClick={() => void submit()} disabled={busy}>{busy ? "…" : (fr ? "Enregistrer" : "Record")}</Button>
          </>
        }
      >
        {target && (
          <>
            <p>
              {fr
                ? `${target.name} détient ${formatCurrency(target.heldUsd, locale)}. Saisissez le montant que vous recevez maintenant (une remise partielle est possible).`
                : `${target.name} holds ${formatCurrency(target.heldUsd, locale)}. Enter the amount you are receiving now (a partial hand-over is fine).`}
            </p>
            <label className="block text-xs font-medium text-slate-600">
              {fr ? "Montant reçu (USD)" : "Amount received (USD)"}
              <input className="input-premium mt-1 w-full px-4 py-2 text-base" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.,]/g, ""))} />
            </label>
            <label className="block text-xs font-medium text-slate-600">
              {fr ? "Note (facultatif)" : "Note (optional)"}
              <input className="input-premium mt-1 w-full px-4 py-2 text-sm" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />
            </label>
            <ErrorNote message={formError} />
          </>
        )}
      </Modal>
    </div>
  );
}
