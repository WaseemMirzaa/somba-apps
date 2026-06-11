"use client";

import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { FAQ_ITEMS } from "@/lib/product-landing";
import { useLocale } from "@/context/locale-context";
import { localizedField } from "@/lib/locale-helpers";

export default function ShopHelpPage() {
  const { locale, t } = useLocale();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title={t("helpCenter")} />
      <div className="space-y-3">
        {FAQ_ITEMS.map((item, i) => (
          <details key={i} className="card-premium p-4">
            <summary className="cursor-pointer font-medium">{localizedField(locale, item.q, item.qFr)}</summary>
            <p className="mt-2 text-sm text-slate-600">{localizedField(locale, item.a, item.aFr)}</p>
          </details>
        ))}
      </div>
      <div className="card-premium border-red-100 p-4">
        <p className="font-medium text-red-800">{t("accountDeletion")}</p>
        <p className="mt-1 text-sm text-slate-600">{t("requestDeletionDesc")}</p>
        <Link href="/shop/account/delete" className="mt-3 inline-block text-sm font-medium text-red-600 hover:underline">
          {t("requestDeletionLink")}
        </Link>
      </div>
      <Link href="/shop/support" className="text-sm text-blue-600 hover:underline">{t("openSupportTicket")}</Link>
    </div>
  );
}
