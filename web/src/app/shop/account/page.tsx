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
  RotateCcw,
  AlertTriangle,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { useLocale } from "@/context/locale-context";
import type { TranslationKey } from "@/lib/i18n";

const menuItems: {
  href: string;
  icon: typeof Package;
  label: TranslationKey;
  labelOverride?: TranslationKey;
  desc: TranslationKey;
}[] = [
  { href: "/shop/orders", icon: Package, label: "myOrders", desc: "trackManageOrders" },
  { href: "/shop/returns", icon: RotateCcw, label: "returns", desc: "returnRequestsStatus" },
  { href: "/shop/disputes", icon: AlertTriangle, label: "disputes", desc: "orderDisputes" },
  { href: "/shop/wishlist", icon: Heart, label: "wishlist", desc: "savedItems" },
  { href: "/shop/wallet", icon: CreditCard, label: "paymentMethods", desc: "walletAirtel" },
  { href: "/shop/refer", icon: Heart, label: "myAccount", desc: "referEarn" },
  { href: "/shop/account/addresses", icon: MapPin, label: "addresses", desc: "globalAddresses" },
  { href: "/shop/support", icon: Headphones, label: "support", desc: "helpCenter" },
  { href: "/shop/notifications", icon: Headphones, label: "notificationsMenu", desc: "notificationsMenu" },
  { href: "/shop/help", icon: Headphones, label: "support", desc: "helpAccountDeletion" },
  { href: "/shop/deals", icon: Package, label: "flashSale", desc: "flashDeals" },
];

export default function ShopAccountPage() {
  const { t } = useLocale();

  return (
    <div className="space-y-8">
      <PageHeader
        title={t("myAccount")}
        breadcrumbs={[
          { label: t("shop"), href: "/" },
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
            {t("goldMember")}
          </span>
        </div>
      </div>

      <div className="grid gap-3">
        {menuItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="card-premium flex items-center gap-4 p-5 transition-colors hover:border-blue-200"
          >
            <div className="rounded-xl bg-blue-50 p-3">
              <item.icon className="h-5 w-5 text-blue-600" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-slate-900">{t(item.labelOverride ?? item.label)}</p>
              <p className="text-sm text-slate-500">{t(item.desc)}</p>
            </div>
            <ChevronRight className="h-5 w-5 text-slate-400" />
          </Link>
        ))}
      </div>
    </div>
  );
}
