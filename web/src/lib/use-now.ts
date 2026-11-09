"use client";

import { useEffect, useState } from "react";

/** The longest a timer may wait (setTimeout overflows past about 24.8 days). */
const MAX_WAIT = 2_000_000_000;

/**
 * The current time that refreshes itself when `until` (an ISO time, for example the end of a lock) changes and once more when it
 * passes, so a badge that depends on it clears by itself without a push. With no `until` nothing is scheduled.
 */
export function useNow(until?: string | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a new `until` is judged against the real clock
    setNow(Date.now());
    if (!until) return;
    const end = new Date(until).getTime();
    if (Number.isNaN(end)) return;
    const wait = end - Date.now();
    if (wait <= 0) return;
    const id = setTimeout(() => setNow(Date.now()), Math.min(wait + 250, MAX_WAIT));
    return () => clearTimeout(id);
  }, [until]);
  return now;
}
