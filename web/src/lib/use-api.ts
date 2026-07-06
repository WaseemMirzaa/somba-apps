"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "./api";

type State<T> = {
  /** Live data from the API, or null when the API is unavailable. */
  data: T | null;
  loading: boolean;
  /** True once a live response has been received (use to swap mock → live). */
  live: boolean;
  error: string | null;
  reload: () => void;
};

/**
 * Fetch a resource from the API, upgrading a page from mock → live data.
 * Fails soft: on any error `data` stays null and the caller renders its mock.
 */
export function useApiResource<T>(path: string, role = "admin", enabled = true): State<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [live, setLive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setLoading(true);
    api
      .get<T>(path, role)
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setLive(true);
        setError(null);
      })
      .catch((e) => {
        if (cancelled) return;
        setLive(false);
        setError(e?.message || "API unavailable");
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [path, role, enabled, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { data, loading, live, error, reload };
}

/** Run a mutation (POST/PATCH/DELETE) with a busy flag. */
export function useApiAction() {
  const [busy, setBusy] = useState<string | null>(null);
  const run = useCallback(async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    try {
      return await fn();
    } finally {
      setBusy(null);
    }
  }, []);
  return { busy, run };
}
