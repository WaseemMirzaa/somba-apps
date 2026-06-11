"use client";

import Link from "next/link";
import { useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { flashSales as initialSales } from "@/lib/admin-entities";
import { useToast } from "@/context/toast-context";

export default function AdminFlashSalesPage() {
  const { toast } = useToast();
  const [sales, setSales] = useState(initialSales);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [discount, setDiscount] = useState("");

  function saveCampaign() {
    if (!name.trim()) return;
    setSales((s) => [...s, {
      id: `FS-${s.length + 1}`,
      name,
      start: new Date().toISOString().slice(0, 10),
      end: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
      discount: Number(discount) || 20,
      products: 0,
      status: "scheduled" as const,
    }]);
    setShowCreate(false);
    setName("");
    setDiscount("");
    toast("Flash sale campaign created");
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Flash Sales"
        subtitle="Schedule campaigns with date picker"
        breadcrumbs={[{ label: "Admin", href: "/admin" }, { label: "Flash Sales" }]}
        actions={<Button size="sm" onClick={() => setShowCreate(true)}>Create Flash Sale</Button>}
      />

      {showCreate && (
        <Card>
          <CardContent className="space-y-4 p-6">
            <input className="input-premium w-full px-4 py-2.5 text-sm" placeholder="Campaign name" value={name} onChange={(e) => setName(e.target.value)} />
            <div className="grid gap-4 sm:grid-cols-2">
              <div><label className="text-xs font-medium">Start date</label><input type="date" className="input-premium mt-1 w-full px-4 py-2.5 text-sm" /></div>
              <div><label className="text-xs font-medium">End date</label><input type="date" className="input-premium mt-1 w-full px-4 py-2.5 text-sm" /></div>
            </div>
            <input className="input-premium w-full px-4 py-2.5 text-sm" placeholder="Discount %" value={discount} onChange={(e) => setDiscount(e.target.value)} />
            <Button onClick={saveCampaign}>Save Campaign</Button>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {sales.map((fs) => (
          <Link key={fs.id} href={`/admin/flash-sales/${fs.id}`}>
            <Card className="transition-colors hover:border-blue-200">
              <CardContent className="p-6">
                <div className="flex justify-between">
                  <h3 className="font-semibold">{fs.name}</h3>
                  <Badge variant={fs.status === "active" ? "success" : "warning"}>{fs.status}</Badge>
                </div>
                <p className="mt-2 text-sm text-slate-500">{fs.start} → {fs.end}</p>
                <p className="mt-1 text-sm">{fs.discount}% off · {fs.products} products</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
