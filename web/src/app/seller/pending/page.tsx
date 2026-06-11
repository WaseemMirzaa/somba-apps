"use client";

import Link from "next/link";
import { Clock } from "lucide-react";
import { useLocale } from "@/context/locale-context";

export default function SellerPendingPage() {
  const { t } = useLocale();

  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <Clock className="mx-auto h-16 w-16 text-amber-500" />
      <h1 className="mt-4 text-2xl font-bold">{t("pendingApproval")}</h1>
      <p className="mt-2 text-slate-600">{t("pendingApprovalMessage")}</p>
      <Link href="/seller/resubmit" className="mt-6 inline-block text-sm text-blue-600 hover:underline">
        {t("updateInformation")}
      </Link>
    </div>
  );
}
