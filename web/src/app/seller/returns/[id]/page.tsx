"use client";

import { useParams } from "next/navigation";
import { AftersaleSectionDetail, SectionGate } from "@/components/seller/aftersale-section";

export default function SellerReturnsDetailPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <SectionGate kind="return">
      <AftersaleSectionDetail kind="return" id={decodeURIComponent(id)} />
    </SectionGate>
  );
}
