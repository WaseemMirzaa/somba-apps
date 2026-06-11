"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";

export default function AccountDeletePage() {
  const { t } = useLocale();
  const { toast } = useToast();
  const router = useRouter();
  const [confirmed, setConfirmed] = useState(false);

  function requestDeletion() {
    toast(t("deletionRequestSubmitted"));
    router.push("/shop/help");
  }

  return (
    <div className="mx-auto max-w-md space-y-6">
      <PageHeader title={t("deleteMyAccount")} backHref="/shop/help" />
      <div className="card-premium space-y-4 p-6">
        <p className="text-sm text-slate-600">
          {t("deleteAccountWarning")}
        </p>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-1" />
          {t("deleteAccountConfirm")}
        </label>
        <Button onClick={requestDeletion} disabled={!confirmed} className="w-full bg-red-600 hover:bg-red-700">
          {t("requestDeletion")}
        </Button>
      </div>
    </div>
  );
}
