"use client";

import { useState } from "react";
import { DetailSection } from "@/components/ui/info-grid";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { useToast } from "@/context/toast-context";
import { useLocale } from "@/context/locale-context";

const STEPS = [
  { en: "Basic Info", fr: "Infos de base" },
  { en: "Media", fr: "Médias" },
  { en: "Variants", fr: "Variantes" },
  { en: "Inventory", fr: "Inventaire" },
  { en: "Pricing", fr: "Tarification" },
  { en: "Shipping", fr: "Livraison" },
  { en: "Review", fr: "Vérification" },
];

const FIELD_LABELS_FR: Record<string, string> = {
  title: "Titre (EN)",
  titleFr: "Titre (FR)",
  brand: "Marque",
  category: "Catégorie",
  description: "Description",
  price: "Prix",
  stock: "Stock",
  sku: "SKU",
  weight: "Poids",
  shippingClass: "Classe de livraison",
};

export function ProductWizard() {
  const router = useRouter();
  const { toast } = useToast();
  const { locale } = useLocale();
  const fr = locale === "fr";
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({
    title: "", titleFr: "", brand: "", category: "Electronics", description: "",
    price: "", stock: "", sku: "", weight: "", shippingClass: "standard",
  });
  const [variantName, setVariantName] = useState("");
  const [variantOptions, setVariantOptions] = useState("");
  const [variants, setVariants] = useState<{ name: string; options: string }[]>([]);

  return (
    <div className="space-y-6">
      <div className="flex gap-1 overflow-x-auto">
        {STEPS.map((s, i) => (
          <button
            key={s.en}
            onClick={() => setStep(i)}
            className={`whitespace-nowrap rounded-xl px-4 py-2 text-sm font-medium transition-all ${
              i === step ? "bg-[var(--primary)] text-white" : i < step ? "bg-red-100 text-[var(--primary)]" : "bg-slate-100 text-slate-500"
            }`}
          >
            {i + 1}. {fr ? s.fr : s.en}
          </button>
        ))}
      </div>

      {step === 0 && (
        <DetailSection title={fr ? "Étape 1 : Informations de base (EN + FR)" : "Step 1: Basic Information (EN + FR)"}>
          <div className="grid gap-4 sm:grid-cols-2">
            <input className="input-premium px-4 py-2.5 text-sm" placeholder={fr ? "Titre du produit (EN)" : "Product Title (EN)"} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            <input className="input-premium px-4 py-2.5 text-sm" placeholder={fr ? "Titre du produit (FR)" : "Titre produit (FR)"} value={form.titleFr} onChange={(e) => setForm({ ...form, titleFr: e.target.value })} />
            <input className="input-premium px-4 py-2.5 text-sm" placeholder={fr ? "Marque" : "Brand"} value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} />
            <select className="input-premium px-4 py-2.5 text-sm" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              <option value="Electronics">{fr ? "Électronique" : "Electronics"}</option><option value="Fashion">{fr ? "Mode" : "Fashion"}</option><option value="Home">{fr ? "Maison" : "Home"}</option><option value="Beauty">{fr ? "Beauté" : "Beauty"}</option>
            </select>
            <textarea className="input-premium sm:col-span-2 px-4 py-2.5 text-sm" rows={4} placeholder={fr ? "Description (contenu bilingue)" : "Description (bilingual content)"} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
        </DetailSection>
      )}

      {step === 1 && (
        <DetailSection title={fr ? "Étape 2 : Médias" : "Step 2: Media"}>
          <div className="grid gap-4 sm:grid-cols-3">
            {[1, 2, 3, 4, 5].map((n) => (
              <div key={n} className="flex aspect-square items-center justify-center rounded-xl border-2 border-dashed border-[var(--border)] text-sm text-slate-400">
                Image {n}
              </div>
            ))}
          </div>
          <input type="file" className="mt-4 text-sm" accept="image/*" />
        </DetailSection>
      )}

      {step === 2 && (
        <DetailSection title={fr ? "Étape 3 : Variantes" : "Step 3: Variants"}>
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <input className="input-premium px-3 py-2 text-sm" placeholder={fr ? "Nom de la variante (ex. Couleur)" : "Variant name (e.g. Color)"} value={variantName} onChange={(e) => setVariantName(e.target.value)} />
              <input className="input-premium px-3 py-2 text-sm" placeholder={fr ? "Options (Rouge, Bleu)" : "Options (Red, Blue)"} value={variantOptions} onChange={(e) => setVariantOptions(e.target.value)} />
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  if (!variantName.trim()) return;
                  setVariants((v) => [...v, { name: variantName, options: variantOptions }]);
                  setVariantName("");
                  setVariantOptions("");
                  toast(fr ? `Variante « ${variantName} » ajoutée` : `Variant "${variantName}" added`);
                }}
              >
                {fr ? "Ajouter" : "Add"}
              </Button>
            </div>
            {variants.length > 0 && (
              <ul className="space-y-1 text-sm text-slate-600">
                {variants.map((v, i) => <li key={i}>{v.name}: {v.options || "—"}</li>)}
              </ul>
            )}
            <p className="text-xs text-slate-500">{fr ? "Taille, Couleur, Stockage — génère automatiquement la matrice de SKU" : "Size, Color, Storage — generate SKU matrix automatically"}</p>
          </div>
        </DetailSection>
      )}

      {step === 3 && (
        <DetailSection title={fr ? "Étape 4 : Inventaire" : "Step 4: Inventory"}>
          <div className="grid gap-4 sm:grid-cols-2">
            <input className="input-premium px-4 py-2.5 text-sm" placeholder="SKU" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
            <input className="input-premium px-4 py-2.5 text-sm" placeholder={fr ? "Quantité en stock" : "Stock quantity"} value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} />
            <select className="input-premium px-4 py-2.5 text-sm"><option>{fr ? "Expédié par le vendeur" : "Seller ships"}</option><option>{fr ? "Entrepôt de la plateforme" : "Platform warehouse"}</option><option>{fr ? "Hybride" : "Hybrid"}</option></select>
          </div>
        </DetailSection>
      )}

      {step === 4 && (
        <DetailSection title={fr ? "Étape 5 : Tarification" : "Step 5: Pricing"}>
          <div className="grid gap-4 sm:grid-cols-3">
            <input className="input-premium px-4 py-2.5 text-sm" placeholder={fr ? "Prix (USD)" : "Price (USD)"} value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
            <input className="input-premium px-4 py-2.5 text-sm" placeholder={fr ? "Prix conseillé / Comparé à" : "MRP / Compare at"} />
            <input className="input-premium px-4 py-2.5 text-sm" placeholder={fr ? "Commission (auto : 12 %)" : "Commission (auto: 12%)"} disabled />
          </div>
        </DetailSection>
      )}

      {step === 5 && (
        <DetailSection title={fr ? "Étape 6 : Livraison" : "Step 6: Shipping"}>
          <div className="grid gap-4 sm:grid-cols-2">
            <input className="input-premium px-4 py-2.5 text-sm" placeholder={fr ? "Poids (kg)" : "Weight (kg)"} value={form.weight} onChange={(e) => setForm({ ...form, weight: e.target.value })} />
            <select className="input-premium px-4 py-2.5 text-sm" value={form.shippingClass} onChange={(e) => setForm({ ...form, shippingClass: e.target.value })}>
              <option value="standard">{fr ? "Standard" : "Standard"}</option><option value="express">{fr ? "Express" : "Express"}</option><option value="heavy">{fr ? "Lourd/Volumineux" : "Heavy/Bulky"}</option>
            </select>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" defaultChecked /> {fr ? "Livraison inter-villes autorisée" : "Cross-city delivery allowed"}</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" defaultChecked /> {fr ? "Éligible boîte ouverte" : "Open box eligible"}</label>
          </div>
        </DetailSection>
      )}

      {step === 6 && (
        <DetailSection title={fr ? "Étape 7 : Vérification et envoi" : "Step 7: Review & Submit"}>
          <dl className="space-y-2 text-sm">
            {Object.entries(form).filter(([, v]) => v).map(([k, v]) => (
              <div key={k} className="flex justify-between border-b border-[var(--border)] py-2">
                <dt className="text-slate-500 capitalize">{fr ? (FIELD_LABELS_FR[k] ?? k) : k}</dt>
                <dd className="font-medium">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-xs text-amber-600">{fr ? "Le produit entrera dans la file de modération après l'envoi" : "Product will enter moderation queue after submit"}</p>
        </DetailSection>
      )}

      <div className="flex gap-3">
        {step > 0 && <Button variant="secondary" onClick={() => setStep(step - 1)}>{fr ? "Retour" : "Back"}</Button>}
        {step < 6 ? (
          <Button onClick={() => setStep(step + 1)}>{fr ? "Étape suivante" : "Next Step"}</Button>
        ) : (
          <Button onClick={() => { toast(fr ? "Soumis pour modération" : "Submitted for moderation"); router.push("/seller/products"); }}>{fr ? "Soumettre pour modération" : "Submit for Moderation"}</Button>
        )}
        <Button variant="ghost" onClick={() => toast(fr ? "Brouillon enregistré" : "Draft saved")}>{fr ? "Enregistrer le brouillon" : "Save Draft"}</Button>
      </div>
    </div>
  );
}
