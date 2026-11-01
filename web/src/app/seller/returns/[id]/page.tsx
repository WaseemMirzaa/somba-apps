"use client";

import { useParams } from "next/navigation";
import { AftersaleCaseDetail } from "@/components/seller/aftersale-case-detail";

export default function SellerReturnsDetailPage() {
  const { id } = useParams<{ id: string }>();
  return <AftersaleCaseDetail type="return" idOrRef={decodeURIComponent(id)} />;
}
