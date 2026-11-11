"use client";

import { useEffect } from "react";

/**
 * The browser-tab title of a portal page, in the page language. The root layout's static metadata is English only (and
 * says "Shop, sell and deliver" on every portal page), so each portal layout sets `document.title` itself:
 * "<page> · <portal> · KOMORIKO".
 */
export function usePortalTitle(page: string | null | undefined, portal: string) {
  useEffect(() => {
    const title = [page, portal, "KOMORIKO"].filter(Boolean).join(" · ");
    const apply = () => {
      if (document.title !== title) document.title = title;
    };
    apply();
    // Next re-applies the root layout's title when the route changes: put ours back (it only writes when different).
    const watcher = new MutationObserver(apply);
    watcher.observe(document.head, { childList: true, subtree: true, characterData: true });
    return () => watcher.disconnect();
  }, [page, portal]);
}
