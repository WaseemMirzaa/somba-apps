"use client";

import { useParams } from "next/navigation";
import { RequireSignIn } from "@/components/shop/require-sign-in";
import { RequestForm } from "@/components/shop/request-form";

export default function ShopOrderDisputePage() {
  const { id } = useParams<{ id: string }>();
  return (
    <RequireSignIn next={`/shop/orders/${id}/dispute`}>
      <RequestForm orderId={id} mode="dispute" />
    </RequireSignIn>
  );
}
