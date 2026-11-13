"use client";

import { useParams } from "next/navigation";
import { AftersaleSectionDetail, SectionGate } from "@/components/seller/aftersale-section";

export default function SellerReplacementsDetailPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <SectionGate kind="replacement">
      <AftersaleSectionDetail kind="replacement" id={decodeURIComponent(id)} />
    </SectionGate>
  );
}
