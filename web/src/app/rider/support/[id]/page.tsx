"use client";

import { useParams } from "next/navigation";
import { SupportThread } from "@/components/warehouse/support-center";

export default function RiderSupportThreadPage() {
  const { id } = useParams<{ id: string }>();
  return <SupportThread id={id} backPath="/rider/support" />;
}
