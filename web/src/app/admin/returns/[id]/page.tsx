"use client";

import { useParams } from "next/navigation";
import { DisputeCase } from "@/components/admin/dispute-case";

export default function AdminReturnDetailPage() {
  const { id } = useParams<{ id: string }>();
  return <DisputeCase id={id} kind="return" />;
}
