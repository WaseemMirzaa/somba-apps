"use client";

import { useMemo } from "react";
import { socketClient } from "@/lib/realtime/socket-client";
import { pickL, type Run, type RunProposal, type RunStatus, type TaskView } from "@/lib/logistics";
import { useDeskQueue, useHubScope, type DeskTask } from "@/lib/warehouse";
import { useOpsQuery } from "@/lib/warehouse-live";

/**
 * Transfer runs (docs/contracts/areas.md, UC-11): one trip, many parcels, from one warehouse to the next.
 * Reads refresh on `run:updated` (both warehouses and the run's driver get it) and on `task:updated`.
 */

type L = { en: string; fr: string };

export const RUN_STATUS: Record<RunStatus, L> = {
  planned: { en: "Planned", fr: "Planifiée" },
  dispatched: { en: "On the road", fr: "En route" },
  arrived: { en: "Arrived", fr: "Arrivée" },
  closed: { en: "Closed", fr: "Clôturée" },
};

/**
 * The run's status in words. A dispatched run is "On the road" once the driver reported it (`inTransit`); until then it
 * has only left the warehouse. An old server does not send `inTransit`: the run then reads "On the road" as before.
 */
export function runStatusLabel(run: Pick<Run, "status" | "inTransit">, fr: boolean): string {
  if (run.status === "dispatched" && run.inTransit === false) return fr ? "Partie, pas encore en route" : "Left, not on the road yet";
  return pickL(RUN_STATUS[run.status], fr);
}

export function runStatusVariant(s: string): "success" | "warning" | "info" | "danger" | "default" {
  switch (s) {
    case "planned":
      return "warning";
    case "dispatched":
      return "info";
    case "arrived":
      return "info";
    case "closed":
      return "success";
    default:
      return "default";
  }
}

/** "Run TR-0042 · hop 1/2" / "Tournée TR-0042 · étape 1/2": the badge a transfer leg wears on the desk. */
export function runBadgeText(t: Pick<TaskView, "runReference" | "hop" | "hops">, fr: boolean): string | null {
  const parts: string[] = [];
  if (t.runReference) parts.push(`${fr ? "Tournée" : "Run"} ${t.runReference}`);
  if (t.hops && t.hops > 1 && t.hop) parts.push(`${fr ? "étape" : "hop"} ${t.hop}/${t.hops}`);
  return parts.length ? parts.join(" · ") : null;
}

export const runActions = {
  /** `fromHubId` is only for admins (staff create runs for their own warehouse). */
  create: (toHubId: string, taskIds: string[], fromHubId?: string) => socketClient.request<Run>("logistics:createRun", { toHubId, taskIds, ...(fromHubId ? { fromHubId } : {}) }),
  update: (runId: string, change: { addTaskIds?: string[]; removeTaskIds?: string[] }) => socketClient.request<Run>("logistics:updateRun", { runId, ...change }),
  /** Moves the chosen parcels into a new run on the same lane (planned runs only); each run then gets its own driver. */
  split: (runId: string, taskIds: string[]) => socketClient.request<{ original: Run; created: Run }>("logistics:splitRun", { runId, taskIds }),
  assign: (runId: string, riderId: string) => socketClient.request<Run>("logistics:assignRun", { runId, riderId }),
  dispatch: (runId: string) => socketClient.request<Run>("logistics:dispatchRun", { runId }),
  receive: (runId: string, taskIds?: string[]) => socketClient.request<Run>("logistics:receiveRun", { runId, ...(taskIds ? { taskIds } : {}) }),
  close: (runId: string) => socketClient.request<Run>("logistics:closeRun", { runId }),
};

/** The runs of my warehouse: leaving (`out`) or arriving (`in`); `open` hides the closed ones. */
export function useRuns(direction: "out" | "in", opts: { includeClosed?: boolean } = {}) {
  const { hubId } = useHubScope();
  return useOpsQuery<Run[]>("logistics:runs", {
    initial: [] as Run[],
    body: { direction, ...(opts.includeClosed ? {} : { status: "open" }), ...(hubId ? { hubId } : {}) },
    push: ["run:updated", "task:updated"],
  });
}

/** Transfer legs waiting at my warehouse for the next one, grouped by that next warehouse. */
export function useRunProposals() {
  const { hubId } = useHubScope();
  return useOpsQuery<RunProposal[]>("logistics:runProposals", {
    initial: [] as RunProposal[],
    body: hubId ? { hubId } : {},
    push: ["run:updated", "task:updated"],
  });
}

/** The parcels the desk knows about by leg id (to name the taskIds a run or a proposal carries). */
export function useParcelLookup() {
  const q = useDeskQueue({ status: "open" });
  const byId = useMemo(() => new Map<string, DeskTask>(q.tasks.map((t) => [t.id, t])), [q.tasks]);
  return { byId, tasks: q.tasks, reload: q.reload };
}
