"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DetailSection } from "@/components/ui/info-grid";
import { Button } from "@/components/ui/button";
import { ProductImage } from "@/components/seller/product-image";
import { useToast } from "@/context/toast-context";
import { useLocale } from "@/context/locale-context";
import { useRealtime } from "@/context/realtime-context";
import { useSellerData } from "@/lib/seller";
import { errMessage } from "@/lib/seller-labels";
import type { Product } from "@/lib/realtime/types";

const STEPS = [
  { en: "Basic Info", fr: "Infos de base" },
  { en: "Photo", fr: "Photo" },
  { en: "Pricing & stock", fr: "Prix et stock" },
  { en: "Review", fr: "Vérification" },
];

const FALLBACK_CATEGORIES = [
  { name: "Electronics", nameFr: "Électronique" },
  { name: "Fashion", nameFr: "Mode" },
  { name: "Home", nameFr: "Maison" },
  { name: "Beauty", nameFr: "Beauté" },
];

type FormState = {
  title: string;
  titleFr: string;
  category: string;
  description: string;
  price: string;
  originalPrice: string;
  stock: string;
  image: string;
};

function initialForm(p?: Product | null): FormState {
  return {
    title: p?.name ?? "",
    titleFr: p?.nameFr ?? "",
    category: p?.category ?? "",
    description: p?.description ?? "",
    price: p ? String(p.price) : "",
    originalPrice: p?.originalPrice ? String(p.originalPrice) : "",
    stock: p ? String(p.stock) : "",
    image: p?.image ?? "",
  };
}

/**
 * Product form shared by "create" and "edit". It only collects what the server
 * stores: name (EN/FR), category, description, price, compare-at price, stock
 * and one photo. Everything is validated before the Next / Submit buttons enable.
 */
