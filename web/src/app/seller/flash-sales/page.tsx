"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Lock, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { PageHeader } from "@/components/ui/page-header";
import { Modal, ErrorNote } from "@/components/admin/modal";
import { Countdown } from "@/components/seller/countdown";
import { LoadError, SectionLoader } from "@/components/seller/data-state";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";
import { useSellerAccess, useSellerData } from "@/lib/seller";
import { autoTranslateHint } from "@/lib/i18n-fields";
import { localDateTime } from "@/lib/dates";
import { errMessage } from "@/lib/seller-labels";
import { useNow } from "@/lib/seller-api";
import { flashActions, flashProduct, flashTitle, useFlashSales, usePlanPerks, type SellerFlashSale } from "@/lib/seller-promo";
import { formatCurrency } from "@/lib/utils";

const STATUS: Record<string, { en: string; fr: string; variant: "warning" | "success" | "danger" }> = {
  nominated: { en: "Waiting for marketing", fr: "En attente du marketing", variant: "warning" },
  approved: { en: "Approved", fr: "Approuvée", variant: "success" },
  declined: { en: "Declined", fr: "Refusée", variant: "danger" },
};
const PHASE: Record<string, { en: string; fr: string; variant: "info" | "success" | "default" }> = {
  scheduled: { en: "Scheduled", fr: "Planifiée", variant: "info" },
  running: { en: "Running now", fr: "En cours", variant: "success" },
  ended: { en: "Ended", fr: "Terminée", variant: "default" },
};

interface Form {
  productId: string;
  flashPrice: string;
  startsAt: string;
  endsAt: string;
  title: string;
  titleFr: string;
}
const EMPTY: Form = { productId: "", flashPrice: "", startsAt: "", endsAt: "", title: "", titleFr: "" };

