"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { SellerListPage } from "@/components/seller/list-page";
import { useLocale } from "@/context/locale-context";
import { promotionList } from "@/lib/seller-entities";

export default function SellerPromotionsPage() {
  const { t, locale } = useLocale();
  const fr = locale === "fr";

  return (
    <SellerListPage
      title={t("promotions")}
      subtitle={fr ? "Les promotions sont publiées par la plateforme sur demande" : "Promotions are published by the platform on request"}
      breadcrumbs={[{ label: "Seller", href: "/seller" }, { label: t("promotions") }]}
      actions={
        <Link href="/seller/promotions/create" className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white">
          {fr ? "Demander une promotion" : "Request promotion"}
        </Link>
      }
      columns={[
        { key: "campaign", label: "Campaign", render: (row) => (
          <Link href={`/seller/promotions/${row.id}`} className="font-medium text-sky-600 hover:underline">{String(row.campaign)}</Link>
        )},
        { key: "products", label: "Products" },
        { key: "discount", label: "Discount", render: (row) => `${row.discount}%` },
        { key: "startDate", label: "Start" },
        { key: "endDate", label: "End" },
        { key: "status", label: t("status"), render: (row) => (
          <Badge variant={row.status === "active" ? "success" : "warning"}>{String(row.status)}</Badge>
        )},
        { key: "actions", label: t("action"), render: (row) => (
          <Link href={`/seller/promotions/${row.id}`} className="text-sm text-sky-600 hover:underline">{t("view")}</Link>
        )},
      ]}
      data={promotionList as unknown as Record<string, unknown>[]}
    />
  );
}
