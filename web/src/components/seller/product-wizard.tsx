"use client";

import { useState } from "react";
import { DetailSection } from "@/components/ui/info-grid";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { useToast } from "@/context/toast-context";

const STEPS = ["Basic Info", "Media", "Variants", "Inventory", "Pricing", "Shipping", "Review"];

export function ProductWizard() {
  const router = useRouter();
  const { toast } = useToast();
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
            key={s}
            onClick={() => setStep(i)}
            className={`whitespace-nowrap rounded-xl px-4 py-2 text-sm font-medium transition-all ${
              i === step ? "bg-[var(--primary)] text-white" : i < step ? "bg-red-100 text-[var(--primary)]" : "bg-slate-100 text-slate-500"
            }`}
          >
            {i + 1}. {s}
          </button>
        ))}
      </div>

      {step === 0 && (
        <DetailSection title="Step 1: Basic Information (EN + FR)">
          <div className="grid gap-4 sm:grid-cols-2">
            <input className="input-premium px-4 py-2.5 text-sm" placeholder="Product Title (EN)" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            <input className="input-premium px-4 py-2.5 text-sm" placeholder="Titre produit (FR)" value={form.titleFr} onChange={(e) => setForm({ ...form, titleFr: e.target.value })} />
            <input className="input-premium px-4 py-2.5 text-sm" placeholder="Brand" value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} />
            <select className="input-premium px-4 py-2.5 text-sm" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              <option>Electronics</option><option>Fashion</option><option>Home</option><option>Beauty</option>
            </select>
            <textarea className="input-premium sm:col-span-2 px-4 py-2.5 text-sm" rows={4} placeholder="Description (bilingual content)" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
        </DetailSection>
      )}

      {step === 1 && (
        <DetailSection title="Step 2: Media">
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
        <DetailSection title="Step 3: Variants">
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <input className="input-premium px-3 py-2 text-sm" placeholder="Variant name (e.g. Color)" value={variantName} onChange={(e) => setVariantName(e.target.value)} />
              <input className="input-premium px-3 py-2 text-sm" placeholder="Options (Red, Blue)" value={variantOptions} onChange={(e) => setVariantOptions(e.target.value)} />
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  if (!variantName.trim()) return;
                  setVariants((v) => [...v, { name: variantName, options: variantOptions }]);
                  setVariantName("");
                  setVariantOptions("");
                  toast(`Variant "${variantName}" added`);
                }}
              >
                Add
              </Button>
            </div>
            {variants.length > 0 && (
              <ul className="space-y-1 text-sm text-slate-600">
                {variants.map((v, i) => <li key={i}>{v.name}: {v.options || "—"}</li>)}
              </ul>
            )}
            <p className="text-xs text-slate-500">Size, Color, Storage — generate SKU matrix automatically</p>
          </div>
        </DetailSection>
      )}

      {step === 3 && (
        <DetailSection title="Step 4: Inventory">
          <div className="grid gap-4 sm:grid-cols-2">
            <input className="input-premium px-4 py-2.5 text-sm" placeholder="SKU" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
            <input className="input-premium px-4 py-2.5 text-sm" placeholder="Stock quantity" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} />
            <select className="input-premium px-4 py-2.5 text-sm"><option>Seller ships</option><option>Platform warehouse</option><option>Hybrid</option></select>
          </div>
        </DetailSection>
      )}

      {step === 4 && (
        <DetailSection title="Step 5: Pricing">
          <div className="grid gap-4 sm:grid-cols-3">
            <input className="input-premium px-4 py-2.5 text-sm" placeholder="Price (USD)" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
            <input className="input-premium px-4 py-2.5 text-sm" placeholder="MRP / Compare at" />
            <input className="input-premium px-4 py-2.5 text-sm" placeholder="Commission (auto: 12%)" disabled />
          </div>
        </DetailSection>
      )}

      {step === 5 && (
        <DetailSection title="Step 6: Shipping">
          <div className="grid gap-4 sm:grid-cols-2">
            <input className="input-premium px-4 py-2.5 text-sm" placeholder="Weight (kg)" value={form.weight} onChange={(e) => setForm({ ...form, weight: e.target.value })} />
            <select className="input-premium px-4 py-2.5 text-sm" value={form.shippingClass} onChange={(e) => setForm({ ...form, shippingClass: e.target.value })}>
              <option value="standard">Standard</option><option value="express">Express</option><option value="heavy">Heavy/Bulky</option>
            </select>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" defaultChecked /> Cross-city delivery allowed</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" defaultChecked /> Open box eligible</label>
          </div>
        </DetailSection>
      )}

      {step === 6 && (
        <DetailSection title="Step 7: Review & Submit">
          <dl className="space-y-2 text-sm">
            {Object.entries(form).filter(([, v]) => v).map(([k, v]) => (
              <div key={k} className="flex justify-between border-b border-[var(--border)] py-2">
                <dt className="text-slate-500 capitalize">{k}</dt>
                <dd className="font-medium">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-xs text-amber-600">Product will enter moderation queue after submit</p>
        </DetailSection>
      )}

      <div className="flex gap-3">
        {step > 0 && <Button variant="secondary" onClick={() => setStep(step - 1)}>Back</Button>}
        {step < 6 ? (
          <Button onClick={() => setStep(step + 1)}>Next Step</Button>
        ) : (
          <Button onClick={() => { toast("Submitted for moderation"); router.push("/seller/products"); }}>Submit for Moderation</Button>
        )}
        <Button variant="ghost" onClick={() => toast("Draft saved")}>Save Draft</Button>
      </div>
    </div>
  );
}
