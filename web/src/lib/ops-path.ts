"use client";

import { usePathname } from "next/navigation";

/** Base path for warehouse ops — `/warehouse` for staff, `/admin/fulfillment` for admin. */
export function useOpsBase(): string {
  const pathname = usePathname();
  if (pathname.startsWith("/admin/fulfillment")) return "/admin/fulfillment";
  return "/warehouse";
}

export function useOpsPath() {
  const base = useOpsBase();
  return (path: string) => {
    const normalized = path.startsWith("/") ? path : `/${path}`;
    return `${base}${normalized}`;
  };
}
