"use client";

import { useParams } from "next/navigation";
import { SupportThread } from "@/components/warehouse/support-center";

export default function WarehouseSupportThreadPage() {
  const { id } = useParams<{ id: string }>();
  return <SupportThread id={id} backPath="/warehouse/support" />;
}
