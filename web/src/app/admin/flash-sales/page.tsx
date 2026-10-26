"use client";

import { useEffect, useMemo, useState } from "react";
import { localDateTime } from "@/lib/dates";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { Tabs } from "@/components/ui/tabs";
import { ErrorNote, Modal } from "@/components/admin/modal";
import { SectionError, SectionLoading } from "@/components/admin/query-state";
import { useRealtime } from "@/context/realtime-context";
import { useToast } from "@/context/toast-context";
import { useLocale } from "@/context/locale-context";
import { adminBreadcrumb } from "@/lib/admin-i18n";
import { errMsg, useServerList, type FlashSaleServerRow } from "@/lib/admin-live";
import { socketClient } from "@/lib/realtime/socket-client";
import { formatCurrency } from "@/lib/utils";
import { autoTranslateHint, localized, pickText } from "@/lib/i18n-fields";

type Phase = "scheduled" | "running" | "ended";
const PHASE_EN: Record<Phase, string> = { running: "Running", scheduled: "Scheduled", ended: "Ended" };
const PHASE_FR: Record<Phase, string> = { running: "En cours", scheduled: "Planifiée", ended: "Terminée" };

/** Where a sale stands now, from its dates (the server's `phase` can be a few seconds old). */
function phaseOf(fs: FlashSaleServerRow, now: number): Phase {
  const start = fs.startsAt ? new Date(fs.startsAt).getTime() : null;
  const end = fs.endsAt ? new Date(fs.endsAt).getTime() : null;
  if (fs.active === false && fs.phase !== "scheduled" && fs.status !== "nominated") return "ended";
  if (end !== null && !Number.isNaN(end) && end <= now) return "ended";
  if (start !== null && !Number.isNaN(start) && start > now) return "scheduled";
  return "running";
}

function fmt(iso: string | null): string {
  return iso ? localDateTime(iso) : "—";
}

