"use client";

import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { RequireSignIn } from "@/components/shop/require-sign-in";
import { useConversations } from "@/lib/shop-engage";
import { useLocale } from "@/context/locale-context";
import { localized } from "@/lib/i18n-fields";

function ago(iso: string | null, fr: boolean): string {
  if (!iso) return "";
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (m < 1) return fr ? "à l'instant" : "just now";
  if (m < 60) return fr ? `il y a ${m} min` : `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return fr ? `il y a ${h} h` : `${h} h ago`;
  return new Date(iso).toLocaleDateString(fr ? "fr-FR" : "en-GB");
}

function Inbox() {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const { rows, loaded, error, reload } = useConversations();
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title={fr ? "Mes messages" : "My messages"}
        subtitle={fr ? "Vos conversations avec les vendeurs" : "Your conversations with sellers"}
        backHref="/shop/account"
        breadcrumbs={[{ label: fr ? "Mon compte" : "Account", href: "/shop/account" }, { label: fr ? "Messages" : "Messages" }]}
      />
      {error ? (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error} <button type="button" onClick={() => void reload()} className="font-medium underline">{fr ? "Réessayer" : "Retry"}</button>
        </p>
      ) : !loaded ? (
        <p className="text-sm text-slate-500">{fr ? "Chargement…" : "Loading…"}</p>
      ) : rows.length === 0 ? (
        <div className="card-premium p-8 text-center text-sm text-slate-500">
          {fr ? "Aucune conversation. Écrivez à un vendeur depuis un produit, une boutique ou une commande." : "No conversations yet. Message a seller from a product, a store or an order."}
        </div>
      ) : (
        <div className="space-y-2" data-testid="conversation-list">
          {rows.map((c) => (
            <Link key={c.id} href={`/shop/messages/${c.id}`} className="card-premium flex items-center gap-3 p-4 transition-colors hover:border-blue-200">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-blue-100 text-blue-700">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {c.storeLogo ? <img src={c.storeLogo} alt="" className="h-full w-full object-cover" /> : <MessageCircle className="h-5 w-5" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex items-center justify-between gap-2">
                  <span className={`truncate text-sm ${c.unread > 0 ? "font-bold" : "font-medium"} text-slate-900`}>{c.storeName}</span>
                  <span className="shrink-0 text-xs text-slate-500">{ago(c.lastMessageAt, fr)}</span>
                </p>
                <p className="truncate text-xs text-slate-500">
                  {c.productName ? `${localized(c, "productName", fr)} · ` : ""}{c.orderReference ? `${c.orderReference} · ` : ""}{c.lastMessagePreview ?? ""}
                </p>
              </div>
              {c.unread > 0 && (
                <span data-testid="conversation-unread" className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[11px] font-bold text-white">{c.unread}</span>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ShopMessagesPage() {
  return (
    <RequireSignIn next="/shop/messages">
      <Inbox />
    </RequireSignIn>
  );
}
