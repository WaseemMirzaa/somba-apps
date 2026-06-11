"use client";

import Link from "next/link";
import { CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { useLocale } from "@/context/locale-context";

function SuccessContent() {
  const params = useSearchParams();
  const { locale, t } = useLocale();
  const fr = locale === "fr";
  const orderId = params.get("order") || "ORD-2024-NEW";

  return (
    <div className="mx-auto max-w-lg py-16 text-center">
      <div className="card-premium p-10">
        <CheckCircle className="mx-auto h-16 w-16 text-emerald-500" />
        <h1 className="mt-6 font-[family-name:var(--font-display)] text-2xl font-bold">{t("orderSuccess")}</h1>
        <p className="mt-2 text-slate-500">{fr ? "Merci d'avoir acheté sur Somba" : "Thank you for shopping on Somba"}</p>
        <p className="mt-4 font-mono text-lg font-semibold text-blue-700">{orderId}</p>
        <p className="mt-2 text-sm text-slate-500">{fr ? "Confirmation envoyée par email" : "Confirmation sent to your email"}</p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link href={`/shop/orders/${orderId}`}><Button variant="secondary">{t("trackOrder")}</Button></Link>
          <Link href="/shop/products"><Button>{t("shopNow")}</Button></Link>
        </div>
      </div>
    </div>
  );
}

export default function OrderSuccessPage() {
  const { t } = useLocale();

  return (
    <Suspense fallback={<div className="py-16 text-center">{t("processing")}...</div>}>
      <SuccessContent />
    </Suspense>
  );
}
