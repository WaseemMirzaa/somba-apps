"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { useToast } from "@/context/toast-context";
import { useLocale } from "@/context/locale-context";

export default function RiderFirstPasswordPage() {
  const { toast } = useToast();
  const router = useRouter();
  const { t } = useLocale();
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");

  function submit() {
    if (pw !== confirm || pw.length < 8) {
      toast(t("passwordsMustMatch"));
      return;
    }
    toast(t("passwordSet"));
    router.push("/rider/profile");
  }

  return (
    <div className="mx-auto max-w-md space-y-6 py-8">
      <PageHeader title={t("firstPasswordTitle")} subtitle={t("firstPasswordSubtitle")} />
      <div className="card-premium space-y-4 p-6">
        <input type="password" className="input-premium w-full px-4 py-2 text-sm" placeholder={t("newPassword")} value={pw} onChange={(e) => setPw(e.target.value)} />
        <input type="password" className="input-premium w-full px-4 py-2 text-sm" placeholder={t("confirmPassword")} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        <Button onClick={submit} className="w-full">{t("setPassword")}</Button>
      </div>
    </div>
  );
}
