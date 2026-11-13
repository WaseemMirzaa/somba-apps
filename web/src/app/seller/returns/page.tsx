"use client";

import { AftersaleSectionList, SectionGate } from "@/components/seller/aftersale-section";

export default function SellerReturnsPage() {
  return (
    <SectionGate kind="return">
      <AftersaleSectionList kind="return" />
    </SectionGate>
  );
}
