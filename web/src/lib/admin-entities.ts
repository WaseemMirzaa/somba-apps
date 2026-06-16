import type { AuditLogEntry, FraudAlert } from "../../../shared/types/index";

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
  { id: "super", name: "Super Admin", permissions: ["all"] },
  { id: "operations", name: "Operations", permissions: ["orders", "warehouse", "logistics"] },
  { id: "finance", name: "Finance", permissions: ["payouts", "refunds", "cod", "reports"] },
  { id: "support", name: "Support", permissions: ["tickets", "customers", "returns"] },
  { id: "marketing", name: "Marketing", permissions: ["campaigns", "cms", "coupons", "banners"] },
  { id: "moderation", name: "Moderation", permissions: ["products", "reviews", "sellers"] },
  { id: "warehouse", name: "Warehouse Admin", permissions: ["inventory", "dispatch", "hubs"] },
];

export const cmsBlocks = [
  { id: "hero", type: "hero", title: "Hero Banner", editable: true, active: true },
  { id: "categories", type: "category_grid", title: "Category Grid", editable: true, active: true },
  { id: "flash", type: "flash_sale", title: "Flash Sale Strip", editable: true, active: true },
  { id: "trending", type: "product_carousel", title: "Trending Products", editable: true, active: true },
  { id: "stores", type: "store_grid", title: "Top Stores", editable: true, active: false },
];

export const flashSales = [
  { id: "FS-01", name: "Summer Electronics", nameFr: "Électronique d'été", start: "2024-06-08", end: "2024-06-15", discount: 40, products: 24, status: "active" },
  { id: "FS-02", name: "Fashion Weekend", nameFr: "Week-end mode", start: "2024-06-14", end: "2024-06-16", discount: 30, products: 56, status: "scheduled" },
];

export type AdminPayoutStatus = "requested" | "approved" | "rejected" | "paid";

export type AdminPayoutEntity = {
  id: string;
  sellerId: number;
  seller: string;
  amount: number;
  method: string;
  status: AdminPayoutStatus;
  requestedAt: string;
  bankAccount: string;
};

export const adminPayoutEntities: AdminPayoutEntity[] = [
  { id: "PAY-001", sellerId: 3, seller: "TechZone Store", amount: 2450, method: "Bank Transfer", status: "requested", requestedAt: "2024-06-07", bankAccount: "****4521" },
  { id: "PAY-002", sellerId: 4, seller: "HomeEssentials", amount: 890, method: "Bank Transfer", status: "requested", requestedAt: "2024-06-08", bankAccount: "****8832" },
  { id: "PAY-003", sellerId: 3, seller: "TechZone Store", amount: 12000, method: "Bank Transfer", status: "paid", requestedAt: "2024-05-01", bankAccount: "****4521" },
  { id: "PAY-004", sellerId: 4, seller: "HomeEssentials", amount: 3200, method: "Mobile Money", status: "approved", requestedAt: "2024-06-05", bankAccount: "****8832" },
  { id: "PAY-005", sellerId: 3, seller: "TechZone Store", amount: 450, method: "Bank Transfer", status: "rejected", requestedAt: "2024-06-03", bankAccount: "****4521" },
];

export type WarehouseStaffRole = "operator" | "manager" | "supervisor";
export type WarehouseStaffStatus = "active" | "inactive";

export type WarehouseStaffMember = {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: WarehouseStaffRole;
  warehouseId: string;
  status: WarehouseStaffStatus;
  createdAt: string;
};

export const WAREHOUSE_STAFF_ROLE_LABELS: Record<WarehouseStaffRole, string> = {
  operator: "Operator",
  manager: "Manager",
  supervisor: "Supervisor",
};

export const INITIAL_WAREHOUSE_STAFF: WarehouseStaffMember[] = [
  {
    id: "WHS-001",
    name: "Sophie Laurent",
    email: "sophie.laurent@somba.com",
    phone: "+33 6 12 34 56 78",
    role: "operator",
    warehouseId: "WH-PAR",
    status: "active",
    createdAt: "2024-03-01",
  },
  {
    id: "WHS-002",
    name: "Marc Dupont",
    email: "marc.dupont@somba.com",
    phone: "+33 6 98 76 54 32",
    role: "supervisor",
    warehouseId: "WH-PAR",
    status: "active",
    createdAt: "2024-02-15",
  },
  {
    id: "WHS-003",
    name: "Fatou Diallo",
    email: "fatou.diallo@somba.com",
    phone: "+225 07 12 34 56",
    role: "manager",
    warehouseId: "WH-ABJ",
    status: "active",
    createdAt: "2024-04-10",
  },
  {
    id: "WHS-004",
    name: "Thomas Moreau",
    email: "thomas.moreau@somba.com",
    phone: "+33 6 55 44 33 22",
    role: "operator",
    warehouseId: "WH-LYO",
    status: "active",
    createdAt: "2024-05-20",
  },
  {
    id: "WHS-005",
    name: "Grace Mbuyi",
    email: "grace.mbuyi@somba.com",
    phone: "+243 81 234 5678",
    role: "operator",
    warehouseId: "WH-KIN",
    status: "inactive",
    createdAt: "2024-01-20",
  },
];

export function warehouseStaffPersonaId(staffId: string): string {
  return `wh-staff-${staffId.toLowerCase()}`;
}
