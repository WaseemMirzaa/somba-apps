"use client";

import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";

export default function SellerResubmitPage() {
  const { t } = useLocale();
  const { toast } = useToast();
  const router = useRouter();

  return (
    <div className="mx-auto max-w-lg space-y-6 py-8">
      <PageHeader title={t("resubmitRegistration")} subtitle={t("afterRejection")} />
      <div className="card-premium space-y-4 p-6">
        <p className="text-sm text-slate-600">{t("resubmitInstructions")}</p>
        <input className="input-premium w-full px-4 py-2 text-sm" placeholder={t("businessName")} defaultValue="My Store" />
        <textarea className="input-premium w-full px-4 py-2 text-sm" placeholder={t("correctionsMade")} rows={3} />
        <Button onClick={() => { toast(t("resubmitted")); router.push("/seller/pending"); }} className="w-full">
          {t("resubmit")}
        </Button>
      </div>
    </div>
  );
}
