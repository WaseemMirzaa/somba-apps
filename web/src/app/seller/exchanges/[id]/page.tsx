"use client";

import { useParams } from "next/navigation";
import { AftersaleFlowDetail } from "@/components/seller/aftersale-flow-detail";

export default function SellerExchangesDetailPage() {
  const { id } = useParams<{ id: string }>();
  return <AftersaleFlowDetail kind="exchange" idOrRef={decodeURIComponent(id)} />;
}
