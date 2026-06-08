"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";

export default function SellerStorefrontPage() {
  const { locale } = useLocale();
  const { toast } = useToast();
  const router = useRouter();
  const fr = locale === "fr";

  return (
    <div className="space-y-6">
      <PageHeader
        title={fr ? "Paramètres vitrine" : "Storefront Settings"}
        actions={<Link href="/seller/storefront/preview" className="text-sm text-sky-600">{fr ? "Aperçu →" : "Preview →"}</Link>}
      />
      <div className="card-premium space-y-4 p-6">
        <input className="input-premium w-full px-4 py-2 text-sm" placeholder={fr ? "Nom boutique (FR)" : "Store name (FR)"} defaultValue="TechZone Store" />
        <input className="input-premium w-full px-4 py-2 text-sm" placeholder={fr ? "Nom boutique (EN)" : "Store name (EN)"} defaultValue="TechZone Store" />
        <textarea className="input-premium w-full px-4 py-2 text-sm" placeholder={fr ? "Description FR" : "Description FR"} rows={3} />
        <textarea className="input-premium w-full px-4 py-2 text-sm" placeholder={fr ? "Description EN" : "Description EN"} rows={3} />
        <div className="rounded-xl border border-dashed p-8 text-center text-sm text-slate-500">Logo & Banner upload (mock)</div>
        <Button onClick={() => toast(fr ? "Enregistré" : "Saved")}>{fr ? "Enregistrer" : "Save"}</Button>
        <Button variant="secondary" onClick={() => router.push("/seller/storefront/preview")}>{fr ? "Aperçu" : "Preview"}</Button>
      </div>
    </div>
  );
}
