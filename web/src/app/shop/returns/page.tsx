"use client";

import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { RequireSignIn } from "@/components/shop/require-sign-in";
import { useMyDisputes, disputeStageLabel } from "@/lib/orders";
import { useLocale } from "@/context/locale-context";

function ReturnsList() {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const rows = useMyDisputes();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title={fr ? "Mes retours" : "My returns"}
        subtitle={fr ? "Statut en direct de vos demandes de retour et litiges" : "Live status of your return requests and disputes"}
        backHref="/shop/account"
        breadcrumbs={[{ label: fr ? "Mon compte" : "Account", href: "/shop/account" }, { label: fr ? "Retours" : "Returns" }]}
      />

      {rows.length === 0 ? (
        <div className="card-premium p-8 text-center text-sm text-slate-500">
          {fr ? "Aucune demande de retour pour le moment." : "You have no return requests yet."}
          <div className="mt-3">
            <Link href="/shop/orders" className="text-[var(--primary)] hover:underline">{fr ? "Voir mes commandes" : "View my orders"}</Link>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((d) => (
            <Link key={d.id} href={`/shop/returns/${d.id}`} className="card-premium flex items-center justify-between gap-4 p-4 transition-colors hover:border-blue-200">
              <div className="min-w-0">
                <p className="font-medium text-slate-900">{d.reference}</p>
                <p className="truncate text-xs text-slate-500">
                  {fr ? "Commande" : "Order"} {d.orderReference} · {new Date(d.createdAt).toLocaleDateString()} · {d.type === "return" ? (fr ? "Retour" : "Return") : (fr ? "Litige" : "Dispute")}
                </p>
                <p className="mt-1 text-xs text-slate-600">{disputeStageLabel(d, fr)}</p>
              </div>
              <Badge variant={d.status === "resolved" ? "success" : d.status === "rejected" ? "danger" : "warning"}>
                {d.status === "resolved" ? (fr ? "Résolu" : "Resolved") : d.status === "rejected" ? (fr ? "Rejeté" : "Rejected") : (fr ? "Ouvert" : "Open")}
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
