"use client";

import type { ComponentType } from "react";

/** Re-export warehouse pages under /admin/fulfillment with correct ops base path. */
export function createFulfillmentPage(Page: ComponentType) {
  function AdminFulfillmentPage() {
    return <Page />;
  }
  AdminFulfillmentPage.displayName = `Fulfillment(${Page.displayName || Page.name || "Page"})`;
  return AdminFulfillmentPage;
}
