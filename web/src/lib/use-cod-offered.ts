"use client";

import { usePublicSettings } from "@/lib/shop-live";

/** Is cash on delivery offered right now? False until the platform settings arrive, and whenever `codEnabled` is not true. */
export function useCodOffered(): boolean {
  return usePublicSettings().codEnabled;
}
