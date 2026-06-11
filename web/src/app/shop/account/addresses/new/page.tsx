"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { useToast } from "@/context/toast-context";

export default function ShopNewAddressPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [form, setForm] = useState({ label: "", line1: "", city: "", commune: "", country: "France" });

  function save() {
    if (!form.line1.trim() || !form.city.trim()) {
      toast("Fill in required fields", "error");
      return;
    }
    toast("Address added");
    router.push("/shop/account/addresses");
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title="Add Address" subtitle="CF-21 — new delivery address" backHref="/shop/account/addresses" />
      <div className="card-premium space-y-3 p-6">
        <input className="input-premium w-full px-4 py-2 text-sm" placeholder="Label (Home, Office...)" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
        <input className="input-premium w-full px-4 py-2 text-sm" placeholder="Street address" value={form.line1} onChange={(e) => setForm({ ...form, line1: e.target.value })} required />
        <input className="input-premium w-full px-4 py-2 text-sm" placeholder="City" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} required />
        <input className="input-premium w-full px-4 py-2 text-sm" placeholder="Commune / District" value={form.commune} onChange={(e) => setForm({ ...form, commune: e.target.value })} />
        <div className="flex gap-2">
          <Button onClick={save}>Save Address</Button>
          <Button variant="ghost" onClick={() => router.push("/shop/account/addresses")}>Cancel</Button>
        </div>
      </div>
    </div>
  );
}
