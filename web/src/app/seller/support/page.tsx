"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { SellerListPage } from "@/components/seller/list-page";
import { useLocale } from "@/context/locale-context";
import { useSupport } from "@/context/support-context";
import { useRouter } from "next/navigation";
import { useToast } from "@/context/toast-context";

const priorityVariant: Record<string, "success" | "warning" | "danger" | "info" | "default"> = {
  low: "default",
  medium: "warning",
  high: "danger",
};

export default function SellerSupportPage() {
  const { t } = useLocale();
  const { toast } = useToast();
  const router = useRouter();
  const { tickets, createTicket } = useSupport();
  const sellerTickets = tickets.filter((t) => t.portal === "seller");

  return (
    <SellerListPage
      title={t("support")}
      subtitle="Ticket ID, Priority, Status, Last Update"
      breadcrumbs={[{ label: "Seller", href: "/seller" }, { label: t("support") }]}
      actions={
        <button
          onClick={() => {
            const created = createTicket({
              subject: "New support request",
              message: "Please assist with my seller account issue.",
              portal: "seller",
              customer: "TechZone Store",
              priority: "medium",
            });
            toast("Ticket created");
            router.push(`/seller/support/${created.id}`);
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
        { key: "subject", label: "Subject" },
        { key: "priority", label: "Priority", render: (row) => (
          <Badge variant={priorityVariant[row.priority as string] ?? "default"}>{String(row.priority)}</Badge>
        )},
        { key: "status", label: t("status"), render: (row) => (
          <Badge variant={row.status === "resolved" ? "success" : "warning"}>{String(row.status).replace("_", " ")}</Badge>
        )},
        { key: "lastUpdate", label: "Last Update" },
        { key: "actions", label: t("action"), render: (row) => (
          <Link href={`/seller/support/${row.id}`} className="text-sm text-sky-600 hover:underline">{t("view")}</Link>
        )},
      ]}
      data={sellerTickets as unknown as Record<string, unknown>[]}
    />
  );
}
