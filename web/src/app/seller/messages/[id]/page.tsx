"use client";

import { useParams } from "next/navigation";
import { ChatThread } from "@/components/seller/engage-chat";

export default function SellerMessageThreadPage() {
  const { id } = useParams<{ id: string }>();
  return <ChatThread id={id} />;
}
