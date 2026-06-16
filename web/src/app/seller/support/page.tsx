"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { SellerListPage } from "@/components/seller/list-page";
import { ListFilters, EMPTY_LIST_FILTERS } from "@/components/ui/list-filters";
import { applyListFilters } from "@/lib/list-filter-utils";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";
import { supportTicketList as initialTickets } from "@/lib/seller-entities";

const priorityVariant: Record<string, "success" | "warning" | "danger" | "info" | "default"> = {
  low: "default",
  medium: "warning",
  high: "danger",
};

const STATUS_OPTIONS = [
  { value: "open", label: "Open", labelFr: "Ouvert" },
  { value: "in_progress", label: "In progress", labelFr: "En cours" },
  { value: "resolved", label: "Resolved", labelFr: "Résolu" },
];

export default function SellerSupportPage() {
  const { t, locale } = useLocale();
  const fr = locale === "fr";
  const { toast } = useToast();
  const router = useRouter();
  const [filters, setFilters] = useState(EMPTY_LIST_FILTERS);
  const [tickets, setTickets] = useState(initialTickets);
  const [showNew, setShowNew] = useState(false);

  const filtered = useMemo(
    () =>
      applyListFilters(tickets, filters, {
        searchFields: ["id", "subject", "category"],
        dateField: "lastUpdate",
        statusField: "status",
      }),
    [tickets, filters]
  );

  return (
    <SellerListPage
      title={t("support")}
      subtitle={fr ? "ID ticket, Catégorie, Priorité, Statut, Dernière mise à jour" : "Ticket ID, Category, Priority, Status, Last Update"}
      breadcrumbs={[{ label: fr ? "Vendeur" : "Seller", href: "/seller" }, { label: t("support") }]}
      actions={
        <button
          onClick={() => {
            if (showNew) {
              const newId = `TKT-${String(tickets.length + 1).padStart(3, "0")}`;
              setTickets((t) => [{ id: newId, category: fr ? "Général" : "General", subject: fr ? "Nouvelle demande de support" : "New support request", priority: "medium", status: "open", lastUpdate: fr ? "À l'instant" : "Just now" }, ...t]);
              toast(fr ? "Ticket créé" : "Ticket created");
              router.push(`/seller/support/${newId}`);
            } else {
              setShowNew(true);
              toast(fr ? "Décrivez votre problème et soumettez" : "Fill in your issue and submit", "info");
            }
          }}
          className="btn-primary rounded-lg px-4 py-2 text-sm font-medium"
        >
          {fr ? "Nouveau ticket" : "New Ticket"}
        </button>
      }
      filters={
        <ListFilters
          values={filters}
          onChange={setFilters}
          statusOptions={STATUS_OPTIONS}
          searchPlaceholder={fr ? "ID ticket, sujet, catégorie…" : "Ticket ID, subject, category…"}
        />
      }
      columns={[
        { key: "id", label: fr ? "ID ticket" : "Ticket ID", render: (row) => (
          <Link href={`/seller/support/${row.id}`} className="font-medium text-[var(--primary)] hover:underline">{String(row.id)}</Link>
        )},
        { key: "category", label: fr ? "Catégorie" : "Category" },
        { key: "subject", label: fr ? "Sujet" : "Subject" },
        { key: "priority", label: fr ? "Priorité" : "Priority", render: (row) => (
          <Badge variant={priorityVariant[row.priority as string] ?? "default"}>{String(row.priority)}</Badge>
        )},
        { key: "status", label: t("status"), render: (row) => (
          <Badge variant={row.status === "resolved" ? "success" : "warning"}>{String(row.status)}</Badge>
        )},
        { key: "lastUpdate", label: fr ? "Dernière mise à jour" : "Last Update" },
        { key: "actions", label: t("action"), render: (row) => (
          <Link href={`/seller/support/${row.id}`} className="text-sm text-[var(--primary)] hover:underline">{t("view")}</Link>
        )},
      ]}
      data={filtered as unknown as Record<string, unknown>[]}
    />
  );
}
