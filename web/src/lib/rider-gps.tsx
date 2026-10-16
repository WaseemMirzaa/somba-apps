"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { socketClient } from "@/lib/realtime/socket-client";
import { useRiderData } from "@/lib/rider";

/**
 * Live location sharing for riders on the web. While a task is picked up or on
 * the way, the browser position is sent with `delivery:location {taskId, lat,
 * lng}` at most every 4 seconds per task. Browsers only share location after
 * the rider allows it, so sharing starts from a visible button (or
 * automatically when permission was already granted).
 */

export type GpsState =
  | "idle" // nothing to share right now
  | "needs_permission" // there is an active task but the rider has not allowed GPS yet
  | "starting"
  | "tracking"
  | "denied"
  | "unavailable"
  | "unsupported";

interface GpsValue {
  state: GpsState;
  /** Number of active tasks the position is being sent for. */
  sharingFor: number;
  lastSentAt: number | null;
  accuracy: number | null;
  error: string | null;
  start: () => void;
}

const GpsContext = createContext<GpsValue | null>(null);
const MIN_INTERVAL_MS = 4000;

export function RiderGpsProvider({ children }: { children: React.ReactNode }) {
  const { mine } = useRiderData();
  const activeIds = useMemo(
    () => mine.filter((t) => t.status === "picked_up" || t.status === "in_transit").map((t) => t.id),
    [mine],
  );
  const activeKey = activeIds.join("|");
  const activeRef = useRef<string[]>(activeIds);
  const lastSent = useRef<Map<string, number>>(new Map());
  const watchId = useRef<number | null>(null);

  const [wanted, setWanted] = useState(false); // rider pressed the button (or permission already granted)
  const [state, setState] = useState<GpsState>("idle");
  const [lastSentAt, setLastSentAt] = useState<number | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    activeRef.current = activeIds;
  }, [activeIds]);

  const stop = useCallback(() => {
    if (watchId.current != null && typeof navigator !== "undefined" && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchId.current);
    }
    watchId.current = null;
  }, []);

  const begin = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setState("unsupported");
      return;
    }
    if (watchId.current != null) return;
    setState("starting");
    watchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        setState("tracking");
        setAccuracy(pos.coords.accuracy ?? null);
        const now = Date.now();
        for (const taskId of activeRef.current) {
          const last = lastSent.current.get(taskId) ?? 0;
          if (now - last < MIN_INTERVAL_MS) continue;
          lastSent.current.set(taskId, now);
          socketClient
            .request("delivery:location", { taskId, lat: pos.coords.latitude, lng: pos.coords.longitude })
            .then(() => {
              setLastSentAt(Date.now());
              setError(null);
            })
            .catch((e: unknown) => setError(e instanceof Error ? e.message : "Could not send location."));
        }
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          stop();
          setWanted(false);
          setState("denied");
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          setState("unavailable");
          setError(err.message);
        } else {
          // timeout: keep watching, the next fix will clear it
          setError(err.message);
        }
      },
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 },
    );
  }, [stop]);

  // Auto-start when the browser already granted permission.
  useEffect(() => {
    if (activeIds.length === 0 || wanted || typeof navigator === "undefined" || !navigator.permissions?.query) return;
    let alive = true;
    navigator.permissions
      .query({ name: "geolocation" as PermissionName })
      .then((p) => {
        if (!alive) return;
        if (p.state === "granted") setWanted(true);
        else if (p.state === "denied") setState("denied");
      })
      .catch(() => {
        /* Permissions API not available: rely on the button */
      });
    return () => {
      alive = false;
    };
  }, [activeKey, activeIds.length, wanted]);

  // Run the watch only while there is something to share.
  useEffect(() => {
    if (activeIds.length === 0) {
      stop();
      setState((s) => (s === "denied" || s === "unsupported" ? s : "idle"));
      return;
    }
    if (wanted) {
      begin();
    } else {
      setState((s) => (s === "idle" ? "needs_permission" : s));
    }
    return () => {
      /* the watch is stopped when tasks end or the provider unmounts */
    };
  }, [activeKey, activeIds.length, wanted, begin, stop]);

  useEffect(() => stop, [stop]);

  const start = useCallback(() => {
    setError(null);
    setWanted(true);
    // Calling begin() inside the click keeps the permission prompt tied to the user gesture.
    begin();
  }, [begin]);

  const value = useMemo<GpsValue>(
    () => ({ state, sharingFor: activeIds.length, lastSentAt, accuracy, error, start }),
    [state, activeIds.length, lastSentAt, accuracy, error, start],
  );

  return <GpsContext.Provider value={value}>{children}</GpsContext.Provider>;
}

export function useRiderGps(): GpsValue {
  const ctx = useContext(GpsContext);
  if (!ctx) {
    return { state: "idle", sharingFor: 0, lastSentAt: null, accuracy: null, error: null, start: () => {} };
  }
  return ctx;
}
