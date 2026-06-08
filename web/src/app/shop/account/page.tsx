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
  { href: "/shop/orders", icon: Package, label: "myOrders", desc: "Track & manage orders" },
  { href: "/shop/wishlist", icon: Heart, label: "wishlist", desc: "Saved items" },
  { href: "/shop/wallet", icon: CreditCard, label: "paymentMethods", desc: "Somba Wallet · Airtel top-up" },
  { href: "/shop/refer", icon: Heart, label: "myAccount", desc: "Refer & Earn — $10 bonus" },
  { href: "/shop/account/addresses", icon: MapPin, label: "addresses", desc: "France & global addresses" },
  { href: "/shop/support", icon: Headphones, label: "support", desc: "Help center" },
  { href: "/shop/notifications", icon: Headphones, label: "myAccount", desc: "Notifications" },
  { href: "/shop/help", icon: Headphones, label: "support", desc: "Help & account deletion" },
  { href: "/shop/deals", icon: Package, label: "flashSale", desc: "Flash deals" },
];

export default function ShopAccountPage() {
  const { t } = useLocale();

  return (
    <div className="space-y-8">
      <PageHeader
        title={t("myAccount")}
        breadcrumbs={[
          { label: "Shop", href: "/" },
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
            Gold Member
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
              <item.icon className="h-5 w-5 text-blue-600" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-slate-900">{t(item.label as Parameters<typeof t>[0])}</p>
              <p className="text-sm text-slate-500">{item.desc}</p>
            </div>
            <ChevronRight className="h-5 w-5 text-slate-400" />
          </Link>
        ))}
      </div>
    </div>
  );
}
