"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRealtime } from "@/context/realtime-context";
import { socketClient } from "@/lib/realtime/socket-client";
import { applyRunPush, isActiveRun, mineOnly, parcelsOfRun, parseRun, parseRuns, runOnRoad, type RiderRun, type RunParcel } from "@/lib/rider-runs";

/**
 * The driver's transfer runs, live (docs/contracts/areas.md, UC-11): `rider:runs` lists the runs assigned to this rider (open
 * ones, and those closed in the last 3 days) and `run:updated` pushes every change (assigned, dispatched, on the road, scanned
 * in, closed). "On the road" is `rider:runStatus { runId, status: 'in_transit' }`. A server without runs simply has none.
 * `tasks` are the rider's own tasks (`useRiderData().mine`): the parcels of each run come from there.
 */
export function useRiderRuns<T extends RunParcel>(tasks: T[]) {
  const rt = useRealtime();
  const myId = rt.user?.id ?? null;
  const ready = rt.status === "connected" && rt.user?.role === "rider";
  const [runs, setRuns] = useState<RiderRun[]>([]);
  const [loaded, setLoaded] = useState(false);
  // Runs this driver put on the road here, kept only until the server's own state says so (`inTransit`): a fallback for a
  // server whose answer does not carry the flag.
  const [remembered, setRemembered] = useState<ReadonlySet<string>>(() => new Set());

  const refresh = useCallback(async () => {
    try {
      const mine = mineOnly(parseRuns(await socketClient.request("rider:runs")), myId);
      setRuns(mine);
      setRemembered((cur) => new Set([...cur].filter((id) => mine.some((r) => r.id === id && r.status !== "closed" && !r.inTransit))));
    } catch {
      /* an older server has no runs: the rider just sees their tasks */
    } finally {
      setLoaded(true);
    }
  }, [myId]);

  useEffect(() => {
    if (!ready) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial load of an external resource
    void refresh();
    const s = socketClient.current;
    const onPush = (d: unknown) => setRuns((cur) => applyRunPush(cur, d, myId));
    s?.on("run:updated", onPush);
    return () => {
      s?.off("run:updated", onPush);
    };
  }, [ready, myId, refresh]);

  /** "On the road" for the whole run; the server replies with the run. Throws what the server refuses with. */
  const markOnRoad = useCallback(
    async (runId: string) => {
      const res = await socketClient.request<unknown>("rider:runStatus", { runId, status: "in_transit" });
      const run = parseRun(res);
      // An answer without the flag (older server): remember it here until a later read says so.
      if (!run || !run.inTransit) setRemembered((cur) => new Set(cur).add(runId));
      if (run) setRuns((cur) => applyRunPush(cur, res, myId));
    },
    [myId],
  );

  return useMemo(() => {
    const parcelsOf = (run: RiderRun) => parcelsOfRun(run, tasks);
    const onRoad = (run: RiderRun) => runOnRoad(run, parcelsOf(run), remembered);
    return {
      runs,
      activeRuns: runs.filter(isActiveRun),
      finishedRuns: runs.filter((r) => !isActiveRun(r)),
      loaded,
      parcelsOf,
      onRoad,
      markOnRoad,
      refresh,
    };
  }, [runs, tasks, remembered, loaded, markOnRoad, refresh]);
}
