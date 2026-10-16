"use client";

import { useState } from "react";
import { AssignRiderModal } from "@/components/warehouse/assign-rider-modal";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";
import { socketClient } from "@/lib/realtime/socket-client";
import type { Parcel } from "@/lib/warehouse";

/** Assign (or re-assign, before pickup) a single parcel: `delivery:assign {taskId, riderId}`. */
export function AssignParcelButton({
  parcel,
  className = "btn-primary rounded-lg px-4 py-2 text-sm font-medium",
  label,
}: {
  parcel: Pick<Parcel, "id" | "taskId" | "orderId">;
  className?: string;
  label?: string;
}) {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        {label ?? (fr ? "Assigner un livreur" : "Assign rider")}
      </button>
      <AssignRiderModal
        open={open}
        title={fr ? "Assigner un livreur au colis" : "Assign rider to parcel"}
        subtitle={`${parcel.id} · ${parcel.orderId}`}
        onClose={() => setOpen(false)}
        onConfirm={async (rider) => {
          await socketClient.request("delivery:assign", { taskId: parcel.taskId, riderId: rider.id });
          toast(fr ? `${rider.name} assigné à ${parcel.id}` : `${rider.name} assigned to ${parcel.id}`);
        }}
      />
    </>
  );
}
