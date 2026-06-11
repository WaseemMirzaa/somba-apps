"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { DetailSection, InfoGrid } from "@/components/ui/info-grid";
import { Button } from "@/components/ui/button";
import { getSellerReview } from "@/lib/seller-entities";
import { useToast } from "@/context/toast-context";
import { useLocale } from "@/context/locale-context";

export default function SellerReviewDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const { locale, t } = useLocale();
  const fr = locale === "fr";
  const review = getSellerReview(Number(id));
  const [reply, setReply] = useState("");
  const [replied, setReplied] = useState(false);

  if (!review) return <div className="p-8 text-center text-slate-500">{t("notFound")}</div>;

  return (
    <div className="space-y-6">
      <PageHeader title={`${t("review")} #${review.id}`} subtitle={review.customer} backHref="/seller/reviews" />
      <DetailSection title={t("reviewDetail")}>
        <InfoGrid items={[
          { label: t("customer"), value: review.customer },
          { label: t("products"), value: <Link href={`/seller/products/${review.productId}`} className="text-sky-600 hover:underline">{review.product}</Link> },
          { label: t("rating"), value: "★".repeat(review.rating) },
          { label: t("date"), value: review.date },
          { label: t("review"), value: review.review, full: true },
        ]} />
        {!replied ? (
          <>
            <textarea className="input-premium mt-4 w-full px-4 py-2 text-sm" rows={3} placeholder={fr ? "Répondre au client..." : "Reply to customer..."} value={reply} onChange={(e) => setReply(e.target.value)} />
            <div className="mt-3 flex gap-2">
              <Button size="sm" onClick={() => { if (!reply.trim()) return; setReplied(true); toast(fr ? "Réponse envoyée" : "Reply sent"); }}>{fr ? "Envoyer" : "Send Reply"}</Button>
              <Button variant="secondary" size="sm" onClick={() => toast(fr ? "Avis signalé" : "Review reported", "info")}>{fr ? "Signaler" : "Report"}</Button>
            </div>
          </>
        ) : (
          <p className="mt-4 text-sm text-emerald-600">{fr ? "Répondu ✓" : "Replied ✓"}</p>
        )}
      </DetailSection>
    </div>
  );
}
