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
import { type TranslationKey } from "@/lib/i18n";

const TYPE_KEYS: Record<string, TranslationKey> = {
  cashback: "txTypeCashback",
  debit: "txTypePayment",
  topup: "txTypeTopup",
  refund: "txTypeRefund",
  withdrawal: "txTypeWithdrawal",
};

export default function WalletTransactionDetailPage() {
  const { locale, t } = useLocale();
  const { id } = useParams<{ id: string }>();
  const tx = getWalletTransaction(id);

  if (!tx) return <div className="text-center text-slate-500">{t("notFound")}</div>;

  const typeKey = TYPE_KEYS[tx.type];

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title={tx.id} subtitle={localizedField(locale, tx.desc, tx.descFr)} backHref="/shop/wallet" />
      <DetailSection title={t("transaction")}>
        <InfoGrid items={[
          { label: t("type"), value: <Badge variant={tx.amount > 0 ? "success" : "danger"}>{typeKey ? t(typeKey) : tx.type}</Badge> },
          { label: t("amount"), value: <span className={tx.amount > 0 ? "text-emerald-600 font-semibold" : "text-red-600 font-semibold"}>{tx.amount > 0 ? "+" : ""}{formatCurrency(tx.amount, locale)}</span> },
          { label: t("date"), value: tx.date },
          { label: t("balanceAfter"), value: formatCurrency(tx.balanceAfter, locale) },
          ...(tx.method ? [{ label: t("method"), value: tx.method }] : []),
          ...(tx.orderId ? [{ label: t("order"), value: <Link href={`/shop/orders/${tx.orderId}`} className="text-blue-600 hover:underline">{tx.orderId}</Link> }] : []),
          ...(tx.returnId ? [{ label: t("returns"), value: <Link href={`/shop/returns/${tx.returnId}`} className="text-blue-600 hover:underline">{tx.returnId}</Link> }] : []),
        ]} />
      </DetailSection>
    </div>
  );
}
