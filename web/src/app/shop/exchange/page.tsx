"use client";

import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { RequireSignIn } from "@/components/shop/require-sign-in";
import { useMyOrders } from "@/lib/orders";
import { useLocale } from "@/context/locale-context";

function ExchangePicker() {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const delivered = useMyOrders().filter((o) => o.status === "delivered");

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title={fr ? "Remplacer ou échanger" : "Replace or exchange"} backHref="/shop/returns" />
      <div className="card-premium space-y-2 p-6 text-sm text-slate-600">
        <p>
          {fr
            ? "Choisissez une commande livrée. Un remplacement envoie une unité neuve du même article ; un échange change la taille, la couleur ou l'option (la différence de prix passe par votre portefeuille). Un livreur de l'entrepôt apporte le nouvel article et reprend l'ancien."
            : "Pick a delivered order. A replacement sends a new unit of the same item; an exchange swaps the size, colour or option (any price difference goes through your wallet). A warehouse rider brings the new item and collects the old one."}
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
                <Link href={`/shop/orders/${o.id}/exchange`} className="btn-primary px-4 py-2 text-xs">{fr ? "Remplacer / échanger" : "Replace / exchange"}</Link>
                <Link href={`/shop/orders/${o.id}/return`} className="rounded-xl border px-4 py-2 text-xs font-medium">{fr ? "Demander un retour" : "Request a return"}</Link>
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
      <ExchangePicker />
    </RequireSignIn>
  );
}