export function ProductWizard({ product }: { product?: Product | null }) {
  const router = useRouter();
  const { toast } = useToast();
  const { locale } = useLocale();
  const { categories } = useRealtime();
  const { createProduct, updateProduct, uploadImage } = useSellerData();
  const fr = locale === "fr";
  const editing = !!product;

  const categoryOptions = useMemo(() => {
    const base = categories.length
      ? categories.map((c) => ({ name: c.name, nameFr: c.nameFr ?? c.name }))
      : FALLBACK_CATEGORIES;
    if (product?.category && !base.some((c) => c.name === product.category)) {
      base.push({ name: product.category, nameFr: product.categoryFr ?? product.category });
    }
    return base;
  }, [categories, product]);

  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormState>(() => {
    const f = initialForm(product);
    if (!f.category) f.category = "";
    return f;
  });
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [created, setCreated] = useState<Product | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const category = form.category || categoryOptions[0]?.name || "";
  const set = (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch }));

  const priceNum = Number(form.price);
  const origNum = Number(form.originalPrice);
  const stockNum = Number(form.stock);

  const errors = {
    title: form.title.trim().length < 2 ? (fr ? "Le titre doit contenir au moins 2 caractères." : "Title must be at least 2 characters.") : form.title.trim().length > 200 ? (fr ? "200 caractères maximum." : "200 characters maximum.") : "",
    category: category ? "" : fr ? "Choisissez une catégorie." : "Pick a category.",
    price: !(priceNum > 0) || priceNum > 1_000_000 ? (fr ? "Le prix doit être supérieur à 0." : "Price must be greater than 0.") : "",
    originalPrice:
      form.originalPrice.trim() !== "" && !(origNum > priceNum)
        ? (fr ? "Le prix barré doit être supérieur au prix." : "Compare-at price must be higher than the price.")
        : "",
    stock:
      form.stock.trim() === "" || !Number.isInteger(stockNum) || stockNum < 0
        ? (fr ? "Le stock doit être un entier supérieur ou égal à 0." : "Stock must be a whole number, 0 or more.")
        : "",
  };
  const stepValid = [
    !errors.title && !errors.category,
    !uploading,
    !errors.price && !errors.originalPrice && !errors.stock,
    true,
  ];
  const allValid = !errors.title && !errors.category && !errors.price && !errors.originalPrice && !errors.stock && !uploading;

  const show = (k: keyof typeof errors) => errors[k];
  const fieldErr = (k: keyof typeof errors) =>
    show(k) ? <p className="mt-1 text-xs text-red-600">{show(k)}</p> : null;

  async function onFile(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    try {
      const url = await uploadImage(file);
      set({ image: url });
    } catch (e) {
      const msg = errMessage(e);
      setUploadError(msg);
      toast(msg, "error");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function submit() {
    if (!allValid || submitting) return;
    const chosen = categoryOptions.find((c) => c.name === category);
    const payload = {
      name: form.title.trim(),
      nameFr: form.titleFr.trim() || undefined,
      price: priceNum,
      originalPrice: form.originalPrice.trim() ? origNum : undefined,
      category,
      categoryFr: chosen?.nameFr,
      stock: stockNum,
      image: form.image || undefined,
      description: form.description.trim() || undefined,
    };
    setSubmitting(true);
    setSubmitError(null);
    try {
      if (editing && product) {
        await updateProduct(product.id, {
          ...payload,
          // explicit values so a cleared field is cleared on the server too
          nameFr: form.titleFr.trim(),
          originalPrice: form.originalPrice.trim() ? origNum : null,
          description: form.description.trim(),
          image: form.image,
        });
        toast(fr ? "Modifications enregistrées" : "Changes saved");
        router.push(`/seller/products/${product.id}`);
      } else {
        const res = await createProduct(payload);
        setCreated(res);
      }
    } catch (e) {
      const msg = errMessage(e);
      setSubmitError(msg);
      toast(msg, "error");
    } finally {
      setSubmitting(false);
    }
  }

  if (created) {
    const live = created.status === "live";
    return (
      <div className="card-premium mx-auto max-w-lg space-y-3 p-8 text-center">
        <h2 className={`text-xl font-bold ${live ? "text-emerald-700" : "text-amber-700"}`}>
          {live
            ? fr ? "Publié" : "Published"
            : fr ? "Soumis pour validation" : "Submitted for review"}
        </h2>
        <p className="text-sm text-slate-600">
          {live
            ? fr ? "Votre produit est en ligne dans la boutique." : "Your product is live in the shop."
            : fr
              ? "Soumis pour validation : un modérateur va l'approuver. Il n'est pas encore visible par les clients."
              : "Submitted for review — a moderator will approve it. Shoppers cannot see it yet."}
        </p>
        <div className="flex flex-wrap justify-center gap-3 pt-2 text-sm">
          <Link href={`/seller/products/${created.id}`} className="btn-primary rounded-lg px-4 py-2 font-medium">
            {fr ? "Voir le produit" : "View product"}
          </Link>
          <Link href="/seller/products" className="rounded-lg border border-slate-200 px-4 py-2 font-medium text-slate-700">
            {fr ? "Tous les produits" : "All products"}
          </Link>
        </div>
      </div>
    );
  }

  const input = "input-premium w-full px-4 py-2.5 text-sm";
  const label = "mb-1 block text-xs font-medium text-slate-600";

  return (
    <div className="space-y-6">
      <div className="flex gap-1 overflow-x-auto">
        {STEPS.map((s, i) => {
          const reachable = i <= step || stepValid.slice(0, i).every(Boolean);
          return (
            <button
              key={s.en}
              type="button"
              disabled={!reachable}
              onClick={() => setStep(i)}
              className={`whitespace-nowrap rounded-xl px-4 py-2 text-sm font-medium transition-all disabled:cursor-not-allowed disabled:opacity-50 ${
                i === step ? "bg-[var(--primary)] text-white" : i < step ? "bg-red-100 text-[var(--primary)]" : "bg-slate-100 text-slate-500"
              }`}
            >
              {i + 1}. {fr ? s.fr : s.en}
            </button>
          );
        })}
      </div>

      {step === 0 && (
        <DetailSection title={fr ? "Étape 1 : Informations de base" : "Step 1: Basic Information"}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={label}>{fr ? "Titre du produit (EN) *" : "Product title (EN) *"}</label>
              <input className={input} value={form.title} onChange={(e) => { set({ title: e.target.value }); }} maxLength={200} />
              {fieldErr("title")}
            </div>
            <div>
              <label className={label}>{fr ? "Titre du produit (FR)" : "Product title (FR)"}</label>
              <input className={input} value={form.titleFr} onChange={(e) => set({ titleFr: e.target.value })} maxLength={200} />
            </div>
            <div>
              <label className={label}>{fr ? "Catégorie *" : "Category *"}</label>
              <select className={input} value={category} onChange={(e) => { set({ category: e.target.value }); }}>
                {categoryOptions.map((c) => (
                  <option key={c.name} value={c.name}>{fr ? c.nameFr : c.name}</option>
                ))}
              </select>
              {fieldErr("category")}
            </div>
            <div className="sm:col-span-2">
              <label className={label}>{fr ? "Description" : "Description"}</label>
              <textarea className={input} rows={4} maxLength={5000} value={form.description} onChange={(e) => set({ description: e.target.value })} />
            </div>
          </div>
        </DetailSection>
      )}

      {step === 1 && (
        <DetailSection title={fr ? "Étape 2 : Photo du produit" : "Step 2: Product photo"}>
          <div className="flex flex-wrap items-start gap-4">
            <div className="flex h-40 w-40 items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-[var(--border)] text-sm text-slate-400">
              {form.image ? <ProductImage src={form.image} alt="" /> : uploading ? (fr ? "Envoi…" : "Uploading…") : (fr ? "Aucune photo" : "No photo")}
            </div>
            <div className="space-y-2 text-sm">
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={uploading}
                onChange={(e) => void onFile(e.target.files?.[0])}
                className="text-sm"
              />
              <p className="text-xs text-slate-500">{fr ? "JPEG, PNG ou WebP, 5 Mo maximum." : "JPEG, PNG or WebP, 5 MB maximum."}</p>
              {form.image && !uploading && (
                <button type="button" onClick={() => set({ image: "" })} className="text-xs text-red-600 hover:underline">
                  {fr ? "Retirer la photo" : "Remove photo"}
                </button>
              )}
              {uploadError && <p className="text-xs text-red-600">{uploadError}</p>}
              <p className="text-xs text-slate-500">{fr ? "La photo est facultative mais fortement recommandée." : "A photo is optional but strongly recommended."}</p>
            </div>
          </div>
        </DetailSection>
      )}

      {step === 2 && (
        <DetailSection title={fr ? "Étape 3 : Prix et stock" : "Step 3: Pricing & stock"}>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className={label}>{fr ? "Prix (USD) *" : "Price (USD) *"}</label>
              <input type="number" min="0" step="0.01" className={input} value={form.price} onChange={(e) => { set({ price: e.target.value }); }} />
              {fieldErr("price")}
            </div>
            <div>
              <label className={label}>{fr ? "Prix barré / comparé (USD)" : "Compare-at price (USD)"}</label>
              <input type="number" min="0" step="0.01" className={input} value={form.originalPrice} onChange={(e) => { set({ originalPrice: e.target.value }); }} />
              {fieldErr("originalPrice")}
              <p className="mt-1 text-xs text-slate-500">{fr ? "Le badge de remise est calculé automatiquement." : "The discount badge is calculated automatically."}</p>
            </div>
            <div>
              <label className={label}>{fr ? "Quantité en stock *" : "Stock quantity *"}</label>
              <input type="number" min="0" step="1" className={input} value={form.stock} onChange={(e) => { set({ stock: e.target.value }); }} />
              {fieldErr("stock")}
            </div>
          </div>
          <p className="mt-3 text-xs text-slate-500">
            {fr ? "Commission de la plateforme déduite de chaque vente : voir la page Finance." : "Platform commission is deducted from each sale: see the Finance page."}
          </p>
        </DetailSection>
      )}

      {step === 3 && (
        <DetailSection title={fr ? "Étape 4 : Vérification et envoi" : "Step 4: Review & submit"}>
          <dl className="space-y-2 text-sm">
            {[
              [fr ? "Titre (EN)" : "Title (EN)", form.title],
              [fr ? "Titre (FR)" : "Title (FR)", form.titleFr],
              [fr ? "Catégorie" : "Category", category],
              [fr ? "Description" : "Description", form.description],
              [fr ? "Prix" : "Price", form.price ? `$${form.price}` : ""],
              [fr ? "Prix barré" : "Compare-at", form.originalPrice ? `$${form.originalPrice}` : ""],
              [fr ? "Stock" : "Stock", form.stock],
            ].filter(([, v]) => v).map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 border-b border-[var(--border)] py-2">
                <dt className="text-slate-500">{k}</dt>
                <dd className="max-w-[60%] truncate text-right font-medium">{v}</dd>
              </div>
            ))}
          </dl>
          {form.image && (
            <div className="mt-3 h-24 w-24 overflow-hidden rounded-lg"><ProductImage src={form.image} alt="" /></div>
          )}
          {!editing && (
            <p className="mt-4 text-xs text-amber-700">
              {fr
                ? "Si la modération est active, le produit sera « en attente » jusqu'à approbation par un modérateur ; sinon il est publié aussitôt. Le résultat réel s'affiche après l'envoi."
                : "If moderation is switched on the product stays “pending” until a moderator approves it; otherwise it is published right away. The real outcome is shown after you submit."}
            </p>
          )}
          {submitError && <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{submitError}</p>}
        </DetailSection>
      )}

      <div className="flex flex-wrap gap-3">
        {step > 0 && <Button variant="secondary" onClick={() => setStep(step - 1)} disabled={submitting}>{fr ? "Retour" : "Back"}</Button>}
        {step < STEPS.length - 1 ? (
          <Button onClick={() => { if (stepValid[step]) setStep(step + 1); }} disabled={!stepValid[step]}>
            {fr ? "Étape suivante" : "Next Step"}
          </Button>
        ) : (
          <Button onClick={() => void submit()} disabled={!allValid || submitting}>
            {submitting
              ? fr ? "Envoi…" : "Submitting…"
              : editing
                ? fr ? "Enregistrer les modifications" : "Save changes"
                : fr ? "Soumettre pour validation" : "Submit for review"}
          </Button>
        )}
        {editing && product && (
          <Link href={`/seller/products/${product.id}`} className="inline-flex items-center rounded-xl px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-100">
            {fr ? "Annuler" : "Cancel"}
          </Link>
        )}
      </div>
    </div>
  );
}
