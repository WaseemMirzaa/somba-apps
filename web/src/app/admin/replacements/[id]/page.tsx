"use client";

import { useParams } from "next/navigation";
import { AfterSaleDetail } from "@/components/admin/after-sale-requests";

export default function AdminReplacementDetailPage() {
  const { id } = useParams<{ id: string }>();
  return <AfterSaleDetail id={id} kind="replacement" />;
}
