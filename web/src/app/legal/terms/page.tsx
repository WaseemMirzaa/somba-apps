"use client";

import { BRAND, LEGAL_LINKS } from "@/lib/config";
import Link from "next/link";
import { useLocale } from "@/context/locale-context";

export default function TermsPage() {
  const { t } = useLocale();

  return (
    <div className="mx-auto max-w-3xl px-4 py-16 prose prose-slate">
      <h1>{t("termsOfUse")}</h1>
      <p className="text-sm text-slate-500">{BRAND.legalEntity} · {BRAND.legalAddress}</p>
      <p>{t("welcomeTerms")} {BRAND.name}. {t("termsGovern")} {BRAND.fullName} {t("termsPlatform")}</p>
      <h2>1. {t("marketplaceModel")}</h2>
      <p>{BRAND.name} {t("marketplaceModelDesc")} {BRAND.legalEntity} {t("facilitatesTransactions")}</p>
      <h2>2. {t("ordersPayments")}</h2>
      <p>{t("ordersPaymentsDesc")}</p>
      <h2>3. {t("returnsRefundsSection")}</h2>
      <p>{t("returnsRefundsDesc")}</p>
      <h2>4. {t("openBoxDelivery")}</h2>
      <p>{t("openBoxDeliveryDesc")}</p>
      <nav className="mt-12 flex flex-wrap gap-4 text-sm">
        {LEGAL_LINKS.map((l) => (
          <Link key={l.href} href={l.href} className="text-blue-600 hover:underline">{l.label}</Link>
        ))}
      </nav>
    </div>
  );
}
