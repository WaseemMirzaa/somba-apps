"use client";

import Link from "next/link";
import {
  Package,
  MapPin,
  CreditCard,
  Heart,
  Headphones,
  ChevronRight,
  User,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { useLocale } from "@/context/locale-context";

const menuItems = [
  { href: "/shop/orders", icon: Package, label: "myOrders", desc: { en: "Track & manage orders", fr: "Suivre et gérer les commandes" } },
  { href: "/shop/wishlist", icon: Heart, label: "wishlist", desc: { en: "Saved items", fr: "Articles enregistrés" } },
  { href: "/shop/wallet", icon: CreditCard, label: "paymentMethods", desc: { en: "Somba&Teka Wallet · Airtel top-up", fr: "Somba&Teka Wallet · recharge Airtel" } },
  { href: "/shop/refer", icon: Heart, label: "myAccount", desc: { en: "Refer & Earn — $10 bonus", fr: "Parrainez et gagnez — bonus de 10 $" } },
  { href: "/shop/account/addresses", icon: MapPin, label: "addresses", desc: { en: "France & global addresses", fr: "Adresses en France et à l'international" } },
  { href: "/shop/support", icon: Headphones, label: "support", desc: { en: "Help center", fr: "Centre d'aide" } },
  { href: "/shop/notifications", icon: Headphones, label: "myAccount", desc: { en: "Notifications", fr: "Notifications" } },
  { href: "/shop/help", icon: Headphones, label: "support", desc: { en: "Help & account deletion", fr: "Aide et suppression de compte" } },
  { href: "/shop/deals", icon: Package, label: "flashSale", desc: { en: "Flash deals", fr: "Offres flash" } },
];

export default function ShopAccountPage() {
  const { t, locale } = useLocale();
  const fr = locale === "fr";

  return (
    <div className="space-y-8">
      <PageHeader
        title={t("myAccount")}
        breadcrumbs={[
          { label: fr ? "Boutique" : "Shop", href: "/" },
          { label: t("myAccount") },
        ]}
      />

      <div className="card-premium flex items-center gap-5 p-6">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white">
          <User className="h-8 w-8" />
        </div>
        <div>
          <h2 className="font-[family-name:var(--font-display)] text-xl font-bold text-slate-900">
            Marie Kabila
          </h2>
          <p className="text-sm text-slate-500">marie.kabila@email.com · +243 998 112 334</p>
          <span className="mt-2 inline-block rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
            {fr ? "Membre Gold" : "Gold Member"}
          </span>
        </div>
      </div>

      <div className="grid gap-3">
        {menuItems.map((item) => (
          <Link
            key={item.label}
            href={item.href}
            className="card-premium flex items-center gap-4 p-5 transition-colors hover:border-blue-200"
          >
            <div className="rounded-xl bg-blue-50 p-3">
              <item.icon className="h-5 w-5 text-[var(--primary)]" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-slate-900">{t(item.label as Parameters<typeof t>[0])}</p>
              <p className="text-sm text-slate-500">{fr ? item.desc.fr : item.desc.en}</p>
            </div>
            <ChevronRight className="h-5 w-5 text-slate-400" />
          </Link>
        ))}
      </div>
    </div>
  );
}
