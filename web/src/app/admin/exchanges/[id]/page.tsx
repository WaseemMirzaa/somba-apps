"use client";

import { useParams } from "next/navigation";
import { AfterSaleDetail } from "@/components/admin/after-sale-requests";

export default function AdminExchangeDetailPage() {
  const { id } = useParams<{ id: string }>();
  return <AfterSaleDetail id={id} kind="exchange" />;
}
