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
  const { t } = useLocale();
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
      subtitle="Ticket ID, Category, Priority, Status, Last Update"
      breadcrumbs={[{ label: "Seller", href: "/seller" }, { label: t("support") }]}
      actions={
        <button
          onClick={() => {
            if (showNew) {
              const newId = `TKT-${String(tickets.length + 1).padStart(3, "0")}`;
              setTickets((t) => [{ id: newId, category: "General", subject: "New support request", priority: "medium", status: "open", lastUpdate: "Just now" }, ...t]);
              toast("Ticket created");
              router.push(`/seller/support/${newId}`);
            } else {
              setShowNew(true);
              toast("Fill in your issue and submit", "info");
            }
          }}
          className="btn-primary rounded-lg px-4 py-2 text-sm font-medium"
        >
          New Ticket
        </button>
      }
      filters={
        <ListFilters
          values={filters}
          onChange={setFilters}
          statusOptions={STATUS_OPTIONS}
          searchPlaceholder="Ticket ID, subject, category…"
        />
      }
      columns={[
        { key: "id", label: "Ticket ID", render: (row) => (
          <Link href={`/seller/support/${row.id}`} className="font-medium text-[var(--primary)] hover:underline">{String(row.id)}</Link>
        )},
        { key: "category", label: "Category" },
        { key: "subject", label: "Subject" },
        { key: "priority", label: "Priority", render: (row) => (
          <Badge variant={priorityVariant[row.priority as string] ?? "default"}>{String(row.priority)}</Badge>
        )},
        { key: "status", label: t("status"), render: (row) => (
          <Badge variant={row.status === "resolved" ? "success" : "warning"}>{String(row.status)}</Badge>
        )},
        { key: "lastUpdate", label: "Last Update" },
        { key: "actions", label: t("action"), render: (row) => (
          <Link href={`/seller/support/${row.id}`} className="text-sm text-[var(--primary)] hover:underline">{t("view")}</Link>
        )},
      ]}
      data={filtered as unknown as Record<string, unknown>[]}
    />
  );
}
