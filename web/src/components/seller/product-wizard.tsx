"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DetailSection } from "@/components/ui/info-grid";
import { Button } from "@/components/ui/button";
import { MAX_GROUPS, MAX_OPTIONS, readVariants, type VariantGroup } from "@/lib/variants";
import { DELIVERY_DAYS } from "@/lib/delivery-estimate";
import { ProductImage } from "@/components/seller/product-image";
import { useToast } from "@/context/toast-context";
import { useLocale } from "@/context/locale-context";
import { useRealtime } from "@/context/realtime-context";
import { useSellerData, useSellerPlan, type SellerProductRow } from "@/lib/seller";
import { errMessage } from "@/lib/seller-labels";
import type { Product } from "@/lib/realtime/types";
import { formatCurrency } from "@/lib/utils";
import { autoTranslateHint, daysLabel, fieldOrigin, ownText, pickText, titleRequiredMessage, type Lang } from "@/lib/i18n-fields";
import { TranslationBadge } from "@/components/seller/translation-badge";

const STEPS = [
  { en: "Basic Info", fr: "Infos de base" },
  { en: "Photo", fr: "Photo" },
  { en: "Pricing & stock", fr: "Prix et stock" },
  { en: "Review", fr: "Vérification" },
];

type FormState = {
  title: string;
  titleFr: string;
  /** The language the seller started typing the title in: the listing's source language when both are filled in. */
  firstLang: Lang | null;
  /** The category row id (`name:<English name>` for an old listing whose category is no longer in the list). */
  category: string;
  description: string;
  descriptionFr: string;
  price: string;
  originalPrice: string;
  stock: string;
  /** The seller's delivery time for this product, in days. */
  deliveryDays: string;
  image: string;
  /** Option types; `values` is the comma-separated list the seller types. */
  options: { name: string; values: string }[];
};

const splitValues = (v: string) => v.split(",").map((x) => x.trim()).filter(Boolean);
const toGroups = (rows: FormState["options"]): VariantGroup[] =>
  rows.map((r) => ({ name: r.name.trim(), options: splitValues(r.values) })).filter((g) => g.name || g.options.length);

/**
 * The form is filled with the STORED list price (`basePrice`), never the price
 * shoppers currently pay: while a campaign or flash sale runs, `price` is the
 * discounted one and `originalPrice` is the "was" price, neither of which must
 * be written back as the list price / compare-at price.
 */
function listPriceOf(p: SellerProductRow): number {
  return p.basePrice ?? p.price;
}
function compareAtOf(p: SellerProductRow): number | null {
  const list = listPriceOf(p);
  if ((p.priceSource ?? "base") === "base") return p.originalPrice;
  return p.originalPrice && p.originalPrice > list ? p.originalPrice : null;
}

/** The category value a listing points at: its category id, else the row with the same English name. */
function categoryValueOf(p: Pick<Product, "categoryId" | "category">, list: { id: string; name: string }[]): string {
  return p.categoryId ?? list.find((c) => c.name === p.category)?.id ?? `name:${p.category}`;
}

function initialForm(p: SellerProductRow | null | undefined, categoryValue: string): FormState {
  const compare = p ? compareAtOf(p) : null;
  return {
    // Only what is really written (or translated) in each language: the API's fallback copy is shown as empty.
    title: p ? ownText(p, "name", "en") : "",
    titleFr: p ? ownText(p, "name", "fr") : "",
    firstLang: p ? (p.sourceLang === "fr" ? "fr" : "en") : null,
    category: categoryValue,
    description: p ? ownText(p, "description", "en") : "",
    descriptionFr: p ? ownText(p, "description", "fr") : "",
    price: p ? String(listPriceOf(p)) : "",
    originalPrice: compare ? String(compare) : "",
    stock: p ? String(p.stock) : "",
    deliveryDays: String(p?.deliveryDays ?? DELIVERY_DAYS.fallback),
    image: p?.image ?? "",
    options: readVariants(p?.variants).map((g) => ({ name: g.name, values: g.options.join(", ") })),
  };
}

