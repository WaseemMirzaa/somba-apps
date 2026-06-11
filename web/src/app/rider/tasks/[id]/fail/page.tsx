"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { useToast } from "@/context/toast-context";
import { getRiderTask } from "@/lib/rider-entities";
import { useLocale } from "@/context/locale-context";
import type { TranslationKey } from "@/lib/i18n";

const REASON_KEYS: TranslationKey[] = ["customerUnavailable", "wrongAddress", "refusedDelivery", "paymentIssue"];

export default function RiderFailedDeliveryPage() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const router = useRouter();
  const { t } = useLocale();
  const task = getRiderTask(id);
  const reasons = REASON_KEYS.map((key) => t(key));
  const [reason, setReason] = useState(reasons[0]);
  const [notes, setNotes] = useState("");

  if (!task) return <div>{t("notFound")}</div>;

  return (
    <div className="mx-auto max-w-md space-y-6">
      <PageHeader title={t("failDelivery")} subtitle={task.id} backHref={`/rider/tasks/${id}`} />
      <div className="card-premium space-y-4 p-6">
        <p className="text-sm text-slate-500">{t("failDeliverySubtitle")}</p>
        <select className="input-premium w-full px-4 py-2 text-sm" value={reason} onChange={(e) => setReason(e.target.value)}>
          {reasons.map((r) => <option key={r}>{r}</option>)}
        </select>
        <textarea className="input-premium w-full px-4 py-2 text-sm" rows={3} placeholder={t("notes")} value={notes} onChange={(e) => setNotes(e.target.value)} />
        <Button onClick={() => {
          toast(
            notes.trim()
              ? `${t("failedDeliveryLoggedWithReason")} ${reason}`
              : t("failedDeliveryReturnToWarehouse")
          );
          router.push("/rider/tasks");
        }} className="w-full bg-red-600">
          {t("failDelivery")}
        </Button>
      </div>
    </div>
  );
}
