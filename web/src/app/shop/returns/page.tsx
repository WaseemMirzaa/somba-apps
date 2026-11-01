"use client";

import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { RequireSignIn } from "@/components/shop/require-sign-in";
import { useMyRequests } from "@/lib/after-sale";
import { useLocale } from "@/context/locale-context";

const KIND: Record<string, { en: string; fr: string; href: (id: string) => string }> = {
  return: { en: "Return", fr: "Retour", href: (id) => `/shop/returns/${id}` },
  dispute: { en: "Dispute", fr: "Litige", href: (id) => `/shop/returns/${id}` },
  replacement: { en: "Replacement", fr: "Remplacement", href: (id) => `/shop/replacements/${id}` },
  exchange: { en: "Exchange", fr: "Échange", href: (id) => `/shop/exchanges/${id}` },
};

function ReturnsList() {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const rows = useMyRequests();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title={fr ? "Mes retours et échanges" : "My returns and exchanges"}
        subtitle={fr ? "Statut en direct de vos retours, litiges, remplacements et échanges" : "Live status of your returns, disputes, replacements and exchanges"}
        backHref="/shop/account"
        breadcrumbs={[{ label: fr ? "Mon compte" : "Account", href: "/shop/account" }, { label: fr ? "Retours" : "Returns" }]}
        actions={<Link href="/shop/exchange" className="rounded-xl border border-[var(--border)] bg-white px-4 py-2 text-sm font-medium shadow-sm hover:border-blue-200">{fr ? "Remplacer / échanger" : "Replace / exchange"}</Link>}
      />

      {rows.length === 0 ? (
        <div className="card-premium p-8 text-center text-sm text-slate-500">
          {fr ? "Aucune demande pour le moment." : "You have no requests yet."}
          <div className="mt-3">
            <Link href="/shop/orders" className="text-[var(--primary)] hover:underline">{fr ? "Voir mes commandes" : "View my orders"}</Link>
          </div>
        </div>
      ) : (
        <div className="space-y-3" data-testid="requests-list">
          {rows.map((d) => (
            <Link key={`${d.kind}-${d.id}`} href={KIND[d.kind].href(d.id)} className="card-premium flex items-center justify-between gap-4 p-4 transition-colors hover:border-blue-200">
              <div className="min-w-0">
                <p className="font-medium text-slate-900">{d.reference}</p>
                <p className="truncate text-xs text-slate-500">
                  {fr ? "Commande" : "Order"} {d.orderReference} · {new Date(d.createdAt).toLocaleDateString(fr ? "fr-FR" : "en-GB")} · {fr ? KIND[d.kind].fr : KIND[d.kind].en}
                </p>
                <p className="mt-1 text-xs text-slate-600">{fr ? d.labelFr : d.label}</p>
              </div>
              <Badge variant={d.statusClass}>
                {d.statusClass === "success" ? (fr ? "Terminé" : "Done") : d.statusClass === "danger" ? (fr ? "Refusé" : "Declined") : fr ? "En cours" : "In progress"}
              </Badge>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ShopReturnsPage() {
  return (
    <RequireSignIn next="/shop/returns">
      <ReturnsList />
    </RequireSignIn>
  );
}
