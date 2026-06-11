"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { DetailSection, InfoGrid } from "@/components/ui/info-grid";
import { Badge } from "@/components/ui/badge";
import { getWalletTransaction } from "@/lib/shared-entities";
import { formatCurrency } from "@/lib/utils";
import { useLocale } from "@/context/locale-context";
import { localizedField } from "@/lib/locale-helpers";

const TYPE_LABELS: Record<string, { en: string; fr: string }> = {
  cashback: { en: "Cashback", fr: "Cashback" },
  debit: { en: "Payment", fr: "Paiement" },
  topup: { en: "Top-up", fr: "Recharge" },
  refund: { en: "Refund", fr: "Remboursement" },
  withdrawal: { en: "Withdrawal", fr: "Retrait" },
};

export default function WalletTransactionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { locale, t } = useLocale();
  const fr = locale === "fr";
  const tx = getWalletTransaction(id);

  if (!tx) return <div className="text-center text-slate-500">{t("notFound")}</div>;

  const typeLabel = TYPE_LABELS[tx.type];

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title={tx.id} subtitle={localizedField(locale, tx.desc, tx.descFr)} backHref="/shop/wallet" />
      <DetailSection title={t("transaction")}>
        <InfoGrid items={[
          { label: t("type"), value: <Badge variant={tx.amount > 0 ? "success" : "danger"}>{typeLabel ? (fr ? typeLabel.fr : typeLabel.en) : tx.type}</Badge> },
          { label: t("amount"), value: <span className={tx.amount > 0 ? "text-emerald-600 font-semibold" : "text-red-600 font-semibold"}>{tx.amount > 0 ? "+" : ""}{formatCurrency(tx.amount, locale)}</span> },
          { label: t("date"), value: tx.date },
          { label: fr ? "Solde après" : "Balance after", value: formatCurrency(tx.balanceAfter, locale) },
          ...(tx.method ? [{ label: t("method"), value: tx.method }] : []),
          ...(tx.orderId ? [{ label: t("order"), value: <Link href={`/shop/orders/${tx.orderId}`} className="text-blue-600 hover:underline">{tx.orderId}</Link> }] : []),
          ...(tx.returnId ? [{ label: t("returns"), value: <Link href={`/shop/returns/${tx.returnId}`} className="text-blue-600 hover:underline">{tx.returnId}</Link> }] : []),
        ]} />
      </DetailSection>
    </div>
  );
}
