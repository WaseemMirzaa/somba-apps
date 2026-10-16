"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { DetailGrid, DetailGridSection } from "@/components/ui/detail-grid";
import { InfoGrid } from "@/components/ui/info-grid";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { NavLinkButton } from "@/components/ui/nav-link-button";
import { useWarehouseAdmin } from "@/context/warehouse-admin-context";
import { useToast } from "@/context/toast-context";
import { useLocale } from "@/context/locale-context";
import { warehouseDashboardStats } from "@/lib/warehouse-entities";

const FULFILLMENT_LINKS = [
  { href: "/admin/fulfillment/inbound", label: "Inbound Queue", labelFr: "File d'attente entrante" },
  { href: "/admin/fulfillment/sorting", label: "Sorting", labelFr: "Tri" },
  { href: "/admin/fulfillment/dispatch", label: "Dispatch", labelFr: "Expédition" },
  { href: "/admin/fulfillment/deliveries", label: "Deliveries", labelFr: "Livraisons" },
  { href: "/admin/fulfillment/returns", label: "Returns", labelFr: "Retours" },
  { href: "/admin/fulfillment/inventory", label: "Inventory", labelFr: "Inventaire" },
  { href: "/admin/fulfillment/riders", label: "Riders", labelFr: "Livreurs" },
  { href: "/admin/fulfillment/exceptions", label: "Exceptions", labelFr: "Exceptions" },
];

export default function AdminWarehouseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { getWarehouse, updateWarehouse, deactivateWarehouse } = useWarehouseAdmin();
  const { toast } = useToast();
  const { locale } = useLocale();
  const fr = locale === "fr";
  const warehouse = getWarehouse(id);
  const stats = warehouseDashboardStats;

  if (!warehouse) {
    return <div className="p-8 text-center text-slate-500">{fr ? "Entrepôt introuvable" : "Warehouse not found"}</div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={warehouse.name}
        subtitle={`${warehouse.city}, ${warehouse.country} · ${warehouse.id}`}
        backHref="/admin/warehouses"
        breadcrumbs={[
          { label: fr ? "Admin" : "Admin", href: "/admin" },
          { label: fr ? "Entrepôts" : "Warehouses", href: "/admin/warehouses" },
          { label: warehouse.name },
        ]}
        actions={
          <>
            <Badge variant={warehouse.status === "active" ? "success" : "warning"}>{fr ? (warehouse.status === "active" ? "Actif" : warehouse.status === "setup" ? "Configuration" : "Inactif") : warehouse.status}</Badge>
            {warehouse.status !== "active" && (
              <Button size="sm" onClick={() => { updateWarehouse(id, { status: "active" }); toast(fr ? "Hub activé (local)" : "Hub activated (local)", "info"); }}>{fr ? "Activer" : "Activate"}</Button>
            )}
          </>
        }
      />

      <DetailGrid>
        <DetailGridSection title={fr ? "Détails de l'entrepôt" : "Warehouse Details"}>
          <InfoGrid items={[
            { label: "ID", value: warehouse.id },
            { label: fr ? "Adresse" : "Address", value: warehouse.address, full: true },
            { label: fr ? "Capacité" : "Capacity", value: warehouse.capacity.toLocaleString() },
            { label: fr ? "Personnel" : "Staff", value: warehouse.staff },
            { label: fr ? "Créé le" : "Created", value: warehouse.createdAt },
            { label: fr ? "Zones" : "Zones", value: warehouse.zones.join(" · "), full: true },
          ]} />
        </DetailGridSection>

        <DetailGridSection title={fr ? "Responsable" : "Manager"}>
          <InfoGrid items={[
            { label: fr ? "Nom" : "Name", value: warehouse.managerName },
            { label: fr ? "E-mail" : "Email", value: warehouse.managerEmail },
          ]} />
        </DetailGridSection>

        <DetailGridSection title={fr ? "Annuaire local" : "Local directory"} span={2}>
          <p className="text-sm text-slate-600">
            {fr
              ? "Cette fiche est locale à ce navigateur. Elle ne contient aucun identifiant : pour donner accès au portail entrepôt, créez un compte réel dans Personnel d'entrepôt."
              : "This record is local to this browser. It holds no credentials: to give someone warehouse-portal access, create a real account under Warehouse Staff."}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/admin/warehouses/staff"><Button size="sm" variant="secondary">{fr ? "Personnel d'entrepôt" : "Warehouse staff"}</Button></Link>
            <Button size="sm" variant="danger" onClick={() => { deactivateWarehouse(id); toast(fr ? "Hub désactivé (local)" : "Hub deactivated (local)", "info"); }}>
              {fr ? "Désactiver (local)" : "Deactivate (local)"}
            </Button>
          </div>
        </DetailGridSection>

        <DetailGridSection title={fr ? "Activité du jour (données démo)" : "Today's Activity (demo data)"} span={3}>
          <InfoGrid columns={4} items={[
            { label: fr ? "Reçus" : "Received", value: stats.receivedToday },
            { label: fr ? "Expédiés" : "Dispatched", value: stats.dispatchedToday },
            { label: fr ? "Lots actifs" : "Active Batches", value: stats.activeBatches },
            { label: fr ? "Retours en attente" : "Pending Returns", value: stats.pendingReturns },
          ]} />
        </DetailGridSection>

        <DetailGridSection title={fr ? "Opérations logistiques (vue admin)" : "Fulfillment Operations (Admin View)"} span={3}>
          <p className="mb-4 text-sm text-slate-600">{fr ? "Accédez à toutes les données du portail entrepôt depuis l'admin — pas besoin de basculer vers l'onglet entrepôt." : "Access all warehouse portal data from admin — no need to switch to the warehouse tab."}</p>
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {FULFILLMENT_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-lg border border-blue-100 bg-blue-50/50 px-4 py-3 text-sm font-medium text-blue-700 hover:bg-blue-50"
              >
                {fr ? link.labelFr : link.label} →
              </Link>
            ))}
          </div>
          <NavLinkButton href="/admin/fulfillment" className="mt-4">
            {fr ? "Ouvrir le tableau de bord logistique" : "Open Fulfillment Dashboard"} →
          </NavLinkButton>
        </DetailGridSection>
      </DetailGrid>
    </div>
  );
}
