"use client";

import { useCallback } from "react";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";
import type { TaskView } from "@/lib/logistics";
import { parcelErrorWithHint } from "@/lib/parcel-errors";
import { staffScanText } from "@/lib/parcel-scan";
import { deskActions } from "@/lib/warehouse";
import { errorMessage } from "@/lib/warehouse-live";

/**
 * Scan one box code at the desk: `in` = a box arriving (`logistics:scanIn { code }`), `out` = a box leaving
 * (`logistics:dispatchTransfer { code }`). Tells the person what happened (result line + toast) and never throws.
 * `onDone` gets the leg the server answered, so the lists can refresh.
 */
export function useBoxScan(mode: "in" | "out", onDone?: (task: TaskView) => void) {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const { toast } = useToast();
  return useCallback(
    async (code: string, manual: boolean): Promise<{ ok: boolean; text: string }> => {
      try {
        const r = mode === "in" ? await deskActions.scanInCode(code, manual) : await deskActions.scanOutCode(code, manual);
        const task = mode === "in" ? (r as Awaited<ReturnType<typeof deskActions.scanInCode>>).task : (r as TaskView);
        const text = staffScanText({ code, completed: r.completed, parcels: r.checklist?.parcels }, mode, fr);
        toast(text);
        onDone?.(task);
        return { ok: true, text };
      } catch (e) {
        const text = parcelErrorWithHint(errorMessage(e), fr);
        toast(text, "error");
        return { ok: false, text };
      }
    },
    [mode, fr, toast, onDone],
  );
}
