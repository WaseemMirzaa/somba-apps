"use client";

import { useEffect, useState } from "react";
import { FileText, Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { DetailGridSection } from "@/components/ui/detail-grid";
import { InfoGrid } from "@/components/ui/info-grid";
import { OpsError } from "@/components/warehouse/ops-state";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";
import { socketClient } from "@/lib/realtime/socket-client";
import {
  DOCUMENT_TYPES,
  DOC_STATUS,
  FUEL_TYPES,
  VEHICLE_TYPES,
  expiryBadge,
  fmtDay,
  pickL,
  reasonProblem,
  statusVariant,
  summarize,
  vehicleProblem,
  vehicleToForm,
  vehicleToPatch,
  type ComplianceView,
  type DocumentView,
  type VehicleForm,
  type VehicleView,
} from "@/lib/rider-compliance-format";
import { errorMessage, useOpsQuery } from "@/lib/warehouse-live";

/**
 * "Vehicle & compliance" of a rider, on both rider detail pages (the warehouse portal and the admin portal share one page).
 * Everything goes through the API (`riderCompliance:*`), which decides who may see and change it: operations admins any rider,
 * the supervisors and managers of the rider's own warehouse theirs, everyone else gets the server's sentence. Documents open in a
 * new tab through a 5-minute signed link (`private:link`). Expired and expiring documents are badges: nothing blocks the rider.
 */
export function RiderComplianceSection({ riderId }: { riderId: string }) {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const { toast } = useToast();
  const q = useOpsQuery<ComplianceView | null>("riderCompliance:get", { initial: null, body: { riderId }, push: ["riderCompliance:updated"] });
  const [editing, setEditing] = useState(false);
  const [rejecting, setRejecting] = useState<DocumentView | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const title = fr ? "Véhicule et conformité" : "Vehicle & compliance";
  const data = q.data;

  async function open(d: DocumentView) {
    setBusy(`open-${d.id}`);
    try {
      const res = await socketClient.request<{ url: string }>("private:link", { id: d.fileId });
      window.open(res.url, "_blank", "noopener,noreferrer");
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusy(null);
    }
  }

  async function approve(d: DocumentView) {
    setBusy(`approve-${d.id}`);
    try {
      await socketClient.request<DocumentView>("riderCompliance:reviewDocument", { id: d.id, decision: "approve" });
      toast(fr ? "Document approuvé" : "Document approved");
      void q.reload();
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusy(null);
    }
  }

  const summary = data ? summarize(data.documents) : null;

  return (
    <>
      <DetailGridSection
        title={title}
        span={3}
        action={
          data?.canEdit ? (
            <Button size="sm" variant="secondary" onClick={() => setEditing(true)} aria-label={fr ? "Modifier le véhicule" : "Edit vehicle"}>
              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
              {data.vehicle.exists ? (fr ? "Modifier le véhicule" : "Edit vehicle") : fr ? "Ajouter le véhicule" : "Add vehicle"}
            </Button>
          ) : undefined
        }
      >
        {q.error && <OpsError message={q.error} onRetry={() => void q.reload()} />}
        {!data && !q.error && <p role="status" className="py-4 text-sm text-slate-500">{fr ? "Chargement…" : "Loading…"}</p>}
        {data && (
          <div className="space-y-6">
            <VehicleSummary v={data.vehicle} fr={fr} />

            <div>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <h4 className="text-sm font-semibold text-slate-800">{fr ? "Documents" : "Documents"}</h4>
                {summary && summary.pending > 0 && <Badge variant="warning">{fr ? `${summary.pending} à examiner` : `${summary.pending} to review`}</Badge>}
                {summary && summary.expired > 0 && <Badge variant="danger">{fr ? `${summary.expired} expiré${summary.expired > 1 ? "s" : ""}` : `${summary.expired} expired`}</Badge>}
                {summary && summary.expiring > 0 && <Badge variant="warning">{fr ? `${summary.expiring} expire${summary.expiring > 1 ? "nt" : ""} sous 30 jours` : `${summary.expiring} expiring within 30 days`}</Badge>}
              </div>
              <DataTable
                emptyMessage={fr ? "Aucun document envoyé." : "No documents sent yet."}
                columns={[
                  { key: "type", label: fr ? "Document" : "Document", primary: true, render: (row) => <span className="font-medium">{pickL(DOCUMENT_TYPES[String(row.type)], fr, String(row.type))}</span> },
                  { key: "number", label: fr ? "Numéro" : "Number", render: (row) => (row.number ? String(row.number) : "—") },
                  {
                    key: "expiresOn",
                    label: fr ? "Expiration" : "Expires",
                    render: (row) => {
                      const d = row as unknown as DocumentView;
                      const b = expiryBadge(d.expiry, fr);
                      return (
                        <span className="flex flex-wrap items-center gap-2">
                          <span>{d.expiresOn ? fmtDay(d.expiresOn, fr) : fr ? "Sans date" : "No date"}</span>
                          {b && <Badge variant={b.variant}>{b.text}</Badge>}
                        </span>
                      );
                    },
                  },
                  {
                    key: "status",
                    label: fr ? "Statut" : "Status",
                    render: (row) => {
                      const d = row as unknown as DocumentView;
                      return (
                        <span className="flex flex-col items-start gap-1">
                          <Badge variant={statusVariant(d.status)}>{pickL(DOC_STATUS[d.status], fr, d.status)}</Badge>
                          {d.reviewedByName && d.status !== "pending" && <span className="text-xs text-slate-500">{fr ? "par" : "by"} {d.reviewedByName}</span>}
                          {d.status === "rejected" && d.rejectionReason && <span className="max-w-[16rem] break-words text-xs text-red-700">{d.rejectionReason}</span>}
                        </span>
                      );
                    },
                  },
                  {
                    key: "actions",
                    label: "",
                    render: (row) => {
                      const d = row as unknown as DocumentView;
                      return (
                        <span className="flex flex-wrap items-center gap-2">
                          <Button size="sm" variant="secondary" disabled={busy === `open-${d.id}`} onClick={() => void open(d)} aria-label={fr ? "Ouvrir le document" : "Open document"}>
                            <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                            {fr ? "Ouvrir" : "Open"}
                          </Button>
                          {data.canEdit && d.status !== "approved" && (
                            <Button size="sm" variant="approve" disabled={busy === `approve-${d.id}`} onClick={() => void approve(d)}>
                              {fr ? "Approuver" : "Approve"}
                            </Button>
                          )}
                          {data.canEdit && d.status !== "rejected" && (
                            <Button size="sm" variant="reject" onClick={() => setRejecting(d)}>
                              {fr ? "Refuser" : "Reject"}
                            </Button>
                          )}
                        </span>
                      );
                    },
                  },
                ]}
                data={data.documents as unknown as Record<string, unknown>[]}
              />
              <p className="mt-2 text-xs text-slate-400">
                {fr ? "Fichiers privés : un lien sécurisé de 5 minutes est créé à chaque ouverture. Un document expiré n'empêche pas le livreur de travailler." : "Private files: a secure 5-minute link is created each time you open one. An expired document does not stop the rider from working."}
              </p>
            </div>
          </div>
        )}
      </DetailGridSection>

      {editing && data && (
        <VehicleDialog
          riderId={riderId}
          riderName={data.rider.name}
          vehicle={data.vehicle}
          onClose={() => setEditing(false)}
          onSaved={() => {
            toast(fr ? "Véhicule enregistré" : "Vehicle saved");
            void q.reload();
          }}
        />
      )}
      {rejecting && (
        <RejectDialog
          doc={rejecting}
          onClose={() => setRejecting(null)}
          onDone={() => {
            toast(fr ? "Document refusé" : "Document rejected");
            void q.reload();
          }}
        />
      )}
    </>
  );
}

function VehicleSummary({ v, fr }: { v: VehicleView; fr: boolean }) {
  if (!v.exists) {
    return <p className="rounded-xl border border-dashed border-[var(--border-strong)] px-4 py-3 text-sm text-slate-500">{fr ? "Aucun véhicule enregistré pour ce livreur." : "No vehicle recorded for this rider yet."}</p>;
  }
  const ins = expiryBadge(v.insurance, fr);
  const svc = expiryBadge(v.service, fr, "service");
  const dash = "—";
  return (
    <InfoGrid
      columns={3}
      items={[
        { label: fr ? "Véhicule" : "Vehicle", value: [v.model, pickL(VEHICLE_TYPES[v.type ?? ""], fr)].filter(Boolean).join(" · ") || dash },
        { label: fr ? "Plaque" : "Plate", value: v.plate ?? dash },
        { label: fr ? "Couleur" : "Colour", value: v.colour ?? dash },
        { label: fr ? "Compteur" : "Odometer", value: v.odometerKm === null ? dash : `${v.odometerKm.toLocaleString(fr ? "fr-FR" : "en-GB")} km` },
        { label: fr ? "Carburant" : "Fuel", value: pickL(FUEL_TYPES[v.fuel ?? ""], fr, dash) },
        {
          label: fr ? "Assurance valable jusqu'au" : "Insurance valid until",
          value: (
            <span className="flex flex-wrap items-center gap-2">
              <span>{fmtDay(v.insuranceValidUntil, fr)}</span>
              {ins && <Badge variant={ins.variant}>{ins.text}</Badge>}
            </span>
          ),
        },
        { label: fr ? "Dernier entretien" : "Last service", value: fmtDay(v.lastServiceOn, fr) },
        {
          label: fr ? "Prochain entretien" : "Next service",
          value: (
            <span className="flex flex-wrap items-center gap-2">
              <span>{fmtDay(v.nextServiceOn, fr)}</span>
              {svc && <Badge variant={svc.variant}>{svc.text}</Badge>}
            </span>
          ),
        },
      ]}
    />
  );
}

const field = "input-premium mt-1 w-full px-3 py-2 text-sm";

function VehicleDialog({ riderId, riderName, vehicle, onClose, onSaved }: { riderId: string; riderName: string; vehicle: VehicleView; onClose: () => void; onSaved: () => void }) {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const { toast } = useToast();
  const [form, setForm] = useState<VehicleForm>(() => vehicleToForm(vehicle));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof VehicleForm, v: string) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const bad = vehicleProblem(form, fr);
    setError(bad);
    if (bad) {
      toast(bad, "error");
      return;
    }
    const patch = vehicleToPatch(form, vehicle);
    if (Object.keys(patch).length === 0) {
      toast(fr ? "Aucun changement à enregistrer" : "Nothing to save", "info");
      return;
    }
    setBusy(true);
    try {
      await socketClient.request<VehicleView>("riderCompliance:updateVehicle", { riderId, ...patch });
      onSaved();
      onClose();
    } catch (err) {
      const m = errorMessage(err);
      setError(m);
      toast(m, "error");
    } finally {
      setBusy(false);
    }
  }

  const label = "block text-xs font-medium text-slate-600";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/40 p-4" role="dialog" aria-modal="true" aria-label={fr ? "Modifier le véhicule" : "Edit vehicle"}>
      <form onSubmit={save} noValidate className="card-premium my-auto w-full max-w-2xl p-6">
        <h3 className="text-lg font-semibold text-slate-900">{fr ? "Véhicule de" : "Vehicle of"} {riderName}</h3>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className={label}>
            {fr ? "Modèle" : "Model"}
            <input className={field} value={form.model} maxLength={80} onChange={(e) => set("model", e.target.value)} />
          </label>
          <label className={label}>
            {fr ? "Type" : "Type"}
            <select className={field} value={form.type} onChange={(e) => set("type", e.target.value)}>
              <option value="">—</option>
              {Object.entries(VEHICLE_TYPES).map(([k, l]) => <option key={k} value={k}>{pickL(l, fr)}</option>)}
            </select>
          </label>
          <label className={label}>
            {fr ? "Plaque" : "Plate"}
            <input className={field} value={form.plate} maxLength={20} onChange={(e) => set("plate", e.target.value)} />
          </label>
          <label className={label}>
            {fr ? "Couleur" : "Colour"}
            <input className={field} value={form.colour} maxLength={40} onChange={(e) => set("colour", e.target.value)} />
          </label>
          <label className={label}>
            {fr ? "Compteur (km)" : "Odometer (km)"}
            <input className={field} inputMode="numeric" value={form.odometerKm} onChange={(e) => set("odometerKm", e.target.value)} />
          </label>
          <label className={label}>
            {fr ? "Carburant" : "Fuel"}
            <select className={field} value={form.fuel} onChange={(e) => set("fuel", e.target.value)}>
              <option value="">—</option>
              {Object.entries(FUEL_TYPES).map(([k, l]) => <option key={k} value={k}>{pickL(l, fr)}</option>)}
            </select>
          </label>
          <label className={label}>
            {fr ? "Assurance valable jusqu'au" : "Insurance valid until"}
            <input type="date" className={field} value={form.insuranceValidUntil} onChange={(e) => set("insuranceValidUntil", e.target.value)} />
          </label>
          <label className={label}>
            {fr ? "Dernier entretien" : "Last service"}
            <input type="date" className={field} value={form.lastServiceOn} onChange={(e) => set("lastServiceOn", e.target.value)} />
          </label>
          <label className={label}>
            {fr ? "Prochain entretien" : "Next service"}
            <input type="date" className={field} value={form.nextServiceOn} onChange={(e) => set("nextServiceOn", e.target.value)} />
          </label>
        </div>
        <p className="mt-3 text-xs text-slate-500">{fr ? "Le livreur voit ces informations en lecture seule dans son application. Laissez un champ vide pour l'effacer." : "The rider sees this read-only in their app. Leave a field empty to clear it."}</p>
        {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <div className="mt-6 flex items-center justify-end gap-4">
          <button type="button" onClick={onClose} disabled={busy} className="text-sm font-medium text-slate-600 hover:text-slate-900">
            {fr ? "Annuler" : "Cancel"}
          </button>
          <button type="submit" disabled={busy} className="btn-primary min-w-[9rem] rounded-xl px-5 py-2.5 text-sm font-medium disabled:opacity-60">
            {busy ? "…" : fr ? "Enregistrer" : "Save"}
          </button>
        </div>
      </form>
    </div>
  );
}

