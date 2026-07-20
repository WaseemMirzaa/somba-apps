"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAdminData } from "@/lib/admin";
import { useToast } from "@/context/toast-context";
import { useLocale } from "@/context/locale-context";

const SALE_STATUS_FR: Record<string, string> = { active: "Actif", scheduled: "Planifiée", ended: "Terminée" };

export default function AdminFlashSalesPage() {
  const { toast } = useToast();
  const { locale } = useLocale();
  const fr = locale === "fr";
  const { flashSales } = useAdminData();
  const [sales, setSales] = useState(flashSales);
  useEffect(() => setSales(flashSales), [flashSales]);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [discount, setDiscount] = useState("");

  function saveCampaign() {
    if (!name.trim()) return;
    setSales((s) => [...s, {
      id: `FS-${s.length + 1}`,
      name,
      nameFr: name,
      start: new Date().toISOString().slice(0, 10),
      end: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
      discount: Number(discount) || 20,
      products: 0,
      status: "scheduled" as const,
    }]);
    setShowCreate(false);
    setName("");
    setDiscount("");
    toast(fr ? "Campagne de vente flash créée" : "Flash sale campaign created");
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={fr ? "Ventes flash" : "Flash Sales"}
        subtitle={fr ? "Programmez des campagnes avec un sélecteur de date" : "Schedule campaigns with date picker"}
        breadcrumbs={[{ label: fr ? "Admin" : "Admin", href: "/admin" }, { label: fr ? "Ventes flash" : "Flash Sales" }]}
        actions={<Button size="sm" onClick={() => setShowCreate(true)}>{fr ? "Créer une vente flash" : "Create Flash Sale"}</Button>}
      />

      {showCreate && (
        <Card>
          <CardContent className="space-y-4 p-6">
            <input className="input-premium w-full px-4 py-2.5 text-sm" placeholder={fr ? "Nom de la campagne" : "Campaign name"} value={name} onChange={(e) => setName(e.target.value)} />
            <div className="grid gap-4 sm:grid-cols-2">
              <div><label className="text-xs font-medium">{fr ? "Date de début" : "Start date"}</label><input type="date" className="input-premium mt-1 w-full px-4 py-2.5 text-sm" /></div>
              <div><label className="text-xs font-medium">{fr ? "Date de fin" : "End date"}</label><input type="date" className="input-premium mt-1 w-full px-4 py-2.5 text-sm" /></div>
            </div>
            <input className="input-premium w-full px-4 py-2.5 text-sm" placeholder={fr ? "Remise %" : "Discount %"} value={discount} onChange={(e) => setDiscount(e.target.value)} />
            <Button onClick={saveCampaign}>{fr ? "Enregistrer la campagne" : "Save Campaign"}</Button>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {sales.map((fs) => (
          <Card key={fs.id}>
            <CardContent className="p-6">
              <div className="flex justify-between">
                <h3 className="font-semibold">{fr ? (fs.nameFr ?? fs.name) : fs.name}</h3>
                <Badge variant={fs.status === "active" ? "success" : "warning"}>{fr ? (SALE_STATUS_FR[fs.status] ?? fs.status) : fs.status}</Badge>
              </div>
              <p className="mt-2 text-sm text-slate-500">{fs.start} → {fs.end}</p>
              <p className="mt-1 text-sm">{fr ? `${fs.discount} % de remise · ${fs.products} produits` : `${fs.discount}% off · ${fs.products} products`}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
