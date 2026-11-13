"use client";

import { AftersaleSectionList, SectionGate } from "@/components/seller/aftersale-section";

export default function SellerExchangesPage() {
  return (
    <SectionGate kind="exchange">
      <AftersaleSectionList kind="exchange" />
    </SectionGate>
  );
}
