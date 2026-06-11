"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { useToast } from "@/context/toast-context";
import { useLocale } from "@/context/locale-context";

export default function ShopNewAddressPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { t } = useLocale();
  const [form, setForm] = useState({ label: "", line1: "", city: "", commune: "", country: "France" });

  function save() {
    if (!form.line1.trim() || !form.city.trim()) {
      toast(t("fillRequiredFields"), "error");
      return;
    }
    toast(t("addressAdded"));
    router.push("/shop/account/addresses");
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title={t("newAddress")} subtitle={t("newDeliveryAddressSubtitle")} backHref="/shop/account/addresses" />
      <div className="card-premium space-y-3 p-6">
        <input className="input-premium w-full px-4 py-2 text-sm" placeholder={t("addressLabelPlaceholder")} value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
        <input className="input-premium w-full px-4 py-2 text-sm" placeholder={t("streetAddressPlaceholder")} value={form.line1} onChange={(e) => setForm({ ...form, line1: e.target.value })} required />
        <input className="input-premium w-full px-4 py-2 text-sm" placeholder={t("cityPlaceholder")} value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} required />
        <input className="input-premium w-full px-4 py-2 text-sm" placeholder={t("communePlaceholder")} value={form.commune} onChange={(e) => setForm({ ...form, commune: e.target.value })} />
        <div className="flex gap-2">
          <Button onClick={save}>{t("saveAddress")}</Button>
          <Button variant="ghost" onClick={() => router.push("/shop/account/addresses")}>{t("cancel")}</Button>
        </div>
      </div>
    </div>
  );
}
