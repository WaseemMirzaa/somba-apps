"use client";

import { useState } from "react";
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
  const { getWarehouse, getCredential, resetCredentials, updateWarehouse, deactivateWarehouse } = useWarehouseAdmin();
  const { toast } = useToast();
  const { locale } = useLocale();
  const fr = locale === "fr";
  const warehouse = getWarehouse(id);
  const [password, setPassword] = useState(getCredential(id) ?? "—");
  const [showPassword, setShowPassword] = useState(false);
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
              <Button size="sm" onClick={() => { updateWarehouse(id, { status: "active" }); toast(fr ? "Entrepôt activé" : "Warehouse activated"); }}>{fr ? "Activer" : "Activate"}</Button>
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

        <DetailGridSection title={fr ? "Identifiants du portail" : "Portal Credentials"} span={2}>
          <InfoGrid items={[
            { label: fr ? "E-mail de connexion" : "Login Email", value: warehouse.portalEmail },
            { label: fr ? "Mot de passe" : "Password", value: showPassword ? password : "••••••••" },
          ]} />
          <p className="mt-2 text-xs text-slate-500">{fr ? "Les responsables d'entrepôt les utilisent sur /login — ils ne peuvent pas accéder aux portails Admin ou Vendeur." : "Warehouse managers use these at /login — they cannot access Admin or Seller portals."}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => setShowPassword(!showPassword)}>
              {fr ? (showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe") : `${showPassword ? "Hide" : "Show"} Password`}
            </Button>
            <Button size="sm" onClick={() => { const p = resetCredentials(id); setPassword(p); setShowPassword(true); toast(fr ? "Nouveau mot de passe généré" : "New password generated"); }}>
              {fr ? "Réinitialiser le mot de passe" : "Reset Password"}
            </Button>
            <Button size="sm" variant="danger" onClick={() => { deactivateWarehouse(id); toast(fr ? "Entrepôt désactivé" : "Warehouse deactivated", "error"); }}>
              {fr ? "Désactiver" : "Deactivate"}
            </Button>
          </div>
        </DetailGridSection>

        <DetailGridSection title={fr ? "Activité du jour" : "Today's Activity"} span={3}>
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
