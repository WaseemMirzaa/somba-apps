"use client";

import { useState } from "react";
import { OpsError } from "@/components/warehouse/ops-state";
import { BusyButton, Field, ReadOnlyNote, inputCls, useAct } from "@/components/warehouse/stock/shared";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { useLocale } from "@/context/locale-context";
import { stockApi, useStockAccess, useStockQuery, type StockBin } from "@/lib/stock";

/** The bins of the warehouse: what each holds, create one, switch an empty one off. */
export function BinsTab() {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const access = useStockAccess();
  const { run, busy } = useAct();
  const q = useStockQuery<StockBin[]>("stock:bins", {}, []);
  const [code, setCode] = useState("");
  const [label, setLabel] = useState("");

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const c = code.trim();
    if (!c) return;
    const done = await run(() => stockApi.createBin({ code: c, label: label.trim() || undefined, ...(access.hubId ? { hubId: access.hubId } : {}) }), (b) => (fr ? `Emplacement ${b.code} créé` : `Bin ${b.code} created`));
    if (done) {
      setCode("");
      setLabel("");
    }
  }

  const toggle = (b: StockBin) =>
    run(() => stockApi.updateBin({ binId: b.id, active: !b.active, ...(access.hubId ? { hubId: access.hubId } : {}) }), () => (b.active ? (fr ? `${b.code} désactivé` : `${b.code} switched off`) : fr ? `${b.code} réactivé` : `${b.code} switched on`));

  return (
    <div className="space-y-5">
      <ReadOnlyNote why={access.readOnlyWhy} />
      {access.canOversee && (
        <Card>
          <CardHeader>
            <h2 className="font-semibold text-slate-900">{fr ? "Nouvel emplacement" : "New bin"}</h2>
            <p className="mt-0.5 text-sm text-slate-500">{fr ? "Le code est celui imprimé sur l'étiquette (lettres, chiffres et . _ / -)." : "The code is what is printed on the label (letters, digits and . _ / -)."}</p>
          </CardHeader>
          <CardContent>
            <form onSubmit={create} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end" data-testid="bin-form">
              <Field label={fr ? "Code" : "Code"}>
                <input value={code} onChange={(e) => setCode(e.target.value)} maxLength={40} className={inputCls} placeholder="A-01-3" autoCapitalize="characters" />
              </Field>
              <Field label={fr ? "Libellé (facultatif)" : "Label (optional)"}>
                <input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={120} className={inputCls} />
              </Field>
              <BusyButton busy={busy} disabled={!code.trim()}>
                {fr ? "Créer" : "Create"}
              </BusyButton>
            </form>
          </CardContent>
        </Card>
      )}
      {q.error && <OpsError message={q.error} onRetry={() => void q.reload()} />}
      <Card>
        <CardContent className="p-0">
          <DataTable
            emptyMessage={q.loading ? (fr ? "Chargement…" : "Loading…") : fr ? "Aucun emplacement. La zone de réception est créée à la première réception." : "No bins yet. The receiving area is created on the first receipt."}
            columns={[
              { key: "code", label: fr ? "Code" : "Code", primary: true, render: (r) => <span className="font-semibold">{String(r.code)}</span> },
              { key: "label", label: fr ? "Libellé" : "Label", render: (r) => String(r.label ?? "—") },
              { key: "units", label: fr ? "Unités" : "Units", render: (r) => <span className="tabular-nums">{String(r.units)}</span> },
              { key: "skus", label: "SKU", render: (r) => <span className="tabular-nums">{String(r.skus)}</span> },
              { key: "active", label: fr ? "État" : "State", render: (r) => <Badge variant={r.active ? "success" : "default"}>{r.active ? (fr ? "Actif" : "Active") : fr ? "Désactivé" : "Off"}</Badge> },
              {
                key: "actions",
                label: fr ? "Action" : "Action",
                render: (r) =>
                  access.canOversee && r.code !== "RECV" ? (
                    <button type="button" disabled={busy} onClick={() => void toggle(r as unknown as StockBin)} className="rounded-lg border border-[var(--border-strong)] bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                      {r.active ? (fr ? "Désactiver" : "Switch off") : fr ? "Réactiver" : "Switch on"}
                    </button>
                  ) : null,
              },
            ]}
            data={q.data as unknown as Record<string, unknown>[]}
          />
        </CardContent>
      </Card>
    </div>
  );
}