/** The validated fields, and the step each one lives on. */
type FieldKey = "title" | "category" | "price" | "originalPrice" | "stock" | "deliveryDays" | "options";
const FIELD_STEP: Record<FieldKey, number> = { title: 0, category: 0, price: 2, originalPrice: 2, stock: 2, deliveryDays: 2, options: 2 };
const FIELD_KEYS = Object.keys(FIELD_STEP) as FieldKey[];

/**
 * Product form shared by "create" and "edit". It only collects what the server
 * stores: name (EN/FR), category, description, price, compare-at price, stock
 * and one photo. Everything is validated before a step can be left; a field's error is only SHOWN once the seller
 * has touched the field (left it) or tried to go to the next step, so a step that has just opened is never red.
 */
export function ProductWizard({ product }: { product?: SellerProductRow | null }) {
  const router = useRouter();
  const { toast } = useToast();
  const { locale } = useLocale();
  const { categories } = useRealtime();
  const { createProduct, updateProduct, uploadImage } = useSellerData();
  const { plan, used, max, atLimit } = useSellerPlan();
  const fr = locale === "fr";
  const editing = !!product;

  // Options are the category rows (value = id): renaming or translating a category never detaches its products.
  const categoryOptions = useMemo(() => {
    const base = categories.map((c) => ({ value: c.id, name: c.name, nameFr: pickText(true, c.name, c.nameFr) }));
    if (product?.category) {
      const v = categoryValueOf(product, categories);
      if (!base.some((c) => c.value === v)) base.push({ value: v, name: product.category, nameFr: pickText(true, product.category, product.categoryFr) });
    }
    return base;
  }, [categories, product]);

  const [step, setStep] = useState(0);
  const [descTab, setDescTab] = useState<Lang>("en");
  // What the seller saw when the form opened: an edit sends only what differs from it, even if a push (a sale, a
  // finished translation) changes the listing while the form is open.
  const [initial] = useState<FormState>(() => initialForm(product, product ? categoryValueOf(product, categories) : ""));
  const [form, setForm] = useState<FormState>(initial);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [created, setCreated] = useState<Product | null>(null);
  // Which fields the seller has left, and which steps they tried to leave: errors show only for those.
  const [touched, setTouched] = useState<Partial<Record<FieldKey, true>>>({});
  const [tried, setTried] = useState<Record<number, true>>({});
  const touch = (k: FieldKey) => setTouched((t) => (t[k] ? t : { ...t, [k]: true }));
  // The title is one rule over two inputs (either language will do): tabbing from one to the other is not "leaving" it.
  const touchTitle = (e: React.FocusEvent<HTMLInputElement>, other: string) => {
    if ((e.relatedTarget as HTMLElement | null)?.id !== other) touch("title");
  };
  const fileRef = useRef<HTMLInputElement>(null);

  // A legacy `name:<English name>` value (the category list had not arrived yet) is mapped to its row once it has.
  const resolveCategory = (value: string): string => {
    if (value && categoryOptions.some((o) => o.value === value)) return value;
    if (value.startsWith("name:")) {
      const hit = categoryOptions.find((o) => o.name === value.slice("name:".length));
      if (hit) return hit.value;
    }
    return value || categoryOptions[0]?.value || "";
  };
  const category = resolveCategory(form.category);
  const set = (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch }));

  const priceNum = Number(form.price);
  const origNum = Number(form.originalPrice);
  const stockNum = Number(form.stock);
  const daysNum = Number(form.deliveryDays);

  const groups = toGroups(form.options);
  const optionsError = (() => {
    const names = new Set<string>();
    for (const g of groups) {
      if (!g.name) return fr ? "Donnez un nom à chaque type d'option (ex. Taille)." : "Give each option type a name (e.g. Size).";
      if (g.options.length === 0) return fr ? `Ajoutez au moins une valeur pour « ${g.name} ».` : `Add at least one value for "${g.name}".`;
      if (g.options.length > MAX_OPTIONS) return fr ? `${MAX_OPTIONS} valeurs maximum pour « ${g.name} ».` : `At most ${MAX_OPTIONS} values for "${g.name}".`;
      if (new Set(g.options.map((o) => o.toLowerCase())).size !== g.options.length) return fr ? `« ${g.name} » contient deux fois la même valeur.` : `"${g.name}" has the same value twice.`;
      if (names.has(g.name.toLowerCase())) return fr ? `« ${g.name} » est en double.` : `"${g.name}" is listed twice.`;
      if ([g.name, ...g.options].some((x) => x.includes(":") || x.includes("·"))) return fr ? "Les options ne peuvent pas contenir « : » ou « · »." : 'Options cannot contain ":" or "·".';
      names.add(g.name.toLowerCase());
    }
    return "";
  })();

  const titleEn = form.title.trim();
  const titleFr = form.titleFr.trim();
  const descEn = form.description.trim();
  const descFr = form.descriptionFr.trim();

  const errors = {
    // C-I1: a title in English or in French (either one is enough).
    title:
      !titleEn && !titleFr
        ? titleRequiredMessage(fr)
        : [titleEn, titleFr].some((t) => t && t.length < 2)
          ? (fr ? "Un titre doit contenir au moins 2 caractères." : "A title must be at least 2 characters.")
          : [titleEn, titleFr].some((t) => t.length > 200)
            ? (fr ? "200 caractères maximum." : "200 characters maximum.")
            : "",
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
    deliveryDays:
      !Number.isInteger(daysNum) || daysNum < DELIVERY_DAYS.min || daysNum > DELIVERY_DAYS.max
        ? (fr ? `Le délai de livraison doit être un nombre entier de ${DELIVERY_DAYS.min} à ${DELIVERY_DAYS.max} jours.` : `Delivery time must be a whole number of days from ${DELIVERY_DAYS.min} to ${DELIVERY_DAYS.max}.`)
        : "",
    options: optionsError,
  };
  const stepValid = [
    !errors.title && !errors.category,
    !uploading,
    !errors.price && !errors.originalPrice && !errors.stock && !errors.deliveryDays && !errors.options,
    true,
  ];
  const allValid = !errors.title && !errors.category && !errors.price && !errors.originalPrice && !errors.stock && !errors.deliveryDays && !errors.options && !uploading;

  /** The error of a field, or "" while it is untouched and its step has not been attempted. */
  const show = (k: FieldKey) => (touched[k] || tried[FIELD_STEP[k]] ? errors[k] : "");
  const fieldErr = (k: FieldKey) =>
    show(k) ? <p role="alert" className="mt-1 text-xs text-red-600">{show(k)}</p> : null;

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
    const chosen = categoryOptions.find((c) => c.value === category);
    const categoryId = category.startsWith("name:") ? undefined : category;
    setSubmitting(true);
    setSubmitError(null);
    try {
      if (editing && product) {
        // Send ONLY what the seller changed. In particular the price fields are left out unless
        // edited, so a promotional price can never be saved back as the list price, and a machine
        // translation the seller did not touch is never turned into "written by you".
        const before = initial;
        const patch: Record<string, unknown> = {};
        if (titleEn !== before.title.trim()) patch.name = titleEn;
        if (titleFr !== before.titleFr.trim()) patch.nameFr = titleFr;
        // The title the listing was written in was cleared while the other language has one: the platform makes the
        // other language the original, but only text the seller sends counts as theirs, so the title they can see
        // there (possibly an automatic translation) is sent along.
        const source: Lang = product.sourceLang === "fr" ? "fr" : "en";
        if (source === "en" && patch.name === "" && titleFr) patch.nameFr = titleFr;
        if (source === "fr" && patch.nameFr === "" && titleEn) patch.name = titleEn;
        if (descEn !== before.description.trim()) patch.description = descEn;
        if (descFr !== before.descriptionFr.trim()) patch.descriptionFr = descFr;
        if (category !== resolveCategory(before.category)) {
          patch.category = chosen?.name ?? category;
          if (categoryId) patch.categoryId = categoryId;
        }
        if (form.image !== before.image) patch.image = form.image;
        if (priceNum !== Number(before.price)) patch.price = priceNum;
        if (form.originalPrice.trim() !== before.originalPrice.trim()) {
          patch.originalPrice = form.originalPrice.trim() ? origNum : null;
        }
        if (stockNum !== Number(before.stock)) patch.stock = stockNum;
        if (daysNum !== Number(before.deliveryDays)) patch.deliveryDays = daysNum;
        if (JSON.stringify(groups) !== JSON.stringify(toGroups(before.options))) patch.variants = groups;
        if (Object.keys(patch).length > 0) await updateProduct(product.id, patch);
        toast(fr ? "Modifications enregistrées" : "Changes saved");
        router.push(`/seller/products/${product.id}`);
      } else {
        // A language the seller left empty is not sent at all: the platform translates it from the other one.
        const sourceLang: Lang = titleEn && !titleFr ? "en" : titleFr && !titleEn ? "fr" : (form.firstLang ?? (fr ? "fr" : "en"));
        const payload = {
          ...(titleEn ? { name: titleEn } : {}),
          ...(titleFr ? { nameFr: titleFr } : {}),
          ...(descEn ? { description: descEn } : {}),
          ...(descFr ? { descriptionFr: descFr } : {}),
          sourceLang,
          price: priceNum,
          originalPrice: form.originalPrice.trim() ? origNum : undefined,
          category: chosen?.name ?? category,
          ...(categoryId ? { categoryId } : {}),
          stock: stockNum,
          deliveryDays: daysNum,
          image: form.image || undefined,
          variants: groups,
        };
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

  /** "Next": a step that is not valid yet says why (inline and as a toast) instead of leaving a dead button. */
  function goNext() {
    if (stepValid[step]) {
      setStep(step + 1);
      return;
    }
    setTried((t) => ({ ...t, [step]: true }));
    const why = FIELD_KEYS.filter((k) => FIELD_STEP[k] === step).map((k) => errors[k]).find(Boolean);
    if (why) toast(why, "error");
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
        {(!titleEn || !titleFr) && (
          <p className="text-xs text-slate-500">
            {fr ? "L'autre langue est traduite automatiquement : vous pourrez la relire et la corriger sur la fiche produit." : "The other language is being translated automatically: you can review and correct it on the product page."}
          </p>
        )}
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

  const promo = editing && product && (product.priceSource ?? "base") !== "base" ? product : null;
  const quotaExceeded = !editing && atLimit;
  const quotaServerError = !!submitError && /plan allows|upgrade your plan/i.test(submitError);

  return (
    <div className="space-y-6">
      {!editing && max !== null && (
        <div
          className={`rounded-xl border px-4 py-3 text-sm ${quotaExceeded ? "border-amber-300 bg-amber-50 text-amber-900" : "border-slate-200 bg-slate-50 text-slate-700"}`}
          data-testid="quota-banner"
        >
          {quotaExceeded ? (
            <>
              <strong>
                {fr
                  ? `Votre offre ${plan?.nameFr ?? plan?.name ?? ""} autorise ${max} annonces et vous les avez toutes utilisées.`
                  : `Your ${plan?.name ?? ""} plan allows ${max} listings and you have used all of them.`}
              </strong>{" "}
              {fr ? "Passez à une offre supérieure pour en ajouter d'autres." : "Upgrade your plan to add more."}{" "}
              <Link href="/seller/subscribe" className="font-semibold underline">{fr ? "Voir les offres" : "See plans"}</Link>
            </>
          ) : (
            <>{fr ? `Annonces utilisées : ${used} sur ${max} (offre ${plan?.nameFr ?? plan?.name ?? ""}).` : `Listings used: ${used} of ${max} (${plan?.name ?? ""} plan).`}</>
          )}
        </div>
      )}

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
              <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                <label className="block text-xs font-medium text-slate-600" htmlFor="pw-title-en">{fr ? "Titre du produit (EN)" : "Product title (EN)"}</label>
                {editing && product && <TranslationBadge fr={fr} origin={fieldOrigin(product, "name", "en", form.title, ownText(product, "name", product.sourceLang === "fr" ? "fr" : "en"))} />}
              </div>
              <input
                id="pw-title-en"
                className={input}
                value={form.title}
                aria-invalid={!!show("title")}
                onChange={(e) => set({ title: e.target.value, ...(e.target.value && !titleEn && !titleFr && !form.firstLang ? { firstLang: "en" as const } : {}) })}
                onBlur={(e) => touchTitle(e, "pw-title-fr")}
                maxLength={200}
              />
            </div>
            <div>
              <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                <label className="block text-xs font-medium text-slate-600" htmlFor="pw-title-fr">{fr ? "Titre du produit (FR)" : "Product title (FR)"}</label>
                {editing && product && <TranslationBadge fr={fr} origin={fieldOrigin(product, "name", "fr", form.titleFr, ownText(product, "name", product.sourceLang === "fr" ? "fr" : "en"))} />}
              </div>
              <input
                id="pw-title-fr"
                className={input}
                value={form.titleFr}
                aria-invalid={!!show("title")}
                onChange={(e) => set({ titleFr: e.target.value, ...(e.target.value && !titleEn && !titleFr && !form.firstLang ? { firstLang: "fr" as const } : {}) })}
                onBlur={(e) => touchTitle(e, "pw-title-en")}
                maxLength={200}
              />
            </div>
            <div className="sm:col-span-2">
              {fieldErr("title") ?? <p className="text-xs text-slate-500">{fr ? "Un titre dans au moins une langue. " : "A title in at least one language. "}{autoTranslateHint(fr)}</p>}
            </div>
            <div className="sm:col-span-2">
              <label className={label}>{fr ? "Catégorie *" : "Category *"}</label>
              <select className={input} value={category} onChange={(e) => { set({ category: e.target.value }); touch("category"); }} onBlur={() => touch("category")} disabled={categoryOptions.length === 0}>
                {categoryOptions.length === 0 && <option value="">{fr ? "Catégories indisponibles" : "Categories unavailable"}</option>}
                {categoryOptions.map((c) => (
                  <option key={c.value} value={c.value}>{fr ? c.nameFr : c.name}</option>
                ))}
              </select>
              {fieldErr("category")}
            </div>
            <div className="sm:col-span-2">
              <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                <label className="block text-xs font-medium text-slate-600" htmlFor="pw-description">{fr ? "Description" : "Description"}</label>
                <div className="flex items-center gap-2">
                  {editing && product && (
                    <TranslationBadge
                      fr={fr}
                      origin={fieldOrigin(product, "description", descTab, descTab === "en" ? form.description : form.descriptionFr, ownText(product, "description", product.sourceLang === "fr" ? "fr" : "en"))}
                    />
                  )}
                  <div role="tablist" aria-label={fr ? "Langue de la description" : "Description language"} className="inline-flex rounded-lg border border-slate-200 p-0.5 text-xs">
                    {(["en", "fr"] as const).map((l) => (
                      <button
                        key={l}
                        type="button"
                        role="tab"
                        aria-selected={descTab === l}
                        onClick={() => setDescTab(l)}
                        className={`rounded-md px-2.5 py-1 font-semibold ${descTab === l ? "bg-[var(--primary)] text-white" : "text-slate-600"}`}
                      >
                        {l.toUpperCase()}
                        {(l === "en" ? descEn : descFr) ? " •" : ""}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <textarea
                id="pw-description"
                className={input}
                rows={4}
                maxLength={5000}
                value={descTab === "en" ? form.description : form.descriptionFr}
                onChange={(e) => set(descTab === "en" ? { description: e.target.value } : { descriptionFr: e.target.value })}
              />
              <p className="mt-1 text-xs text-slate-500">{autoTranslateHint(fr)}</p>
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
              <input type="number" min="0" step="0.01" className={input} value={form.price} onChange={(e) => { set({ price: e.target.value }); }} onBlur={() => touch("price")} />
              {fieldErr("price")}
            </div>
            <div>
              <label className={label}>{fr ? "Prix barré / comparé (USD)" : "Compare-at price (USD)"}</label>
              <input type="number" min="0" step="0.01" className={input} value={form.originalPrice} onChange={(e) => { set({ originalPrice: e.target.value }); }} onBlur={() => touch("originalPrice")} />
              {fieldErr("originalPrice")}
              <p className="mt-1 text-xs text-slate-500">{fr ? "Le badge de remise est calculé automatiquement." : "The discount badge is calculated automatically."}</p>
            </div>
            <div>
              <label className={label}>{fr ? "Quantité en stock *" : "Stock quantity *"}</label>
              <input type="number" min="0" step="1" className={input} value={form.stock} onChange={(e) => { set({ stock: e.target.value }); }} onBlur={() => touch("stock")} />
              {fieldErr("stock")}
            </div>
            <div>
              <label className={label} htmlFor="pw-delivery-days">{fr ? "Délai de livraison (jours) *" : "Delivery time (days) *"}</label>
              <input id="pw-delivery-days" type="number" min={DELIVERY_DAYS.min} max={DELIVERY_DAYS.max} step="1" className={input} value={form.deliveryDays} onChange={(e) => { set({ deliveryDays: e.target.value }); }} onBlur={() => touch("deliveryDays")} />
              {fieldErr("deliveryDays")}
              <p className="mt-1 text-xs text-slate-500">
                {fr ? "Du paiement à la remise au client. Le client voit la date estimée ; il ne la choisit pas." : "From payment to handover. Shoppers see the estimated date; they don't choose it."}
              </p>
            </div>
          </div>
          <div className="mt-5 rounded-xl border border-[var(--border)] p-4" data-testid="variant-options">
            <p className="text-sm font-semibold">{fr ? "Options (facultatif)" : "Options (optional)"}</p>
            <p className="mb-3 text-xs text-slate-500">
              {fr
                ? "Ex. Taille : 39, 40, 41 — Couleur : Noir, Blanc. Le client devra choisir avant d'acheter. Le stock est commun à toutes les options."
                : "E.g. Size: 39, 40, 41 — Colour: Black, White. Shoppers must choose before buying. Stock is shared by all options."}
              {" "}
              {fr ? "Les noms et valeurs sont traduits automatiquement pour les clients." : "Names and values are translated automatically for shoppers."}
            </p>
            {form.options.map((row, i) => (
              <div key={i} className="mb-2 grid gap-2 sm:grid-cols-[1fr_2fr_auto]">
                <input
                  className={input}
                  aria-label={fr ? "Type d'option" : "Option type"}
                  placeholder={fr ? "Taille" : "Size"}
                  maxLength={30}
                  value={row.name}
                  onChange={(e) => set({ options: form.options.map((r, j) => (j === i ? { ...r, name: e.target.value } : r)) })}
                  onBlur={() => touch("options")}
                />
                <input
                  className={input}
                  aria-label={fr ? "Valeurs, séparées par des virgules" : "Values, comma-separated"}
                  placeholder={fr ? "39, 40, 41, 42" : "39, 40, 41, 42"}
                  value={row.values}
                  onChange={(e) => set({ options: form.options.map((r, j) => (j === i ? { ...r, values: e.target.value } : r)) })}
                  onBlur={() => touch("options")}
                />
                <button
                  type="button"
                  className="rounded-lg px-3 text-sm text-red-600 hover:bg-red-50"
                  onClick={() => set({ options: form.options.filter((_, j) => j !== i) })}
                >
                  {fr ? "Retirer" : "Remove"}
                </button>
              </div>
            ))}
            {form.options.length < MAX_GROUPS && (
              <button
                type="button"
                className="text-sm font-medium text-[var(--primary)] hover:underline"
                onClick={() => set({ options: [...form.options, { name: "", values: "" }] })}
              >
                {fr ? "+ Ajouter un type d'option" : "+ Add an option type"}
              </button>
            )}
            {fieldErr("options")}
          </div>
          {promo && (
            <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800" data-testid="promo-note">
              {promo.priceSource === "campaign"
                ? fr
                  ? `La campagne « ${pickText(true, promo.campaignName, promo.campaignNameFr)} » (-${promo.campaignPct} %) fait payer ${formatCurrency(promo.price, locale)} aux clients en ce moment. Le prix ci-dessus est votre prix catalogue : il n'est pas modifié par la campagne.`
                  : `Campaign “${pickText(false, promo.campaignName, promo.campaignNameFr)}” (-${promo.campaignPct}%) currently makes shoppers pay ${formatCurrency(promo.price, locale)}. The price above is your list price: the campaign does not change it.`
                : fr
                  ? `Une vente flash fait payer ${formatCurrency(promo.price, locale)} aux clients en ce moment. Le prix ci-dessus est votre prix catalogue.`
                  : `A flash sale currently makes shoppers pay ${formatCurrency(promo.price, locale)}. The price above is your list price.`}
            </p>
          )}
          <p className="mt-3 text-xs text-slate-500">
            {fr ? "Commission de la plateforme déduite de chaque vente : voir la page Finance." : "Platform commission is deducted from each sale: see the Finance page."}
          </p>
        </DetailSection>
      )}

      {step === 3 && (
        <DetailSection title={fr ? "Étape 4 : Vérification et envoi" : "Step 4: Review & submit"}>
          <dl className="space-y-2 text-sm">
            {[
              [fr ? "Titre (EN)" : "Title (EN)", titleEn || (fr ? "(sera traduit automatiquement)" : "(will be translated automatically)")],
              [fr ? "Titre (FR)" : "Title (FR)", titleFr || (fr ? "(sera traduit automatiquement)" : "(will be translated automatically)")],
              [fr ? "Catégorie" : "Category", (() => { const c = categoryOptions.find((o) => o.value === category); return c ? (fr ? c.nameFr : c.name) : ""; })()],
              [fr ? "Description (EN)" : "Description (EN)", descEn || (descFr ? (fr ? "(sera traduite automatiquement)" : "(will be translated automatically)") : "")],
              [fr ? "Description (FR)" : "Description (FR)", descFr || (descEn ? (fr ? "(sera traduite automatiquement)" : "(will be translated automatically)") : "")],
              [fr ? "Prix" : "Price", form.price ? formatCurrency(priceNum, locale) : ""],
              [fr ? "Prix barré" : "Compare-at", form.originalPrice ? formatCurrency(origNum, locale) : ""],
              [fr ? "Stock" : "Stock", form.stock],
              [fr ? "Délai de livraison" : "Delivery time", form.deliveryDays ? daysLabel(Number(form.deliveryDays), fr) : ""],
              ...groups.map((g) => [g.name, g.options.join(", ")]),
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
          {submitError && (
            <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {submitError}
              {quotaServerError && (
                <>
                  {" "}
                  <Link href="/seller/subscribe" className="font-semibold underline">{fr ? "Voir les offres" : "See plans"}</Link>
                </>
              )}
            </p>
          )}
        </DetailSection>
      )}

      <div className="flex flex-wrap gap-3">
        {step > 0 && <Button variant="secondary" onClick={() => setStep(step - 1)} disabled={submitting}>{fr ? "Retour" : "Back"}</Button>}
        {step < STEPS.length - 1 ? (
          <Button onClick={goNext} disabled={step === 1 && !stepValid[1]}>
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
