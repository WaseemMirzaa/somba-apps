"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LoadError, SectionLoader } from "@/components/seller/data-state";
import { BoxCountStepper } from "@/components/seller/box-count-stepper";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";
import { useSellerAccess, useSellerData } from "@/lib/seller";
import { useLiveQuery } from "@/lib/seller-api";
import { errMessage } from "@/lib/seller-labels";
import { boxesPhrase, contentLineText, labelsReadyToast, type ParcelLabelPack } from "@/lib/parcel-labels";
import { clusterSelection, packButtonText, type PackCluster } from "@/lib/pack-several";

const PAGE = 5;

/** One cluster: same-day orders of one customer and address. Pick the orders, one box count, one set of labels. */
function Cluster({ cluster, onPacked }: { cluster: PackCluster; onPacked: () => void }) {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const { toast } = useToast();
  const access = useSellerAccess();
  const { sellerPack } = useSellerData();
  const [ticked, setPicked] = useState<Set<string>>(() => new Set(cluster.orders.map((o) => o.id)));
  const [boxes, setBoxes] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<ParcelLabelPack | null>(null);
  const ids = useMemo(() => cluster.orders.map((o) => o.id), [cluster]);

  // Orders that arrive while the page is open are not ticked behind the seller's back; ones that left the cluster drop out of the selection.
  const picked = useMemo(() => new Set([...ticked].filter((id) => ids.includes(id))), [ticked, ids]);

  const chosen = clusterSelection(cluster.orders, picked);
  const first = chosen[0] ?? cluster.orders[0];

  function toggle(id: string) {
    setPicked((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function pack() {
    if (!chosen.length) return;
    setBusy(true);
    setError(null);
    try {
      const made = await sellerPack(chosen.map((o) => o.id), boxes);
      setDone(made);
      toast(`${labelsReadyToast(made.boxCount, fr)}. ${fr ? `${chosen.length} commande(s) marquée(s) prête(s) : un seul jeu d'étiquettes.` : `${chosen.length} order(s) marked ready: one set of labels.`}`);
      onPacked();
    } catch (e) {
      const msg = errMessage(e);
      setError(msg);
      toast(msg, "error");
    } finally {
      setBusy(false);
    }
  }

  const area = cluster.area ?? (fr ? "adresse inconnue" : "unknown address");
  return (
    <li className="space-y-3 rounded-xl border border-slate-200 p-4" data-testid="pack-cluster">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-semibold text-slate-900">
          {area} <span className="font-normal text-slate-500">· {cluster.dayKey}</span>
          {cluster.deliveryMode === "express" && <Badge variant="info" className="ml-2">Express</Badge>}
        </p>
        <p className="text-xs text-slate-500">{fr ? `${cluster.orders.length} commandes du même client` : `${cluster.orders.length} orders from the same customer`}</p>
      </div>
      <ul className="space-y-2">
        {cluster.orders.map((o) => (
          <li key={o.id} className="flex items-start gap-3 text-sm" data-testid="pack-order">
            <input
              type="checkbox"
              id={`pack-${o.id}`}
              className="mt-1 h-4 w-4 accent-[var(--primary)]"
              checked={picked.has(o.id)}
              onChange={() => toggle(o.id)}
              disabled={busy || access.suspended}
            />
            <label htmlFor={`pack-${o.id}`} className="min-w-0 flex-1 cursor-pointer">
              <span className="font-medium text-slate-900">{o.reference}</span>
              <span className="text-slate-500"> · {o.customerFirstName ?? "—"}</span>
              {o.packageStatus !== "to_pack" && <Badge variant="success" className="ml-2">{fr ? "Prêt" : "Ready"}</Badge>}
              <span className="block break-words text-xs text-slate-600">{o.items.map((i) => contentLineText({ ...i, nameFr: i.nameFr ?? null, variantFr: i.variantFr ?? null }, fr)).join(", ")}</span>
            </label>
            <Link href={`/seller/orders/${encodeURIComponent(o.reference)}`} className="shrink-0 text-xs text-[var(--primary)] hover:underline">{fr ? "Ouvrir" : "Open"}</Link>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor={`pack-boxes-${cluster.key}`} className="text-sm text-slate-700">{fr ? "Boîtes pour toutes ces commandes" : "Boxes for all these orders"}</label>
        <BoxCountStepper id={`pack-boxes-${cluster.key}`} value={boxes} onChange={setBoxes} disabled={busy || access.suspended} fr={fr} />
        <button type="button" onClick={() => void pack()} disabled={busy || access.suspended || !chosen.length} className="btn-primary rounded-lg px-4 py-2 text-sm disabled:opacity-50" data-testid="pack-button">
          {busy ? (fr ? "Envoi…" : "Sending…") : packButtonText(chosen.length, fr)}
        </button>
      </div>
      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {done && first && (
        <p className="flex flex-wrap items-center gap-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800" data-testid="pack-done">
          <span>{fr ? `${boxesPhrase(done.boxCount, true)} : collez une étiquette sur chaque boîte.` : `${boxesPhrase(done.boxCount, false)}: stick one label on each box.`}</span>
          <Link href={`/seller/orders/${encodeURIComponent(first.id)}/labels${done.groupId ? `?group=${encodeURIComponent(done.groupId)}` : ""}`} className="btn-primary rounded-lg px-3 py-1.5 text-sm">
            {fr ? "Imprimer les étiquettes" : "Print labels"}
          </Link>
        </p>
      )}
    </li>
  );
}

/**
 * "Pack and label several orders": the seller's same-day orders of one customer and address, clustered by the server (paged, so a
 * busy store still loads fast). Tick the orders that go in the same boxes, choose one box count, and get ONE set of labels that lists
 * every order's products. Only before a rider collects them; the street and phone never appear.
 */
export function PackSeveral() {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const [offset, setOffset] = useState(0);
  const query = useMemo(() => ({ limit: PAGE, offset }), [offset]);
  const groups = useLiveQuery<{ clusters: PackCluster[]; total: number; limit: number; offset: number }>("orders:sellerGroups", query, {
    pushes: ["order:created", "order:updated", "task:updated"],
  });
  const total = groups.data?.total ?? 0;
  const clusters = groups.data?.clusters ?? [];

  return (
    <Card>
      <CardContent className="space-y-3 p-4" data-testid="pack-several">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">{fr ? "Préparer et étiqueter plusieurs commandes" : "Pack and label several orders"}</h2>
          <p className="text-xs text-slate-500">
            {fr
              ? "Plusieurs commandes du même client, le même jour, à la même adresse peuvent partir dans les mêmes boîtes : un seul QR par boîte, avec tous les produits listés."
              : "Same-day orders from one customer to one address can go in the same boxes: one QR per box, with every product listed."}
          </p>
        </div>
        {groups.error && <LoadError message={groups.error} onRetry={groups.reload} />}
        {groups.loading ? (
          <SectionLoader className="py-4" />
        ) : clusters.length === 0 ? (
          <p className="text-sm text-slate-500" data-testid="pack-empty">
            {fr ? "Aucune commande du jour à regrouper pour le moment." : "No same-day orders to group right now."}
            {total > 0 && offset > 0 && (
              <button type="button" onClick={() => setOffset(0)} className="ml-2 text-[var(--primary)] hover:underline">{fr ? "Revenir au début" : "Back to the first groups"}</button>
            )}
          </p>
        ) : (
          <>
            <ul className="space-y-3">
              {clusters.map((c) => (
                <Cluster key={c.key} cluster={c} onPacked={() => void groups.reload()} />
              ))}
            </ul>
            {total > PAGE && (
              <div className="flex items-center justify-between text-xs text-slate-600">
                <span>{fr ? `Groupes ${offset + 1}–${Math.min(offset + PAGE, total)} sur ${total}` : `Groups ${offset + 1}–${Math.min(offset + PAGE, total)} of ${total}`}</span>
                <span className="flex gap-2">
                  <button type="button" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))} className="rounded-lg border border-slate-200 px-3 py-1 disabled:opacity-50">{fr ? "Précédent" : "Previous"}</button>
                  <button type="button" disabled={offset + PAGE >= total} onClick={() => setOffset(offset + PAGE)} className="rounded-lg border border-slate-200 px-3 py-1 disabled:opacity-50">{fr ? "Suivant" : "Next"}</button>
                </span>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