function RejectDialog({ doc, onClose, onDone }: { doc: DocumentView; onClose: () => void; onDone: () => void }) {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const { toast } = useToast();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const bad = reasonProblem(reason, fr);
    setError(bad);
    if (bad) {
      toast(bad, "error");
      return;
    }
    setBusy(true);
    try {
      await socketClient.request<DocumentView>("riderCompliance:reviewDocument", { id: doc.id, decision: "reject", reason: reason.trim() });
      onDone();
      onClose();
    } catch (err) {
      const m = errorMessage(err);
      setError(m);
      toast(m, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label={fr ? "Refuser le document" : "Reject document"}>
      <form onSubmit={submit} noValidate className="card-premium w-full max-w-md p-6">
        <h3 className="text-lg font-semibold text-slate-900">{fr ? "Refuser" : "Reject"} : {pickL(DOCUMENT_TYPES[doc.type], fr, doc.type)}</h3>
        <label className="mt-4 block text-xs font-medium text-slate-600">
          {fr ? "Motif (le livreur le lira)" : "Reason (the rider will read it)"}
          <textarea className="input-premium mt-1 w-full px-3 py-2 text-sm" rows={3} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
        </label>
        {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <div className="mt-6 flex items-center justify-end gap-4">
          <button type="button" onClick={onClose} disabled={busy} className="text-sm font-medium text-slate-600 hover:text-slate-900">
            {fr ? "Annuler" : "Cancel"}
          </button>
          <button type="submit" disabled={busy} className="btn-primary min-w-[9rem] rounded-xl px-5 py-2.5 text-sm font-medium disabled:opacity-60">
            {busy ? "…" : fr ? "Refuser le document" : "Reject document"}
          </button>
        </div>
      </form>
    </div>
  );
}
