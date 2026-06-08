"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { SellerListPage } from "@/components/seller/list-page";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";
import { supportTicketList as initialTickets } from "@/lib/seller-entities";

const priorityVariant: Record<string, "success" | "warning" | "danger" | "info" | "default"> = {
  low: "default",
  medium: "warning",
  high: "danger",
};

export default function SellerSupportPage() {
  const { t } = useLocale();
  const { toast } = useToast();
  const router = useRouter();
  const [tickets, setTickets] = useState(initialTickets);
  const [showNew, setShowNew] = useState(false);

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
          className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white"
        >
          New Ticket
        </button>
      }
      columns={[
        { key: "id", label: "Ticket ID", render: (row) => (
          <Link href={`/seller/support/${row.id}`} className="font-medium text-sky-600 hover:underline">{String(row.id)}</Link>
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
          <Link href={`/seller/support/${row.id}`} className="text-sm text-sky-600 hover:underline">{t("view")}</Link>
        )},
      ]}
      data={tickets as unknown as Record<string, unknown>[]}
    />
  );
}
