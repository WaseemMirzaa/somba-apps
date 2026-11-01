"use client";

import { useParams } from "next/navigation";
import { OpsRedirect } from "@/components/warehouse/redirect";

/** Retired: a parcel is now a leg with its own page. */
export default function Page() {
  const { id } = useParams<{ id: string }>();
  return <OpsRedirect to={`/tasks/${id}`} />;
}
