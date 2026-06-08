"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { useToast } from "@/context/toast-context";
import { getRiderTask } from "@/lib/rider-entities";

const REASONS = ["Customer unavailable", "Wrong address", "Refused delivery", "Payment issue"];

export default function RiderFailedDeliveryPage() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const router = useRouter();
  const task = getRiderTask(id);
  const [reason, setReason] = useState(REASONS[0]);

  if (!task) return <div>Not found</div>;

  return (
    <div className="mx-auto max-w-md space-y-6">
      <PageHeader title="Failed Delivery" subtitle={task.id} backHref={`/rider/tasks/${id}`} />
      <div className="card-premium space-y-4 p-6">
        <select className="input-premium w-full px-4 py-2 text-sm" value={reason} onChange={(e) => setReason(e.target.value)}>
          {REASONS.map((r) => <option key={r}>{r}</option>)}
        </select>
        <textarea className="input-premium w-full px-4 py-2 text-sm" rows={3} placeholder="Notes" />
        <Button onClick={() => { toast("Failed delivery logged — return to warehouse"); router.push("/rider/tasks"); }} className="w-full bg-red-600">
          Report Failed Delivery
        </Button>
      </div>
    </div>
  );
}
