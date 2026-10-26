"use client";

import { useParams } from "next/navigation";
import { AftersaleFlowDetail } from "@/components/seller/aftersale-flow-detail";

export default function SellerReplacementsDetailPage() {
  const { id } = useParams<{ id: string }>();
  return <AftersaleFlowDetail kind="replacement" idOrRef={decodeURIComponent(id)} />;
}