export default function SellerFlashSalesPage() {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const { toast } = useToast();
  const access = useSellerAccess();
  const canEdit = access.can("catalog") && !access.suspended;
  const { sellerProductList } = useSellerData();
  const sales = useFlashSales();
  const { perks } = usePlanPerks();
  const gated = perks.flashNomination === false;
  const now = useNow(15_000);

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Form>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const liveProducts = useMemo(() => sellerProductList.filter((p) => p.status === "live"), [sellerProductList]);
  const product = liveProducts.find((p) => p.id === form.productId);
  const price = Number(form.flashPrice);
  const start = form.startsAt ? new Date(form.startsAt).getTime() : null;
  const end = form.endsAt ? new Date(form.endsAt).getTime() : null;

  const problems: string[] = [];
  if (!product) problems.push(fr ? "Choisissez un de vos produits en ligne." : "Pick one of your live products.");
  if (product && !(Number.isFinite(price) && price > 0 && price < product.price)) problems.push(fr ? `Le prix flash doit être inférieur au prix normal (${formatCurrency(product.price, "fr")}).` : `The flash price must be below the normal price (${formatCurrency(product.price, "en")}).`);
  if (!end || end <= now) problems.push(fr ? "Indiquez une date de fin dans le futur." : "Give an end date in the future.");
  if (start !== null && end !== null && end <= start) problems.push(fr ? "La fin doit suivre le début." : "The end must be after the start.");

  function show() {
    setForm(EMPTY);
    setError(null);
    setOpen(true);
  }

  async function submit() {
    if (problems.length || busy || !product) return;
    setBusy(true);
    setError(null);
    try {
      const s = await flashActions.nominate({
        productId: product.id,
        flashPrice: price,
        endsAt: new Date(form.endsAt).toISOString(),
        ...(form.startsAt ? { startsAt: new Date(form.startsAt).toISOString() } : {}),
        ...(form.title.trim() ? { title: form.title.trim() } : {}),
        ...(form.titleFr.trim() ? { titleFr: form.titleFr.trim() } : {}),
      });
      sales.setData((cur) => [s, ...(cur ?? []).filter((x) => x.id !== s.id)]);
      toast(fr ? "Vente flash proposée : le marketing va l'examiner" : "Flash sale proposed: marketing will review it");
      setOpen(false);
    } catch (e) {
      const msg = errMessage(e);
      setError(msg);
      toast(msg, "error");
    } finally {
      setBusy(false);
    }
  }

  const rows = useMemo(
    () => [...(sales.data ?? [])].sort((a, b) => (b.createdAt ?? b.endsAt).localeCompare(a.createdAt ?? a.endsAt)),
    [sales.data],
  );
  const field = "input-premium mt-1 w-full px-3 py-2 text-sm";

  return (
    <div className="space-y-6">
      <PageHeader
        title={fr ? "Ventes flash" : "Flash sales"}
        subtitle={fr ? "Proposez un prix flash sur un produit : le marketing l'approuve, puis le prix change tout seul aux dates choisies" : "Propose a flash price on a product: marketing approves it, then the price changes by itself on the dates you chose"}
        breadcrumbs={[{ label: fr ? "Vendeur" : "Seller", href: "/seller" }, { label: fr ? "Ventes flash" : "Flash sales" }]}
        actions={
          canEdit ? (
            <Button disabled={gated} onClick={show}>
              <Zap className="h-4 w-4" aria-hidden="true" />
              {fr ? "Proposer une vente flash" : "Propose a flash sale"}
            </Button>
          ) : undefined
        }
      />

      {gated && (
        <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <span className="flex items-center gap-2">
            <Lock className="h-4 w-4 shrink-0" />
            {fr ? "Votre formule actuelle ne permet pas de proposer des ventes flash." : "Your current plan does not let you propose flash sales."}
          </span>
          <Link href="/seller/subscribe" className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white">
            {fr ? "Changer de formule" : "Upgrade your plan"}
          </Link>
        </div>
      )}

      <p className="text-xs text-slate-500">
        {fr
          ? "Une proposition ne change aucun prix tant que le marketing ne l'a pas approuvée. Une vente flash et une campagne ne se cumulent pas : le prix le plus bas gagne."
          : "A proposal changes no price until marketing approves it. A flash sale and a campaign never stack: the lowest price wins."}
      </p>

      {sales.error && <LoadError message={sales.error} onRetry={sales.reload} />}
      <Card>
        <CardContent className="p-0">
          {sales.loading ? (
            <SectionLoader />
          ) : (
            <DataTable
              emptyMessage={fr ? "Aucune vente flash. Proposez-en une sur un produit en ligne." : "No flash sales yet. Propose one on a live product."}
              columns={[
                {
                  key: "title",
                  label: fr ? "Vente" : "Sale",
                  render: (r) => {
                    const s = r as unknown as SellerFlashSale;
                    return (
                      <div>
                        <p className="font-medium text-slate-900">{flashTitle(s, fr) || flashProduct(s, fr)}</p>
                        <Link href={`/seller/products/${s.productId}`} className="text-xs text-[var(--primary)] hover:underline">{flashProduct(s, fr)}</Link>
                      </div>
                    );
                  },
                },
                {
                  key: "flashPrice",
                  label: fr ? "Prix" : "Price",
                  render: (r) => (
                    <span>
                      <strong className="text-emerald-700">{formatCurrency(Number(r.flashPrice), locale)}</strong>{" "}
                      {Number(r.basePrice) > 0 && (
                        <>
                          <span className="text-xs text-slate-400 line-through">{formatCurrency(Number(r.basePrice), locale)}</span>{" "}
                          <span className="text-xs text-slate-500">(-{Math.round((1 - Number(r.flashPrice) / Number(r.basePrice)) * 100)}%)</span>
                        </>
                      )}
                    </span>
                  ),
                },
                { key: "window", label: fr ? "Période" : "Window", render: (r) => `${r.startsAt ? localDateTime(String(r.startsAt)) : fr ? "dès l'approbation" : "on approval"} → ${localDateTime(String(r.endsAt))}` },
                {
                  key: "status",
                  label: fr ? "Décision" : "Decision",
                  render: (r) => {
                    const st = STATUS[String(r.status)] ?? { en: String(r.status), fr: String(r.status), variant: "default" as const };
                    return (
                      <div className="space-y-1">
                        <Badge variant={st.variant}>{fr ? st.fr : st.en}</Badge>
                        {r.status === "declined" && <p className="max-w-[16rem] text-xs text-red-700">{String(r.rejectReason ?? "")}</p>}
                      </div>
                    );
                  },
                },
                {
                  key: "phase",
                  label: fr ? "État" : "State",
                  render: (r) => {
                    if (r.status !== "approved") return "—";
                    const s = r as unknown as SellerFlashSale;
                    const ph = PHASE[s.phase] ?? PHASE.ended;
                    return (
                      <div className="space-y-1">
                        <Badge variant={ph.variant}>{fr ? ph.fr : ph.en}</Badge>
                        {s.phase === "running" && <div><Countdown until={s.endsAt} /></div>}
                        {s.phase === "scheduled" && s.startsAt && <div><Countdown until={s.startsAt} /></div>}
                      </div>
                    );
                  },
                },
              ]}
              data={rows as unknown as Record<string, unknown>[]}
            />
          )}
        </CardContent>
      </Card>

      <Modal
        open={open}
        onClose={() => !busy && setOpen(false)}
        title={fr ? "Proposer une vente flash" : "Propose a flash sale"}
        footer={
          <>
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => setOpen(false)}>{fr ? "Annuler" : "Cancel"}</Button>
            <Button size="sm" disabled={busy || problems.length > 0} onClick={() => void submit()}>{busy ? "…" : fr ? "Envoyer au marketing" : "Send to marketing"}</Button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-slate-500 sm:col-span-2">{fr ? "Produit (en ligne)" : "Product (live)"}
            <select className={field} value={form.productId} onChange={(e) => setForm({ ...form, productId: e.target.value })}>
              <option value="">{fr ? "Choisir…" : "Choose…"}</option>
              {liveProducts.map((p) => (
                <option key={p.id} value={p.id}>{p.name} — {formatCurrency(p.price, locale)}</option>
              ))}
            </select>
          </label>
          <label className="text-xs text-slate-500">{fr ? "Prix flash ($)" : "Flash price ($)"}
            <input className={field} type="number" min="0" step="0.01" value={form.flashPrice} onChange={(e) => setForm({ ...form, flashPrice: e.target.value })} />
            {product && <span className="mt-1 block">{fr ? "Prix normal" : "Normal price"} : {formatCurrency(product.price, locale)}</span>}
          </label>
          <span />
          <label className="text-xs text-slate-500">{fr ? "Début (facultatif)" : "Start (optional)"}
            <input className={field} type="datetime-local" value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} />
          </label>
          <label className="text-xs text-slate-500">{fr ? "Fin" : "End"}
            <input className={field} type="datetime-local" value={form.endsAt} onChange={(e) => setForm({ ...form, endsAt: e.target.value })} />
          </label>
          <label className="text-xs text-slate-500">{fr ? "Titre (EN, facultatif)" : "Title (EN, optional)"}
            <input className={field} value={form.title} maxLength={120} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </label>
          <label className="text-xs text-slate-500">{fr ? "Titre (FR, facultatif)" : "Title (FR, optional)"}
            <input className={field} value={form.titleFr} maxLength={120} onChange={(e) => setForm({ ...form, titleFr: e.target.value })} />
          </label>
          <p className="text-xs text-slate-500 sm:col-span-2">{autoTranslateHint(fr)}</p>
        </div>
        {(form.productId !== "" || form.flashPrice !== "") && problems.length > 0 && (
          <ul className="space-y-0.5 text-xs text-red-600">{problems.map((p) => <li key={p}>{p}</li>)}</ul>
        )}
        <ErrorNote message={error} />
      </Modal>
    </div>
  );
}