/** "2 d 03:15:09" / "03:15:09" until `iso`. */
function countdown(iso: string | null, now: number): string {
  if (!iso) return "—";
  const ms = new Date(iso).getTime() - now;
  if (!Number.isFinite(ms) || ms <= 0) return "00:00:00";
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const hh = String(Math.floor((s % 86400) / 3600)).padStart(2, "0");
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${d > 0 ? `${d} d ` : ""}${hh}:${mm}:${ss}`;
}

/** Value for an `<input type="datetime-local">` from an ISO instant (in the viewer's time zone). */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

const EMPTY = { title: "", titleFr: "", productId: "", flashPrice: "", startsAt: "", endsAt: "" };

export default function AdminFlashSalesPage() {
  const { toast } = useToast();
  const { locale } = useLocale();
  const fr = locale === "fr";
  const rt = useRealtime();
  const { items: sales, setItems, reload, error: loadError, loading } = useServerList<FlashSaleServerRow>("flashsales:list", {
    body: { all: true },
    pushEvents: ["flashsale:updated"],
  });
  const liveProducts = useMemo(() => rt.products.filter((p) => p.status === "live"), [rt.products]);
  const [tab, setTab] = useState<"sales" | "nominations">("sales");
  const [now, setNow] = useState(() => Date.now());
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [endTarget, setEndTarget] = useState<FlashSaleServerRow | null>(null);
  const [delTarget, setDelTarget] = useState<FlashSaleServerRow | null>(null);
  const [editTarget, setEditTarget] = useState<FlashSaleServerRow | null>(null);
  const [edit, setEdit] = useState(EMPTY);
  const [declineTarget, setDeclineTarget] = useState<FlashSaleServerRow | null>(null);
  const [declineReason, setDeclineReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  // The countdowns tick every second.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // A sale deleted elsewhere leaves the list at once.
  useEffect(() => {
    if (rt.status !== "connected") return;
    const sock = socketClient.current;
    const onRemoved = (p: { id: string }) => setItems((cur) => cur.filter((x) => x.id !== p?.id));
    sock?.on("flashsale:removed", onRemoved);
    return () => {
      sock?.off("flashsale:removed", onRemoved);
    };
  }, [rt.status, setItems]);

  const nominations = useMemo(() => sales.filter((s) => s.status === "nominated"), [sales]);
  const declined = useMemo(() => sales.filter((s) => s.status === "declined"), [sales]);
  const rows = useMemo(() => sales.filter((s) => s.status !== "nominated" && s.status !== "declined").sort((a, b) => (b.startsAt ?? "").localeCompare(a.startsAt ?? "")), [sales]);

  const product = liveProducts.find((p) => p.id === form.productId);
  const basePrice = product ? (product.basePrice ?? product.originalPrice ?? product.price) : null;
  const flash = Number(form.flashPrice);
  const discount = basePrice && flash > 0 && flash < basePrice ? Math.round((1 - flash / basePrice) * 100) : 0;

  async function save() {
    if ((!form.title.trim() && !form.titleFr.trim()) || !product) {
      setError(fr ? "Un titre (anglais ou français) et un produit sont requis." : "A title (English or French) and a product are required.");
      return;
    }
    if (!(flash > 0)) {
      setError(fr ? "Saisissez un prix flash valide." : "Enter a valid flash price.");
      return;
    }
    if (form.startsAt && form.endsAt && new Date(form.endsAt) <= new Date(form.startsAt)) {
      setError(fr ? "La fin doit être après le début." : "The end must be after the start.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await socketClient.request("flashsales:create", {
        ...(form.title.trim() ? { title: form.title.trim() } : {}),
        ...(form.titleFr.trim() ? { titleFr: form.titleFr.trim() } : {}),
        productId: product.id,
        productName: product.name,
        flashPrice: flash,
        discount,
        startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : undefined,
        endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : undefined,
      });
      await reload();
      setShowCreate(false);
      setForm(EMPTY);
      toast(fr ? "Vente flash créée" : "Flash sale created", "success");
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setSaving(false);
    }
  }

  async function run(fn: () => Promise<unknown>, ok: string, close: () => void) {
    setBusy(true);
    setModalError(null);
    try {
      await fn();
      await reload();
      toast(ok, "success");
      close();
    } catch (e) {
      setModalError(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  function openEdit(fs: FlashSaleServerRow) {
    setModalError(null);
    setEdit({
      title: fs.title ?? "",
      titleFr: fs.titleFr ?? "",
      productId: fs.productId,
      flashPrice: String(fs.flashPrice),
      startsAt: toLocalInput(fs.startsAt),
      endsAt: toLocalInput(fs.endsAt),
    });
    setEditTarget(fs);
  }

  function saveEdit() {
    if (!editTarget) return;
    const price = Number(edit.flashPrice.replace(",", "."));
    if (!(price > 0)) {
      setModalError(fr ? "Saisissez un prix flash valide." : "Enter a valid flash price.");
      return;
    }
    if (edit.startsAt && edit.endsAt && new Date(edit.endsAt) <= new Date(edit.startsAt)) {
      setModalError(fr ? "La fin doit être après le début." : "The end must be after the start.");
      return;
    }
    void run(
      () =>
        socketClient.request("flashsales:update", {
          id: editTarget.id,
          patch: {
            flashPrice: price,
            ...(edit.title.trim() ? { title: edit.title.trim() } : {}),
            ...(edit.titleFr.trim() ? { titleFr: edit.titleFr.trim() } : {}),
            ...(edit.startsAt ? { startsAt: new Date(edit.startsAt).toISOString() } : {}),
            ...(edit.endsAt ? { endsAt: new Date(edit.endsAt).toISOString() } : {}),
          },
        }),
      fr ? "Vente flash modifiée" : "Flash sale updated",
      () => setEditTarget(null),
    );
  }

  function decline() {
    if (!declineTarget) return;
    const reason = declineReason.trim();
    if (reason.length < 3) {
      setModalError(fr ? "Donnez au vendeur un motif de refus (3 caractères minimum)." : "Give the seller a reason for declining (at least 3 characters).");
      return;
    }
    void run(() => socketClient.request("flashsales:decline", { id: declineTarget.id, reason }), fr ? "Proposition refusée" : "Nomination declined", () => {
      setDeclineTarget(null);
      setDeclineReason("");
    });
  }

  const phaseBadge = (fs: FlashSaleServerRow) => {
    const ph = phaseOf(fs, now);
    return <Badge variant={ph === "running" ? "success" : ph === "scheduled" ? "warning" : "default"}>{fr ? PHASE_FR[ph] : PHASE_EN[ph]}</Badge>;
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={fr ? "Ventes flash" : "Flash Sales"}
        subtitle={fr ? "Le prix flash est appliqué par le serveur pendant la fenêtre choisie ; les vendeurs peuvent en proposer" : "The server applies the flash price during the chosen window; sellers can propose sales"}
        breadcrumbs={[adminBreadcrumb(locale), { label: fr ? "Ventes flash" : "Flash Sales" }]}
        actions={<Button size="sm" onClick={() => { setShowCreate((s) => !s); setError(null); }}>{fr ? "Créer une vente flash" : "Create flash sale"}</Button>}
      />

      <Tabs
        active={tab}
        onChange={(id) => setTab(id as typeof tab)}
        tabs={[
          { id: "sales", label: fr ? `Ventes (${rows.length})` : `Sales (${rows.length})` },
          { id: "nominations", label: fr ? `Propositions (${nominations.length})` : `Nominations (${nominations.length})` },
        ]}
      />

      {loadError && <SectionError message={loadError} onRetry={reload} />}
      {loading && !loadError && <SectionLoading />}

      {showCreate && (
        <Card>
          <CardContent className="space-y-4 p-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <input className="input-premium w-full px-4 py-2.5 text-sm" placeholder={fr ? "Titre de la vente (EN)" : "Sale title (EN)"} aria-label={fr ? "Titre de la vente (EN)" : "Sale title (EN)"} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
              <input className="input-premium w-full px-4 py-2.5 text-sm" placeholder={fr ? "Titre de la vente (FR)" : "Sale title (FR)"} aria-label={fr ? "Titre de la vente (FR)" : "Sale title (FR)"} value={form.titleFr} onChange={(e) => setForm({ ...form, titleFr: e.target.value })} />
              <p className="text-xs text-slate-500 sm:col-span-2">{autoTranslateHint(fr)}</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="text-xs font-medium text-slate-500">{fr ? "Produit" : "Product"}</label>
                <select className="input-premium mt-1 w-full px-4 py-2.5 text-sm" value={form.productId} onChange={(e) => setForm({ ...form, productId: e.target.value })}>
                  <option value="">{fr ? "Choisir un produit…" : "Choose a product…"}</option>
                  {liveProducts.map((p) => (
                    <option key={p.id} value={p.id}>{pickText(fr, p.name, p.nameFr)} — {formatCurrency(p.basePrice ?? p.originalPrice ?? p.price, locale)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500">
                  {fr ? "Prix flash (USD)" : "Flash price (USD)"}
                  {basePrice ? ` — ${fr ? "remise" : "discount"} ${discount}%` : ""}
                </label>
                <input className="input-premium mt-1 w-full px-4 py-2.5 text-sm" inputMode="decimal" value={form.flashPrice} onChange={(e) => setForm({ ...form, flashPrice: e.target.value })} />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500">{fr ? "Début" : "Starts"}</label>
                <input type="datetime-local" className="input-premium mt-1 w-full px-4 py-2.5 text-sm" value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500">{fr ? "Fin" : "Ends"}</label>
                <input type="datetime-local" className="input-premium mt-1 w-full px-4 py-2.5 text-sm" value={form.endsAt} onChange={(e) => setForm({ ...form, endsAt: e.target.value })} />
              </div>
            </div>
            <ErrorNote message={error} />
            <Button onClick={save} disabled={saving}>{saving ? "…" : fr ? "Enregistrer la vente flash" : "Save flash sale"}</Button>
          </CardContent>
        </Card>
      )}

      {tab === "sales" ? (
        <Card>
          <CardContent className="p-0">
            <DataTable
              emptyMessage={loading ? (fr ? "Chargement…" : "Loading…") : fr ? "Aucune vente flash." : "No flash sales yet."}
              data={rows as unknown as Record<string, unknown>[]}
              columns={[
                {
                  key: "title",
                  label: fr ? "Vente flash" : "Flash sale",
                  render: (row) => {
                    const fs = row as unknown as FlashSaleServerRow;
                    return (
                      <div>
                        <p className="font-semibold text-slate-900">{localized(fs, "title", fr)}</p>
                        <p className="text-xs text-slate-500">{localized(fs, "productName", fr)}{fs.sellerName ? ` · ${fs.sellerName}` : ""}</p>
                      </div>
                    );
                  },
                },
                {
                  key: "startsAt",
                  label: fr ? "Période" : "Window",
                  render: (row) => {
                    const fs = row as unknown as FlashSaleServerRow;
                    return <span className="text-xs text-slate-500">{fmt(fs.startsAt)} → {fmt(fs.endsAt)}</span>;
                  },
                },
                {
                  key: "flashPrice",
                  label: fr ? "Prix flash" : "Flash price",
                  render: (row) => {
                    const fs = row as unknown as FlashSaleServerRow;
                    return <span>{formatCurrency(fs.flashPrice, locale)} · {fr ? `${fs.discount} % de remise` : `${fs.discount}% off`}</span>;
                  },
                },
                {
                  key: "status",
                  label: fr ? "Statut" : "Status",
                  render: (row) => {
                    const fs = row as unknown as FlashSaleServerRow;
                    const ph = phaseOf(fs, now);
                    return (
                      <div className="space-y-1">
                        {phaseBadge(fs)}
                        {ph === "scheduled" && <p className="font-mono text-xs text-slate-500">{fr ? "Début dans " : "Starts in "}{countdown(fs.startsAt, now)}</p>}
                        {ph === "running" && <p className="font-mono text-xs text-emerald-700">{fr ? "Fin dans " : "Ends in "}{countdown(fs.endsAt, now)}</p>}
                      </div>
                    );
                  },
                },
                {
                  key: "actions",
                  label: "",
                  render: (row) => {
                    const fs = row as unknown as FlashSaleServerRow;
                    const ph = phaseOf(fs, now);
                    return (
                      <div className="flex flex-wrap gap-2">
                        {ph !== "ended" && <Button size="sm" variant="secondary" className="whitespace-nowrap" onClick={() => openEdit(fs)}>{fr ? "Modifier" : "Edit"}</Button>}
                        {ph !== "ended" && (
                          <Button size="sm" variant="reject" className="whitespace-nowrap" onClick={() => { setModalError(null); setEndTarget(fs); }}>
                            {fr ? "Terminer" : "End now"}
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" className="whitespace-nowrap text-red-600" onClick={() => { setModalError(null); setDelTarget(fs); }}>{fr ? "Supprimer" : "Delete"}</Button>
                      </div>
                    );
                  },
                },
              ]}
            />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <Card>
            <CardContent className="p-0">
              <DataTable
                emptyMessage={fr ? "Aucune proposition en attente." : "No nominations waiting."}
                data={nominations as unknown as Record<string, unknown>[]}
                columns={[
                  {
                    key: "title",
                    label: fr ? "Proposition" : "Nomination",
                    render: (row) => {
                      const fs = row as unknown as FlashSaleServerRow;
                      return (
                        <div>
                          <p className="font-semibold text-slate-900">{localized(fs, "title", fr)}</p>
                          <p className="text-xs text-slate-500">{localized(fs, "productName", fr)} · {fs.sellerName ?? "—"}</p>
                        </div>
                      );
                    },
                  },
                  { key: "startsAt", label: fr ? "Période" : "Window", render: (row) => { const fs = row as unknown as FlashSaleServerRow; return <span className="text-xs text-slate-500">{fmt(fs.startsAt)} → {fmt(fs.endsAt)}</span>; } },
                  { key: "flashPrice", label: fr ? "Prix flash" : "Flash price", render: (row) => { const fs = row as unknown as FlashSaleServerRow; return <span>{formatCurrency(fs.flashPrice, locale)}{fs.basePrice ? <span className="text-xs text-slate-400"> / {formatCurrency(fs.basePrice, locale)}</span> : null} · {fs.discount}%</span>; } },
                  {
                    key: "actions",
                    label: "",
                    render: (row) => {
                      const fs = row as unknown as FlashSaleServerRow;
                      return (
                        <div className="flex gap-2">
                          <Button size="sm" variant="approve" onClick={() => void run(() => socketClient.request("flashsales:approve", { id: fs.id }), fr ? "Proposition approuvée" : "Nomination approved", () => {})}>{fr ? "Approuver" : "Approve"}</Button>
                          <Button size="sm" variant="reject" onClick={() => { setModalError(null); setDeclineReason(""); setDeclineTarget(fs); }}>{fr ? "Refuser" : "Decline"}</Button>
                        </div>
                      );
                    },
                  },
                ]}
              />
            </CardContent>
          </Card>
          {declined.length > 0 && (
            <Card>
              <CardContent className="space-y-2 p-4 text-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{fr ? "Propositions refusées" : "Declined nominations"}</p>
                {declined.map((fs) => (
                  <div key={fs.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2">
                    <span>{localized(fs, "productName", fr)} · {fs.sellerName ?? "—"}{fs.rejectReason ? ` : ${fs.rejectReason}` : ""}</span>
                    <Button size="sm" variant="ghost" className="text-red-600" onClick={() => { setModalError(null); setDelTarget(fs); }}>{fr ? "Supprimer" : "Delete"}</Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      <Modal
        open={!!endTarget}
        onClose={() => !busy && setEndTarget(null)}
        title={fr ? "Terminer la vente flash" : "End flash sale"}
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setEndTarget(null)} disabled={busy}>{fr ? "Annuler" : "Cancel"}</Button>
            <Button variant="danger" size="sm" onClick={() => endTarget && void run(() => socketClient.request("flashsales:end", { id: endTarget.id }), fr ? "Vente flash terminée" : "Flash sale ended", () => setEndTarget(null))} disabled={busy}>{busy ? "…" : fr ? "Terminer maintenant" : "End now"}</Button>
          </>
        }
      >
        {endTarget && (
          <>
            <p>
              {fr
                ? `Terminer « ${localized(endTarget, "title", true)} » maintenant ? Le prix normal de ${localized(endTarget, "productName", true)} est rétabli immédiatement.`
                : `End "${localized(endTarget, "title", false)}" now? The normal price of ${localized(endTarget, "productName", false)} is restored immediately.`}
            </p>
            <ErrorNote message={modalError} />
          </>
        )}
      </Modal>

      <Modal
        open={!!delTarget}
        onClose={() => !busy && setDelTarget(null)}
        title={fr ? "Supprimer la vente flash" : "Delete flash sale"}
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setDelTarget(null)} disabled={busy}>{fr ? "Annuler" : "Cancel"}</Button>
            <Button variant="danger" size="sm" onClick={() => delTarget && void run(() => socketClient.request("flashsales:delete", { id: delTarget.id }), fr ? "Vente flash supprimée" : "Flash sale deleted", () => setDelTarget(null))} disabled={busy}>{busy ? "…" : fr ? "Supprimer" : "Delete"}</Button>
          </>
        }
      >
        {delTarget && (
          <>
            <p>{fr ? `Supprimer « ${localized(delTarget, "title", true)} » ? S'il est en cours, le prix normal est rétabli.` : `Delete "${localized(delTarget, "title", false)}"? If it is running, the normal price is restored.`}</p>
            <ErrorNote message={modalError} />
          </>
        )}
      </Modal>

      <Modal
        open={!!editTarget}
        onClose={() => !busy && setEditTarget(null)}
        title={fr ? "Modifier la vente flash" : "Edit flash sale"}
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setEditTarget(null)} disabled={busy}>{fr ? "Annuler" : "Cancel"}</Button>
            <Button size="sm" onClick={saveEdit} disabled={busy}>{busy ? "…" : fr ? "Enregistrer" : "Save"}</Button>
          </>
        }
      >
        {editTarget && (
          <>
            <p className="text-slate-600">{localized(editTarget, "productName", fr)}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-xs font-medium text-slate-500">{fr ? "Titre (EN)" : "Title (EN)"}<input className="input-premium mt-1 w-full px-3 py-2 text-sm" value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} /></label>
              <label className="block text-xs font-medium text-slate-500">{fr ? "Titre (FR)" : "Title (FR)"}<input className="input-premium mt-1 w-full px-3 py-2 text-sm" value={edit.titleFr} onChange={(e) => setEdit({ ...edit, titleFr: e.target.value })} /></label>
              <label className="block text-xs font-medium text-slate-500">{fr ? "Prix flash (USD)" : "Flash price (USD)"}<input className="input-premium mt-1 w-full px-3 py-2 text-sm" inputMode="decimal" value={edit.flashPrice} onChange={(e) => setEdit({ ...edit, flashPrice: e.target.value })} /></label>
              <span />
              <label className="block text-xs font-medium text-slate-500">{fr ? "Début" : "Starts"}<input type="datetime-local" className="input-premium mt-1 w-full px-3 py-2 text-sm" value={edit.startsAt} onChange={(e) => setEdit({ ...edit, startsAt: e.target.value })} /></label>
              <label className="block text-xs font-medium text-slate-500">{fr ? "Fin" : "Ends"}<input type="datetime-local" className="input-premium mt-1 w-full px-3 py-2 text-sm" value={edit.endsAt} onChange={(e) => setEdit({ ...edit, endsAt: e.target.value })} /></label>
            </div>
            <ErrorNote message={modalError} />
          </>
        )}
      </Modal>

      <Modal
        open={!!declineTarget}
        onClose={() => !busy && setDeclineTarget(null)}
        title={fr ? "Refuser la proposition" : "Decline the nomination"}
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setDeclineTarget(null)} disabled={busy}>{fr ? "Annuler" : "Cancel"}</Button>
            <Button variant="danger" size="sm" onClick={decline} disabled={busy}>{busy ? "…" : fr ? "Refuser" : "Decline"}</Button>
          </>
        }
      >
        {declineTarget && <p>{localized(declineTarget, "productName", fr)} · {declineTarget.sellerName ?? "—"}</p>}
        <label className="block text-xs font-medium text-slate-500">
          {fr ? "Motif (obligatoire, vu par le vendeur)" : "Reason (required, shown to the seller)"}
          <textarea className="input-premium mt-1 w-full px-4 py-2 text-sm" rows={3} value={declineReason} onChange={(e) => setDeclineReason(e.target.value)} />
        </label>
        <ErrorNote message={modalError} />
      </Modal>
    </div>
  );
}
