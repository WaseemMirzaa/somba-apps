"use client";

import { useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { DetailSection, InfoGrid } from "@/components/ui/info-grid";
import { Button } from "@/components/ui/button";
import { DualCurrency } from "@/components/ui/dual-currency";
import { useLocale } from "@/context/locale-context";
import { useMarket } from "@/context/market-context";
import { PAYMENTS } from "@/lib/config";
import { useToast } from "@/context/toast-context";
import { PageLoader } from "@/components/ui/loader";

function PaymentContent() {
  const { locale } = useLocale();
  const { profile } = useMarket();
  const { toast } = useToast();
  const router = useRouter();
  const params = useSearchParams();
  const total = Number(params.get("total") || 1498);
  const [payment, setPayment] = useState("stripe_card");
  const [msisdn, setMsisdn] = useState("");
  const [paymentError, setPaymentError] = useState(false);
  const [retrying, setRetrying] = useState(false);

  function placeOrder() {
    if (paymentError && !retrying) {
      setPaymentError(false);
      setRetrying(true);
      return;
    }
    if (payment === "stripe_card" && retrying) {
      setPaymentError(true);
      setRetrying(false);
      toast(locale === "fr" ? "Paiement échoué — réessayez" : "Payment failed — retry");
      return;
    }
    router.push("/shop/orders/ORD-2024-001/confirmed");
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title={locale === "fr" ? "Paiement" : "Payment"} breadcrumbs={[{ label: locale === "fr" ? "Caisse" : "Checkout", href: "/shop/checkout" }, { label: locale === "fr" ? "Paiement" : "Payment" }]} />

      {paymentError && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="text-sm font-medium text-red-800">{locale === "fr" ? "Échec du paiement" : "Payment failed"}</p>
          <p className="mt-1 text-xs text-red-600">{locale === "fr" ? "Votre réservation est maintenue 15 min." : "Your reservation is held for 15 min."}</p>
          <button onClick={() => setPaymentError(false)} className="mt-2 text-sm font-medium text-red-700 underline">
            {locale === "fr" ? "Réessayer" : "Retry payment"}
          </button>
        </div>
      )}

      <DetailSection title={locale === "fr" ? "Mode de paiement" : "Payment Method"}>
        <div className="space-y-3">
          {[
            { id: "stripe_card", label: locale === "fr" ? "Stripe — Carte" : "Stripe — Card" },
            { id: "wallet", label: locale === "fr" ? "Portefeuille Somba ($142.50)" : "Somba Wallet ($142.50)" },
            { id: "airtel_money", label: "Airtel Money" },
          ].filter((m) => PAYMENTS.methods.includes(m.id as typeof PAYMENTS.methods[number])).map((m) => (
            <label key={m.id} className={`flex cursor-pointer items-center gap-3 rounded-xl border p-4 ${payment === m.id ? "border-blue-500 bg-blue-50" : "border-[var(--border)]"}`}>
              <input type="radio" name="payment" checked={payment === m.id} onChange={() => setPayment(m.id)} />
              <span className="font-medium">{m.label}</span>
            </label>
          ))}
        </div>

        {payment === "stripe_card" && (
          <div className="mt-4 rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
            {locale === "fr" ? "[Élément de carte Stripe — mock]" : "[Stripe Card Element — mock]"}
          </div>
        )}
        {payment === "airtel_money" && (
          <input className="input-premium mt-4 w-full px-4 py-2 text-sm" placeholder={`${profile.phonePrefix} XXX XXX XXX`} value={msisdn} onChange={(e) => setMsisdn(e.target.value)} />
        )}

        <p className="mt-4 text-lg font-bold">{locale === "fr" ? "Total" : "Total"}: <DualCurrency amount={total} /></p>
        <Button onClick={placeOrder} className="mt-4 w-full">
          {locale === "fr" ? "Payer" : "Pay"}
        </Button>
        <Link href="/shop/checkout" className="mt-2 block text-center text-sm text-slate-500 hover:underline">{locale === "fr" ? "← Retour" : "← Back"}</Link>
      </DetailSection>
    </div>
  );
}

export default function ShopPaymentPage() {
  return (
    <Suspense fallback={<PageLoader className="p-8" />}>
      <PaymentContent />
    </Suspense>
  );
}
