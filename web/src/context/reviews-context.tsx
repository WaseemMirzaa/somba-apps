"use client";

import { createContext, useContext, useState, useCallback, useEffect } from "react";

/** Runtime review interactions — seller replies and seller-submitted reports.
 *  Replies are shown to customers; reports surface in admin moderation.
 *  Persisted to localStorage. */

export type ReviewReply = { text: string; at: string };

export type SellerReport = {
  id: string;
  reviewId: number;
  product: string;
  reporter: string;
  reason: string;
  reasonFr?: string;
  date: string;
  status: "open" | "resolved" | "dismissed";
};

type ReviewsContextType = {
  replies: Record<number, ReviewReply>;
  reports: SellerReport[];
  getReply: (reviewId: number) => ReviewReply | undefined;
  addReply: (reviewId: number, text: string) => void;
  reportReview: (input: { reviewId: number; product: string; reporter: string; reason: string; reasonFr?: string }) => void;
  setReportStatus: (id: string, status: SellerReport["status"]) => void;
};

const ReviewsContext = createContext<ReviewsContextType | null>(null);
const STORAGE_KEY = "somba-reviews";

export function ReviewsProvider({ children }: { children: React.ReactNode }) {
  const [replies, setReplies] = useState<Record<number, ReviewReply>>({});
  const [reports, setReports] = useState<SellerReport[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate persisted state from localStorage after mount (SSR-safe; a lazy initializer would cause a hydration mismatch)
        setReplies(parsed.replies ?? {});
        setReports(parsed.reports ?? []);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const save = useCallback((nextReplies: Record<number, ReviewReply>, nextReports: SellerReport[]) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ replies: nextReplies, reports: nextReports }));
    } catch {
      /* ignore */
    }
  }, []);

  const getReply = useCallback((reviewId: number) => replies[reviewId], [replies]);

  const addReply = useCallback(
    (reviewId: number, text: string) => {
      setReplies((prev) => {
        const next = { ...prev, [reviewId]: { text, at: new Date().toISOString() } };
        save(next, reports);
        return next;
      });
    },
    [save, reports]
  );

  const reportReview = useCallback(
    (input: { reviewId: number; product: string; reporter: string; reason: string; reasonFr?: string }) => {
      setReports((prev) => {
        if (prev.some((r) => r.reviewId === input.reviewId && r.status === "open")) return prev;
        const report: SellerReport = {
          id: `SR-${Date.now().toString().slice(-5)}`,
          reviewId: input.reviewId,
          product: input.product,
          reporter: input.reporter,
          reason: input.reason,
          reasonFr: input.reasonFr,
          date: new Date().toISOString().slice(0, 10),
          status: "open",
        };
        const next = [report, ...prev];
        save(replies, next);
        return next;
      });
    },
    [save, replies]
  );

  const setReportStatus = useCallback(
    (id: string, status: SellerReport["status"]) => {
      setReports((prev) => {
        const next = prev.map((r) => (r.id === id ? { ...r, status } : r));
        save(replies, next);
        return next;
      });
    },
    [save, replies]
  );

  return (
    <ReviewsContext.Provider value={{ replies, reports, getReply, addReply, reportReview, setReportStatus }}>
      {children}
    </ReviewsContext.Provider>
  );
}

export function useReviews() {
  const ctx = useContext(ReviewsContext);
  if (!ctx) throw new Error("useReviews must be used within ReviewsProvider");
  return ctx;
}
