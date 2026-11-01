"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { DetailSection } from "@/components/ui/info-grid";
import { CampaignEffectTable } from "@/components/seller/campaign-effect";
import { EmptyState, LoadError } from "@/components/seller/data-state";
import { ProductImage } from "@/components/seller/product-image";
import { useToast } from "@/context/toast-context";
import { useLocale } from "@/context/locale-context";
import { useSellerData } from "@/lib/seller";
import { errMessage } from "@/lib/seller-labels";
import { campaignActions } from "@/lib/seller-promo";
import { autoTranslateHint } from "@/lib/i18n-fields";

const MAX_PRODUCTS = 200;

/** The saved values an edit starts from. */
export interface CampaignFormInitial {
  id: string;
  /** draft | pending | rejected: a draft stays a draft until it is submitted. */
  status?: string;
  name: string;
  /** French name, when there is one. */
  nameFr?: string;
  discount: number;
  startDate: string | null;
  endDate: string | null;
  budget: number;
  productIds: string[];
}

/**
 * Create a campaign, or edit one that marketing has not approved yet (draft, pending or rejected). Either way it
 * goes to marketing for approval.
 */
export function CampaignForm({ initial }: { initial?: CampaignFormInitial }) {
  const router = useRouter();
  const { toast } = useToast();
  const { locale } = useLocale();
  const { sellerProductList, commissionPct, load } = useSellerData();
  const fr = locale === "fr";
  const editing = !!initial;
  const [form, setForm] = useState({
    name: initial?.name ?? "",
    nameFr: initial?.nameFr ?? "",
    discount: initial ? String(initial.discount) : "",
    start: initial?.startDate?.slice(0, 10) ?? "",
    end: initial?.endDate?.slice(0, 10) ?? "",
    budget: initial && initial.budget > 0 ? String(initial.budget) : "",
  });
  const [scope, setScope] = useState<"all" | "selected">(initial && initial.productIds.length > 0 ? "selected" : "all");
  const [picked, setPicked] = useState<string[]>(initial?.productIds ?? []);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<"draft" | "submit" | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Only listings that can ever be sold: not rejected by moderation.
  const candidates = useMemo(() => sellerProductList.filter((p) => p.status !== "rejected"), [sellerProductList]);
  const shown = candidates.filter((p) => !q.trim() || p.name.toLowerCase().includes(q.trim().toLowerCase()));
  const covered = scope === "all" ? candidates : candidates.filter((p) => picked.includes(p.id));

  const discount = form.discount === "" ? 0 : Number(form.discount);
  const problems: string[] = [];
  if (form.name.trim().length < 2 && form.nameFr.trim().length < 2) problems.push(fr ? "Saisissez un nom de campagne (en anglais ou en français)." : "Enter a campaign name (in English or French).");
  if (!Number.isFinite(discount) || discount <= 0 || discount > 90) problems.push(fr ? "La remise doit être comprise entre 1 et 90 %." : "Discount must be between 1 and 90%.");
  if (form.start && form.end && form.end < form.start) problems.push(fr ? "La date de fin précède la date de début." : "The end date is before the start date.");
  if (scope === "selected" && picked.length === 0) problems.push(fr ? "Choisissez au moins un produit." : "Pick at least one product.");
  if (scope === "selected" && picked.length > MAX_PRODUCTS) problems.push(fr ? `${MAX_PRODUCTS} produits au maximum.` : `At most ${MAX_PRODUCTS} products.`);

  const toggle = (id: string) => setPicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  /** `draft`: keep it with me (nothing reaches marketing); `submit`: send it for approval. */
  async function save(mode: "draft" | "submit") {
    if (problems.length || busy) return;
    setBusy(mode);
    setError(null);
    try {
      const fields = {
        discount,
        startDate: form.start || undefined,
        endDate: form.end || undefined,
        budgetUsd: form.budget ? Number(form.budget) : undefined,
      };
      const nameEn = form.name.trim();
      const nameFr = form.nameFr.trim();
      if (initial) {
        // Only a name that changed is sent: an automatic translation is not turned into typed text ("" clears it).
        const names = {
          ...(nameEn !== initial.name.trim() ? { name: nameEn } : {}),
          ...(nameFr !== (initial.nameFr ?? "").trim() ? { nameFr } : {}),
        };
        // An empty list means "the whole store" on the server.
        await campaignActions.update(initial.id, { ...fields, ...names, budgetUsd: form.budget ? Number(form.budget) : 0, productIds: scope === "selected" ? picked : [] });
        // An edited draft stays a draft; sending it is a separate step.
        if (initial.status === "draft" && mode === "submit") await campaignActions.submit(initial.id);
        toast(
          mode === "draft"
            ? fr ? "Brouillon enregistré" : "Draft saved"
            : fr ? "Modifications envoyées pour approbation" : "Changes sent for approval",
        );
        router.push(`/seller/promotions/${initial.id}`);
      } else {
        // A language left empty is not sent: the platform translates it from the other one.
        await campaignActions.create({
          ...fields,
          ...(nameEn ? { name: nameEn } : {}),
          ...(nameFr ? { nameFr } : {}),
          productIds: scope === "selected" ? picked : undefined,
          ...(mode === "draft" ? { draft: true } : {}),
        });
        toast(
          mode === "draft"
            ? fr ? "Brouillon enregistré : soumettez-le quand vous êtes prêt" : "Draft saved: submit it when you are ready"
            : fr ? "Campagne soumise pour approbation" : "Campaign submitted for approval",
        );
        router.push("/seller/promotions");
      }
    } catch (e) {
      const msg = errMessage(e);
      setError(msg);
      toast(msg, "error");
      setBusy(null);
    }
  }

  const field = "rounded-lg border border-sky-200 px-4 py-2 text-sm";
  return (
    <div className="space-y-6">
      <PageHeader
        title={editing ? (fr ? "Modifier la campagne" : "Edit Campaign") : fr ? "Créer une campagne" : "Create Campaign"}
        subtitle={
          editing
            ? fr ? "Après modification, la campagne repasse en attente d'approbation" : "After an edit the campaign waits for approval again"
            : fr ? "Nom, remise, produits, période : le marketing approuve ensuite" : "Name, discount, products, schedule: marketing approves it afterwards"
        }
        backHref={initial ? `/seller/promotions/${initial.id}` : "/seller/promotions"}
      />
      {load.error && <LoadError message={load.error} onRetry={load.retry} />}

      <DetailSection title={fr ? "Détails de la campagne" : "Campaign Details"}>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-xs text-slate-500">{fr ? "Nom de la campagne (EN)" : "Campaign name (EN)"}
            <input className={`${field} mt-1 w-full`} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={150} />
          </label>
          <label className="text-xs text-slate-500">{fr ? "Nom de la campagne (FR)" : "Campaign name (FR)"}
            <input className={`${field} mt-1 w-full`} value={form.nameFr} onChange={(e) => setForm({ ...form, nameFr: e.target.value })} maxLength={150} />
            <span className="mt-1 block">{autoTranslateHint(fr)}</span>
          </label>
          <label className="text-xs text-slate-500">{fr ? "Remise % (1-90)" : "Discount % (1-90)"}
            <input className={`${field} mt-1 w-full`} type="number" min="1" max="90" value={form.discount} onChange={(e) => setForm({ ...form, discount: e.target.value })} />
          </label>
          <label className="text-xs text-slate-500">{fr ? "Début" : "Start"}<input className={`${field} mt-1 w-full`} type="date" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} /></label>
          <label className="text-xs text-slate-500">{fr ? "Fin (incluse)" : "End (inclusive)"}<input className={`${field} mt-1 w-full`} type="date" value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} /></label>
          <label className="text-xs text-slate-500">{fr ? "Budget USD (optionnel)" : "Budget USD (optional)"}
            <input className={`${field} mt-1 w-full`} type="number" min="0" value={form.budget} onChange={(e) => setForm({ ...form, budget: e.target.value })} />
          </label>
        </div>
      </DetailSection>

      <DetailSection title={fr ? "Produits concernés" : "Products covered"}>
        <div className="space-y-3 text-sm">
          <label className="flex items-start gap-2">
            <input type="radio" name="scope" className="mt-1" checked={scope === "all"} onChange={() => setScope("all")} />
            <span>
              <span className="font-medium text-slate-900">{fr ? "Tous les produits de ma boutique" : "All products in my store"}</span>
              <span className="block text-xs text-slate-500">{fr ? "Inclut aussi les produits ajoutés plus tard." : "Includes products added later too."}</span>
            </span>
          </label>
          <label className="flex items-start gap-2">
            <input type="radio" name="scope" className="mt-1" checked={scope === "selected"} onChange={() => setScope("selected")} />
            <span className="font-medium text-slate-900">{fr ? "Seulement les produits que je choisis" : "Only the products I pick"}</span>
          </label>
        </div>

        {scope === "selected" && (
          <div className="mt-4 space-y-3">
            {candidates.length === 0 ? (
              <EmptyState>{fr ? "Vous n'avez pas encore de produit à inclure." : "You have no products to include yet."}</EmptyState>
            ) : (
              <>
                <input type="search" className="input-premium w-full px-3 py-2 text-sm" placeholder={fr ? "Rechercher un produit…" : "Search a product…"} value={q} onChange={(e) => setQ(e.target.value)} />
                <ul className="max-h-72 divide-y divide-[var(--border)] overflow-y-auto rounded-xl border border-[var(--border)]">
                  {shown.map((p) => (
                    <li key={p.id}>
                      <label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-slate-50">
                        <input type="checkbox" checked={picked.includes(p.id)} onChange={() => toggle(p.id)} />
                        <span className="h-9 w-9 shrink-0 overflow-hidden rounded"><ProductImage src={p.image} /></span>
                        <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-900">{p.name}</span>
                        <span className="shrink-0 text-xs text-slate-500">${p.price}</span>
                      </label>
                    </li>
                  ))}
                  {shown.length === 0 && <li className="p-4 text-center text-sm text-slate-500">{fr ? "Aucun résultat." : "No match."}</li>}
                </ul>
                <p className="text-xs text-slate-500">{fr ? `${picked.length} sélectionné(s)` : `${picked.length} selected`}</p>
              </>
            )}
          </div>
        )}
      </DetailSection>

      {discount > 0 && discount <= 90 && covered.length > 0 && (
        <DetailSection title={fr ? "Effet sur les prix" : "Effect on prices"}>
          <p className="mb-3 text-xs text-slate-500">
            {fr
              ? "Une fois la campagne approuvée et en cours, les clients paient ces prix. Un code promo s'applique en plus, sur le prix déjà remisé. Une vente flash et une campagne ne se cumulent pas : le prix le plus bas gagne."
              : "Once the campaign is approved and running, shoppers pay these prices. A promo code applies on top of the already-discounted price. A flash sale and a campaign never stack: the lowest price wins."}
          </p>
          <CampaignEffectTable products={covered} discount={discount} commissionPct={commissionPct} />
        </DetailSection>
      )}

      {(form.name !== "" || form.discount !== "") && problems.length > 0 && (
        <ul className="space-y-1 text-xs text-red-600">{problems.map((p) => <li key={p}>{p}</li>)}</ul>
      )}
      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <div className="flex flex-wrap gap-3">
        {(!editing || initial?.status === "draft") && (
          <button onClick={() => void save("draft")} disabled={!!busy || problems.length > 0} className="rounded-lg border border-[var(--border-strong)] bg-white px-6 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50">
            {busy === "draft" ? (fr ? "Enregistrement…" : "Saving…") : fr ? "Enregistrer en brouillon" : "Save as draft"}
          </button>
        )}
        <button onClick={() => void save("submit")} disabled={!!busy || problems.length > 0} className="btn-primary rounded-lg px-6 py-2 text-sm disabled:opacity-50">
          {busy === "submit" ? (fr ? "Envoi…" : "Sending…") : editing ? (fr ? "Enregistrer et soumettre" : "Save and Submit") : fr ? "Soumettre pour approbation" : "Submit for Approval"}
        </button>
      </div>
    </div>
  );
}
