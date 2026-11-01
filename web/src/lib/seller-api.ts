"use client";

/**
 * Building blocks every server-backed seller page uses (one socket, no polling):
 *
 *  - `sellerRequest(event, body)`  the socket request/ack; rejects with the error text already in the portal's language.
 *  - `useLiveQuery(...)`           reads an event, re-reads (debounced) when the socket reconnects or when one of the
 *                                  listed pushes arrives, keeps the last good data on screen while reloading.
 *  - `useSocketEvent(...)`         subscribe to pushes (handler may change every render).
 *  - `assetUrl(url)`               an upload path (`/uploads/x.png`) as a full URL the browser can load.
 *  - `uploadImages(files)`         several photos at once (JPEG/PNG/WebP, 5 MB each).
 *  - `useNow(ms)`                  a clock tick for countdowns.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useRealtime } from "@/context/realtime-context";
import { socketClient } from "@/lib/realtime/socket-client";
import { authApi } from "@/lib/realtime/auth-api";
import { uploadImage } from "@/lib/seller";
import { sellerErrorText } from "@/lib/seller-errors";

/** Socket request whose rejection message is in the portal's language (see seller-errors.ts). */
export async function sellerRequest<T>(event: string, body?: unknown): Promise<T> {
  try {
    return await socketClient.request<T>(event, body);
  } catch (e) {
    throw new Error(sellerErrorText(e));
  }
}

/** The server's pagination envelope used by the new list events. */
export interface Page<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

/** Subscribe to socket pushes while the socket is connected. `handler` may be a new function every render. */
export function useSocketEvent<T = unknown>(events: string | string[], handler: (payload: T, event: string) => void) {
  const { status } = useRealtime();
  const ref = useRef(handler);
  useEffect(() => {
    ref.current = handler;
  });
  const list = Array.isArray(events) ? events.join("|") : events;
  useEffect(() => {
    if (status !== "connected") return;
    const s = socketClient.current;
    if (!s) return;
    const names = list.split("|");
    const subs = names.map((name) => {
      const fn = (p: T) => ref.current(p, name);
      s.on(name, fn);
      return [name, fn] as const;
    });
    return () => {
      for (const [name, fn] of subs) s.off(name, fn);
    };
  }, [status, list]);
}

export interface LiveQuery<T> {
  data: T | null;
  /** First read in flight (no data yet). */
  loading: boolean;
  /** A re-read is in flight (data stays on screen). */
  refreshing: boolean;
  /** The server's message (already in the portal's language) when the last read failed. */
  error: string | null;
  reload: () => Promise<void>;
  /** Replace the data locally (optimistic update / a push that carries the new row). */
  setData: (updater: (cur: T | null) => T | null) => void;
}

/**
 * Read `event` with `body` (null = do not read yet). Re-reads when `body` changes, when the socket (re)connects, and
 * (debounced 400 ms) when one of `pushes` arrives. `pick` filters pushes (return false to ignore one).
 */
export function useLiveQuery<T>(
  event: string,
  body: Record<string, unknown> | null,
  opts: { pushes?: string[]; pick?: (payload: unknown, event: string) => boolean; debounceMs?: number } = {},
): LiveQuery<T> {
  const { status } = useRealtime();
  const [data, setDataState] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bodyKey = body === null ? null : JSON.stringify(body);
  const seq = useRef(0);
  const bodyRef = useRef(body);
  useEffect(() => {
    bodyRef.current = body;
  });

  const reload = useCallback(async () => {
    if (bodyKey === null) return;
    const mine = ++seq.current;
    setRefreshing(true);
    try {
      const res = await socketClient.request<T>(event, bodyRef.current ?? {});
      if (mine !== seq.current) return;
      setDataState(res);
      setError(null);
    } catch (e) {
      if (mine !== seq.current) return;
      setError(sellerErrorText(e));
    } finally {
      if (mine === seq.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [event, bodyKey]);

  useEffect(() => {
    if (status !== "connected" || bodyKey === null) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reading from the socket is the point of this effect
    void reload();
  }, [status, bodyKey, reload]);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const pushes = opts.pushes ?? [];
  const pick = opts.pick;
  const wait = opts.debounceMs ?? 400;
  useSocketEvent(pushes, (payload, name) => {
    if (pick && !pick(payload, name)) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void reload(), wait);
  });

  const setData = useCallback((updater: (cur: T | null) => T | null) => setDataState((cur) => updater(cur)), []);
  return { data, loading: loading && data === null, refreshing, error, reload, setData };
}

/** An upload path as a loadable URL (`/uploads/a.png` -> `http://api/uploads/a.png`; absolute URLs pass through). */
export function assetUrl(url: string | null | undefined): string {
  if (!url) return "";
  if (/^(https?:|data:|blob:)/i.test(url)) return url;
  return `${authApi.apiUrl}${url.startsWith("/") ? "" : "/"}${url}`;
}

/** Upload several photos; resolves with their URLs in order and rejects with the first error (portal language). */
export async function uploadImages(files: File[]): Promise<string[]> {
  const urls: string[] = [];
  for (const f of files) {
    try {
      urls.push(await uploadImage(f));
    } catch (e) {
      throw new Error(sellerErrorText(e));
    }
  }
  return urls;
}

/** A ticking clock (ms epoch) for countdowns. */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

/**
 * "2 d 4 h", "3 h 10 min", "12 min", or the "overdue" text. `iso` is the deadline; `now` from `useNow()`.
 */
export function countdownText(iso: string | null | undefined, now: number, fr: boolean): { text: string; overdue: boolean; urgent: boolean } {
  if (!iso) return { text: "", overdue: false, urgent: false };
  const ms = new Date(iso).getTime() - now;
  if (Number.isNaN(ms)) return { text: "", overdue: false, urgent: false };
  if (ms <= 0) return { text: fr ? "Délai dépassé" : "Overdue", overdue: true, urgent: true };
  const min = Math.floor(ms / 60000);
  const d = Math.floor(min / 1440);
  const h = Math.floor((min % 1440) / 60);
  const m = min % 60;
  const parts = d > 0 ? `${d} ${fr ? "j" : "d"} ${h} h` : h > 0 ? `${h} h ${m} min` : `${Math.max(1, m)} min`;
  return { text: fr ? `Reste ${parts}` : `${parts} left`, overdue: false, urgent: ms < 6 * 3600_000 };
}
