"use client";

import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { RequireSignIn } from "@/components/shop/require-sign-in";
import { useMyOrders } from "@/lib/orders";
import { useLocale } from "@/context/locale-context";

function ExchangeInfo() {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const delivered = useMyOrders().filter((o) => o.status === "delivered");

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title={fr ? "Demander un échange" : "Request an exchange"} backHref="/shop/orders" />
      <div className="card-premium space-y-3 p-6 text-sm text-slate-600">
        <p>
          {fr
            ? "Les échanges sont traités par notre équipe support. Choisissez une commande livrée ci-dessous et ouvrez un ticket en précisant l'article et la variante souhaitée, ou demandez un retour avec remboursement."
            : "Exchanges are handled by our support team. Pick a delivered order below and open a ticket naming the item and the variant you want, or request a return for a refund."}
        </p>
      </div>
      {delivered.length === 0 ? (
        <p className="text-center text-sm text-slate-500">{fr ? "Aucune commande livrée pour le moment." : "You have no delivered orders yet."}</p>
      ) : (
        <div className="space-y-3">
          {delivered.map((o) => (
            <div key={o.id} className="card-premium flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <p className="font-medium text-slate-900">{o.reference}</p>
                <p className="text-xs text-slate-500">{o.date} · {o.itemsCount} {fr ? "articles" : "items"}</p>
              </div>
              <div className="flex gap-3 text-sm">
                <Link href={`/shop/support?order=${o.id}&subject=${encodeURIComponent(fr ? "Demande d'échange" : "Exchange request")}`} className="btn-primary px-4 py-2 text-xs">
                  {fr ? "Ouvrir un ticket d'échange" : "Open exchange ticket"}
                </Link>
                <Link href={`/shop/orders/${o.id}/return`} className="rounded-xl border px-4 py-2 text-xs font-medium">
                  {fr ? "Demander un retour" : "Request a return"}
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ShopExchangePage() {
  return (
    <RequireSignIn next="/shop/exchange">
      <ExchangeInfo />
    </RequireSignIn>
  );
}
