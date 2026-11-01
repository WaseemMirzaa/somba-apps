"use client";

import { useParams } from "next/navigation";
import { RequireSignIn } from "@/components/shop/require-sign-in";
import { RequestForm } from "@/components/shop/request-form";

export default function ShopOrderReturnPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <RequireSignIn next={`/shop/orders/${id}/return`}>
      <RequestForm orderId={id} mode="return" />
    </RequireSignIn>
  );
}
