"use client";

import { SupportTicketDetail } from "@/components/support/support-ticket-detail";

export default function AdminSupportDetailPage() {
  return <SupportTicketDetail perspective="admin" backHref="/admin/support" />;
}
