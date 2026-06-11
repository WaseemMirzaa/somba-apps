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

function PaymentContent() {
  const { t } = useLocale();
  const { profile } = useMarket();
  const { toast } = useToast();
  const router = useRouter();
  const params = useSearchParams();
  const total = Number(params.get("total") || 1498);
  const [payment, setPayment] = useState("cod");
  const [otp, setOtp] = useState("");
  const [msisdn, setMsisdn] = useState("");
  const [paymentError, setPaymentError] = useState(false);
  const [retrying, setRetrying] = useState(false);

  const codEligible = total <= profile.codMaxOrderValue;

  function placeOrder() {
    if (payment === "cod" && !codEligible) {
      toast(t("codAmountExceedsLimit"));
      return;
    }
    if (paymentError && !retrying) {
      setPaymentError(false);
      setRetrying(true);
      return;
    }
    if (payment === "stripe_card" && retrying) {
      setPaymentError(true);
      setRetrying(false);
      toast(t("paymentFailedRetry"));
      return;
    }
    router.push("/shop/orders/ORD-2024-001/confirmed");
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title={t("payment")} breadcrumbs={[{ label: t("checkout"), href: "/shop/checkout" }, { label: t("payment") }]} />

      {paymentError && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="text-sm font-medium text-red-800">{t("paymentFailed")}</p>
          <p className="mt-1 text-xs text-red-600">{t("reservationHeld15Min")}</p>
          <button onClick={() => setPaymentError(false)} className="mt-2 text-sm font-medium text-red-700 underline">
            {t("retryPayment")}
          </button>
        </div>
      )}

      <DetailSection title={t("paymentMethod")}>
        <div className="space-y-3">
          {[
            { id: "stripe_card", label: "Stripe — Card" },
            { id: "wallet", label: "Somba Wallet ($142.50)" },
            { id: "airtel_money", label: "Airtel Money" },
            { id: "cod", label: "Cash on Delivery (COD)", disabled: !codEligible },
          ].filter((m) => PAYMENTS.methods.includes(m.id as typeof PAYMENTS.methods[number])).map((m) => (
            <label key={m.id} className={`flex cursor-pointer items-center gap-3 rounded-xl border p-4 ${payment === m.id ? "border-blue-500 bg-blue-50" : "border-[var(--border)]"} ${m.disabled ? "opacity-50" : ""}`}>
              <input type="radio" name="payment" checked={payment === m.id} disabled={m.disabled} onChange={() => setPayment(m.id)} />
              <span className="font-medium">{m.label}</span>
              {m.id === "cod" && !codEligible && (
                <span className="text-xs text-amber-600">Max <DualCurrency amount={profile.codMaxOrderValue} /></span>
              )}
            </label>
          ))}
        </div>

        {payment === "stripe_card" && (
          <div className="mt-4 rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
            [Stripe Card Element — mock]
          </div>
        )}
        {payment === "airtel_money" && (
          <input className="input-premium mt-4 w-full px-4 py-2 text-sm" placeholder={`${profile.phonePrefix} XXX XXX XXX`} value={msisdn} onChange={(e) => setMsisdn(e.target.value)} />
        )}
        {payment === "cod" && (
          <div className="mt-4 rounded-xl bg-amber-50 p-4">
            <p className="text-sm text-amber-800">{t("amountDueAtDelivery")}</p>
            <DualCurrency amount={total} className="text-xl font-bold text-amber-900" />
            {PAYMENTS.cod.otpRequired && (
              <input className="input-premium mt-2 w-full px-4 py-2 text-sm" placeholder="OTP at delivery" value={otp} onChange={(e) => setOtp(e.target.value)} />
            )}
          </div>
        )}

        <p className="mt-4 text-lg font-bold">{t("total")}: <DualCurrency amount={total} /></p>
        <Button onClick={placeOrder} className="mt-4 w-full">
          {payment === "cod" ? t("confirmCodOrder") : t("pay")}
        </Button>
        <Link href="/shop/checkout" className="mt-2 block text-center text-sm text-slate-500 hover:underline">← {t("back")}</Link>
      </DetailSection>
    </div>
  );
}

export default function ShopPaymentPage() {
  const { t } = useLocale();

  return (
    <Suspense fallback={<div className="p-8 text-center text-slate-500">{t("loading")}</div>}>
      <PaymentContent />
    </Suspense>
  );
}
