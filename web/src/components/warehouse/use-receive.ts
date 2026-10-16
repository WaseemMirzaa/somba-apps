"use client";

import { useCallback, useState } from "react";
import { socketClient } from "@/lib/realtime/socket-client";
import { errorMessage } from "@/lib/warehouse-live";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";
import type { Parcel } from "@/lib/warehouse";

/**
 * "Receive parcel" = `warehouse:receive {taskId}` (hub scan-in). The success
 * toast is shown only after the server has acknowledged; failures show the
 * server's message and leave the parcel where it was.
 */
export function useReceiveParcel() {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const { toast } = useToast();
  const [busyId, setBusyId] = useState<string | null>(null);

  const receive = useCallback(
    async (parcel: Pick<Parcel, "id" | "taskId">): Promise<boolean> => {
      setBusyId(parcel.taskId);
      try {
        await socketClient.request("warehouse:receive", { taskId: parcel.taskId });
        toast(fr ? `${parcel.id} reçu au hub` : `${parcel.id} received at hub`);
        return true;
      } catch (e) {
        toast(errorMessage(e), "error");
        return false;
      } finally {
        setBusyId(null);
      }
    },
    [fr, toast],
  );

  return { receive, busyId };
}
