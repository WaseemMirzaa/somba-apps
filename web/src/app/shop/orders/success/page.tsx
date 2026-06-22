"use client";

import Link from "next/link";
import { CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { PageLoader } from "@/components/ui/loader";
import { useLocale } from "@/context/locale-context";

function SuccessContent() {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const params = useSearchParams();
  const orderId = params.get("order") || "ORD-2024-NEW";

  return (
    <div className="mx-auto max-w-lg py-16 text-center">
      <div className="card-premium p-10">
        <CheckCircle className="mx-auto h-16 w-16 text-emerald-500" />
        <h1 className="mt-6 font-[family-name:var(--font-display)] text-2xl font-bold">{fr ? "Commande passée !" : "Order Placed!"}</h1>
        <p className="mt-2 text-slate-500">{fr ? "Merci d'avoir fait vos achats sur Somba&Teka" : "Thank you for shopping on Somba&Teka"}</p>
        <p className="mt-4 font-mono text-lg font-semibold text-blue-700">{orderId}</p>
        <p className="mt-2 text-sm text-slate-500">{fr ? "Confirmation envoyée à votre e-mail" : "Confirmation sent to your email"}</p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link href={`/shop/orders/${orderId}`}><Button variant="secondary">{fr ? "Suivre la commande" : "Track Order"}</Button></Link>
          <Link href="/shop/products"><Button>{fr ? "Continuer mes achats" : "Continue Shopping"}</Button></Link>
        </div>
      </div>
    </div>
  );
}

export default function OrderSuccessPage() {
  return (
    <Suspense fallback={<PageLoader className="py-16" />}>
      <SuccessContent />
    </Suspense>
  );
}
