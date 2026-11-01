"use client";

import { useParams } from "next/navigation";
import { AftersaleCaseDetail } from "@/components/seller/aftersale-case-detail";

export default function SellerDisputesDetailPage() {
  const { id } = useParams<{ id: string }>();
  return <AftersaleCaseDetail type="dispute" idOrRef={decodeURIComponent(id)} />;
}
