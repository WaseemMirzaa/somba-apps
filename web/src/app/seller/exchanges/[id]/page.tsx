"use client";

import { useParams } from "next/navigation";
import { AftersaleSectionDetail, SectionGate } from "@/components/seller/aftersale-section";

export default function SellerExchangesDetailPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <SectionGate kind="exchange">
      <AftersaleSectionDetail kind="exchange" id={decodeURIComponent(id)} />
    </SectionGate>
  );
}
