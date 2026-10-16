"use client";

import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { useLocale } from "@/context/locale-context";

export default function SellerResubmitPage() {
  const { locale } = useLocale();
  const fr = locale === "fr";

  return (
    <div className="mx-auto max-w-lg space-y-6 px-4 py-8">
      <PageHeader title={fr ? "Inscription refusée ?" : "Application rejected?"} />
      <div className="card-premium space-y-4 p-6">
        <p className="text-sm text-slate-600">
          {fr
            ? "Il n'existe pas de formulaire de resoumission : la modération décide, et seul le support peut rouvrir un dossier."
            : "There is no resubmission form: moderation decides, and only support can reopen an application."}
        </p>
        <div className="flex flex-wrap gap-2">
          <Link href="/seller/support" className="btn-primary rounded-lg px-4 py-2 text-sm font-medium">
            {fr ? "Contacter le support" : "Contact support"}
          </Link>
          <a href="mailto:support@somba.com" className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700">
            support@somba.com
          </a>
        </div>
      </div>
    </div>
  );
}
