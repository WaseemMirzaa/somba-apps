"use client";

import { AftersaleSectionList, SectionGate } from "@/components/seller/aftersale-section";

export default function SellerReplacementsPage() {
  return (
    <SectionGate kind="replacement">
      <AftersaleSectionList kind="replacement" />
    </SectionGate>
  );
}
