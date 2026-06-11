"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";

export default function SellerStorefrontPage() {
  const { t } = useLocale();
  const { toast } = useToast();
  const router = useRouter();

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("storefrontSettings")}
        actions={<Link href="/seller/storefront/preview" className="text-sm text-sky-600">{t("previewLink")}</Link>}
      />
      <div className="card-premium space-y-4 p-6">
        <input className="input-premium w-full px-4 py-2 text-sm" placeholder={t("storeNameFr")} defaultValue="TechZone Store" />
        <input className="input-premium w-full px-4 py-2 text-sm" placeholder={t("storeNameEn")} defaultValue="TechZone Store" />
        <textarea className="input-premium w-full px-4 py-2 text-sm" placeholder={t("descriptionFr")} rows={3} />
        <textarea className="input-premium w-full px-4 py-2 text-sm" placeholder={t("descriptionEn")} rows={3} />
        <div className="rounded-xl border border-dashed p-8 text-center text-sm text-slate-500">Logo & Banner upload (mock)</div>
        <Button onClick={() => toast(t("saved"))}>{t("save")}</Button>
        <Button variant="secondary" onClick={() => router.push("/seller/storefront/preview")}>{t("preview")}</Button>
      </div>
    </div>
  );
}
