import type { AuditLogEntry, FraudAlert } from "../../../shared/types/index";

import { categories } from "./mock-data";

export const fraudAlerts: FraudAlert[] = [
  { id: "FRD-001", type: "cod_risk", severity: "high", customer: "Unknown User", orderId: "ORD-2024-990", score: 87, status: "open", date: "2024-06-08" },
  { id: "FRD-002", type: "otp_fail", severity: "medium", customer: "Patrick L.", orderId: "ORD-2024-988", score: 62, status: "reviewed", date: "2024-06-07" },
  { id: "FRD-003", type: "velocity", severity: "high", customer: "Sophie M.", score: 91, status: "blocked", date: "2024-06-07" },
  { id: "FRD-004", type: "address_block", severity: "low", customer: "Ahmed H.", orderId: "ORD-2024-985", score: 45, status: "open", date: "2024-06-06" },
];

export const auditLogs: AuditLogEntry[] = [
  { id: "AUD-001", actor: "Admin User", role: "admin", action: "APPROVE_SELLER", entity: "Seller", entityId: "SEL-003", before: "pending", after: "approved", timestamp: "2024-06-08 10:32" },
  { id: "AUD-002", actor: "Moderator", role: "admin_moderation", action: "REJECT_PRODUCT", entity: "Product", entityId: "PRD-112", before: "pending", after: "rejected", timestamp: "2024-06-08 09:15" },
  { id: "AUD-003", actor: "Finance Lead", role: "admin_finance", action: "PROCESS_PAYOUT", entity: "Payout", entityId: "PAY-441", before: "pending", after: "completed", timestamp: "2024-06-07 16:44" },
  { id: "AUD-004", actor: "Ops Manager", role: "admin_operations", action: "UPDATE_FLASH_SALE", entity: "Campaign", entityId: "CMP-01", timestamp: "2024-06-07 14:20" },
];

export const adminRoles = [
  { id: "super", name: "Super Admin", nameFr: "Super admin", permissions: ["all"] },
  { id: "operations", name: "Operations", nameFr: "Opérations", permissions: ["orders", "warehouse", "logistics"] },
  { id: "finance", name: "Finance", nameFr: "Finance", permissions: ["payouts", "refunds", "cod", "reports"] },
  { id: "support", name: "Support", nameFr: "Support", permissions: ["tickets", "customers", "returns"] },
  { id: "marketing", name: "Marketing", nameFr: "Marketing", permissions: ["campaigns", "cms", "coupons", "banners"] },
  { id: "moderation", name: "Moderation", nameFr: "Modération", permissions: ["products", "reviews", "sellers"] },
  { id: "warehouse", name: "Warehouse Admin", nameFr: "Admin entrepôt", permissions: ["inventory", "dispatch", "hubs"] },
];

export const cmsBlocks = [
  { id: "hero", type: "hero", title: "Hero Banner", titleFr: "Bannière hero", editable: true, active: true },
  { id: "categories", type: "category_grid", title: "Category Grid", titleFr: "Grille catégories", editable: true, active: true },
  { id: "flash", type: "flash_sale", title: "Flash Sale Strip", titleFr: "Bandeau vente flash", editable: true, active: true },
  { id: "trending", type: "product_carousel", title: "Trending Products", titleFr: "Produits tendance", editable: true, active: true },
  { id: "stores", type: "store_grid", title: "Top Stores", titleFr: "Meilleures boutiques", editable: true, active: false },
];

export const flashSales = [
  { id: "FS-01", name: "Summer Electronics", nameFr: "Électronique été", start: "2024-06-08", end: "2024-06-15", discount: 40, products: 24, status: "active" as const },
  { id: "FS-02", name: "Fashion Weekend", nameFr: "Week-end mode", start: "2024-06-14", end: "2024-06-16", discount: 30, products: 56, status: "scheduled" as const },
];

export const marketingCampaigns = [
  { id: "CMP-01", name: "Summer Electronics Sale", type: "flash_sale", status: "active" as const, reach: "124K", budget: 5000, channels: ["homepage", "email", "push"] },
  { id: "CMP-02", name: "New Seller Onboarding", type: "email", status: "scheduled" as const, reach: "8.2K", budget: 1200, channels: ["email"] },
  { id: "CMP-03", name: "Free Delivery Weekend", type: "banner", status: "active" as const, reach: "450K", budget: 8000, channels: ["homepage", "app"] },
];

export function getMarketingCampaign(id: string) {
  return marketingCampaigns.find((c) => c.id === id);
}

export function getFlashSale(id: string) {
  return flashSales.find((f) => f.id === id);
}

export function getCmsBlock(id: string) {
  return cmsBlocks.find((b) => b.id === id);
}

/** Map audit log entity IDs to admin detail routes */
export function getFraudAlert(id: string) {
  return fraudAlerts.find((a) => a.id === id);
}

export function getAdminRole(id: string) {
  return adminRoles.find((r) => r.id === id);
}

export function getCategory(id: number) {
  return categories.find((c) => c.id === id);
}

export const adminFinanceTransactions = [
  { id: "TXN-901", type: "Order Payment", amount: 119900, status: "completed" as const, date: "2024-06-08", orderId: "ORD-2024-001", reference: "Stripe capture" },
  { id: "TXN-902", type: "Seller Payout", amount: -45000, status: "completed" as const, date: "2024-06-08", payoutId: "PAY-001", reference: "TechZone Store" },
  { id: "TXN-903", type: "Refund", amount: -12900, status: "pending" as const, date: "2024-06-07", orderId: "ORD-2024-003", reference: "REF-002" },
  { id: "TXN-904", type: "COD Settlement", amount: 89000, status: "completed" as const, date: "2024-06-07", codId: "COD-001", reference: "Morning shift" },
];

export function getAdminFinanceTransaction(id: string) {
  return adminFinanceTransactions.find((t) => t.id === id);
}

export function getAuditLog(id: string) {
  return auditLogs.find((l) => l.id === id);
}

export function resolveAuditEntityHref(entity: string, entityId: string): string | null {
  const e = entity.toLowerCase();
  if (e === "seller") {
    const num = entityId.replace(/\D/g, "");
    return num ? `/admin/sellers/${Number(num)}` : null;
  }
  if (e === "product") {
    const num = entityId.replace(/\D/g, "");
    return num ? `/admin/products/${num}` : null;
  }
  if (e === "payout") return `/admin/payouts/${entityId}`;
  if (e === "campaign") return `/admin/marketing/${entityId}`;
  if (e === "order") return `/admin/orders/${entityId}`;
  if (e === "customer") return `/admin/customers/${entityId}`;
  if (e === "refund") return `/admin/refunds/${entityId}`;
  if (e === "fraud" || e === "alert") return `/admin/fraud/${entityId}`;
  return null;
}
