export type NotificationItem = {
  id: string;
  userId: string;
  portal: "customer" | "seller" | "rider" | "warehouse" | "admin";
  type: string;
  title: string;
  titleFr: string;
  body: string;
  bodyFr: string;
  href?: string;
  read: boolean;
  createdAt: string;
};

export type DisputeItem = {
  id: string;
  orderId: string;
  buyerId: string;
  buyerName: string;
  sellerId: number;
  sellerName: string;
  status: "open" | "seller_responded" | "resolved" | "closed";
  reason: string;
  description: string;
  createdAt: string;
  messages: { from: "buyer" | "seller" | "admin"; text: string; at: string }[];
};

export type ReturnItem = {
  id: string;
  orderId: string;
  status: "requested" | "approved" | "in_transit" | "received" | "refunded" | "rejected";
  items: string[];
  reason: string;
  createdAt: string;
  refundAmount?: number;
  timeline?: { time: string; label: string; done?: boolean }[];
};

export type SupportTicket = {
  id: string;
  subject: string;
  orderId?: string;
  customer: string;
  sellerName?: string;
  portal: "customer" | "seller" | "admin";
  priority: "low" | "medium" | "high";
  status: "open" | "in_progress" | "resolved";
  createdAt: string;
  lastUpdate: string;
  messages: { author: string; role: "customer" | "seller" | "agent"; text: string; at: string }[];
};

export type RefundRequest = {
  id: string;
  orderId: string;
  amount: number;
  method: string;
  reason: string;
  status: "pending" | "approved" | "rejected";
  customerName?: string;
};

export type WalletTransaction = {
  id: string;
  type: "cashback" | "debit" | "topup" | "refund" | "withdrawal";
  amount: number;
  desc: string;
  date: string;
  orderId?: string;
  returnId?: string;
  method?: string;
  balanceAfter: number;
};

export type AdminPayoutRequest = {
  id: string;
  seller: string;
  sellerId: number;
  amount: number;
  status: "requested" | "approved" | "rejected";
  requestedAt: string;
  bankAccount?: string;
};

export type PromoCode = {
  code: string;
  label: string;
  labelFr: string;
  type: "percent" | "fixed";
  value: number;
  minOrder?: number;
};

export const MOCK_PROMOS: PromoCode[] = [
  { code: "SOMBA10", label: "10% off", labelFr: "10% de réduction", type: "percent", value: 10, minOrder: 50 },
  { code: "SAVE20", label: "$20 off", labelFr: "20$ de réduction", type: "fixed", value: 20, minOrder: 100 },
];

export const MOCK_NOTIFICATIONS: NotificationItem[] = [
  {
    id: "N-001",
    userId: "customer",
    portal: "customer",
    type: "order_shipped",
    title: "Your order is on the way",
    titleFr: "Votre commande est en route",
    body: "ORD-2024-001 has been dispatched.",
    bodyFr: "ORD-2024-001 a été expédiée.",
    href: "/shop/orders/ORD-2024-001/tracking",
    read: false,
    createdAt: "2026-06-08T10:00:00Z",
  },
  {
    id: "N-002",
    userId: "customer",
    portal: "customer",
    type: "promo",
    title: "Flash sale starts now",
    titleFr: "Vente flash en cours",
    body: "Up to 40% off electronics.",
    bodyFr: "Jusqu'à 40% sur l'électronique.",
    href: "/shop/deals",
    read: true,
    createdAt: "2026-06-07T14:00:00Z",
  },
  {
    id: "N-003",
    userId: "seller",
    portal: "seller",
    type: "new_order",
    title: "New order received",
    titleFr: "Nouvelle commande",
    body: "ORD-2024-006 needs fulfilment.",
    bodyFr: "ORD-2024-006 à traiter.",
    href: "/seller/orders/ORD-2024-006",
    read: false,
    createdAt: "2026-06-08T09:30:00Z",
  },
  {
    id: "N-004",
    userId: "rider",
    portal: "rider",
    type: "task_assigned",
    title: "New delivery task",
    titleFr: "Nouvelle livraison",
    body: "Batch B-042 assigned to you.",
    bodyFr: "Lot B-042 vous est assigné.",
    href: "/rider/tasks",
    read: false,
    createdAt: "2026-06-08T08:00:00Z",
  },
];

export const MOCK_DISPUTES: DisputeItem[] = [
  {
    id: "DSP-001",
    orderId: "ORD-2024-003",
    buyerId: "cust-1",
    buyerName: "Marie Dupont",
    sellerId: 2,
    sellerName: "SportStyle",
    status: "open",
    reason: "not_as_described",
    description: "Shoes colour does not match listing photos.",
    createdAt: "2026-06-05",
    messages: [
      { from: "buyer", text: "The white shoes arrived grey.", at: "2026-06-05T10:00:00Z" },
    ],
  },
  {
    id: "DSP-002",
    orderId: "ORD-2024-002",
    buyerId: "cust-2",
    buyerName: "Jean Kabila",
    sellerId: 1,
    sellerName: "TechZone Store",
    status: "seller_responded",
    reason: "defective",
    description: "Headphones left speaker crackling.",
    createdAt: "2026-06-03",
    messages: [
      { from: "buyer", text: "Left speaker has static noise.", at: "2026-06-03T12:00:00Z" },
      { from: "seller", text: "We can offer replacement or full refund.", at: "2026-06-04T09:00:00Z" },
    ],
  },
];

export const MOCK_RETURNS: ReturnItem[] = [
  {
    id: "RET-001",
    orderId: "ORD-2024-001",
    status: "approved",
    items: ["Samsung Galaxy S24 Ultra"],
    reason: "Defective or damaged item",
    createdAt: "2026-06-01",
    refundAmount: 1199,
    timeline: [
      { time: "2026-06-01", label: "Return requested", done: true },
      { time: "2026-06-02", label: "Approved — pickup scheduled", done: true },
      { time: "2026-06-04", label: "Pickup completed", done: false },
    ],
  },
  {
    id: "RET-002",
    orderId: "ORD-2024-004",
    status: "requested",
    items: ["Nike Air Max 270"],
    reason: "Wrong item received",
    createdAt: "2026-06-07",
    timeline: [
      { time: "2026-06-07", label: "Return requested", done: true },
      { time: "Pending", label: "Seller review", done: false },
    ],
  },
];

export const MOCK_SUPPORT_TICKETS: SupportTicket[] = [
  {
    id: "TKT-441",
    subject: "Order not delivered",
    orderId: "ORD-2024-8841",
    customer: "Marie Kabila",
    portal: "customer",
    priority: "high",
    status: "open",
    createdAt: "2024-06-08",
    lastUpdate: "2024-06-08",
    messages: [
      { author: "Marie Kabila", role: "customer", text: "My order shows delivered but I never received it.", at: "2024-06-08T09:00:00Z" },
    ],
  },
  {
    id: "TKT-440",
    subject: "Refund delay",
    orderId: "ORD-2024-003",
    customer: "Patrick Lumumba",
    portal: "customer",
    priority: "medium",
    status: "in_progress",
    createdAt: "2024-06-07",
    lastUpdate: "2024-06-07",
    messages: [
      { author: "Patrick Lumumba", role: "customer", text: "Return approved 5 days ago, no refund yet.", at: "2024-06-07T10:00:00Z" },
      { author: "Support Agent", role: "agent", text: "Refund is queued — expect 24–48h.", at: "2024-06-07T14:00:00Z" },
    ],
  },
  {
    id: "TKT-001",
    subject: "Payout delay inquiry",
    sellerName: "TechZone Store",
    portal: "seller",
    priority: "high",
    status: "open",
    customer: "TechZone Store",
    createdAt: "2024-06-05",
    lastUpdate: "2024-06-05",
    messages: [
      { author: "TechZone Store", role: "seller", text: "Payout delay inquiry — please advise on next steps.", at: "2024-06-05T08:00:00Z" },
    ],
  },
  {
    id: "TKT-002",
    subject: "Moderation question",
    sellerName: "TechZone Store",
    portal: "seller",
    priority: "medium",
    status: "resolved",
    customer: "TechZone Store",
    createdAt: "2024-06-03",
    lastUpdate: "2024-06-03",
    messages: [
      { author: "TechZone Store", role: "seller", text: "When will my new listing be reviewed?", at: "2024-06-03T10:00:00Z" },
      { author: "Support Agent", role: "agent", text: "Approved within 24h.", at: "2024-06-03T16:00:00Z" },
    ],
  },
  {
    id: "TKT-003",
    subject: "Rider pickup delay",
    sellerName: "TechZone Store",
    portal: "seller",
    priority: "low",
    status: "open",
    customer: "TechZone Store",
    createdAt: "2024-06-06",
    lastUpdate: "2024-06-06",
    messages: [
      { author: "TechZone Store", role: "seller", text: "Rider did not arrive for ORD-2024-006 pickup.", at: "2024-06-06T09:00:00Z" },
    ],
  },
  {
    id: "TKT-439",
    subject: "Seller verification",
    customer: "TechZone Store",
    sellerName: "TechZone Store",
    portal: "seller",
    priority: "low",
    status: "resolved",
    createdAt: "2024-06-06",
    lastUpdate: "2024-06-06",
    messages: [
      { author: "TechZone Store", role: "seller", text: "Documents resubmitted for KYC review.", at: "2024-06-06T08:00:00Z" },
      { author: "Support Agent", role: "agent", text: "Account verified.", at: "2024-06-06T16:00:00Z" },
    ],
  },
  {
    id: "TKT-438",
    subject: "Payment failed",
    orderId: "ORD-2024-002",
    customer: "Sophie Mbuyi",
    portal: "customer",
    priority: "high",
    status: "open",
    createdAt: "2024-06-06",
    lastUpdate: "2024-06-06",
    messages: [
      { author: "Sophie Mbuyi", role: "customer", text: "Card charged twice at checkout.", at: "2024-06-06T11:00:00Z" },
    ],
  },
];

export const MOCK_REFUNDS: RefundRequest[] = [
  { id: "REF-001", orderId: "ORD-2024-001", amount: 1199, method: "stripe", reason: "Return approved", status: "pending", customerName: "Marie Kabila" },
  { id: "REF-002", orderId: "ORD-2024-003", amount: 129, method: "manual", reason: "COD refund via Airtel", status: "pending", customerName: "Patrick Lumumba" },
];

export const MOCK_WALLET_TRANSACTIONS: WalletTransaction[] = [
  { id: "WTX-01", type: "cashback", amount: 12, desc: "Order ORD-2024-881 cashback", date: "08/06/2024", orderId: "ORD-2024-881", balanceAfter: 142.5 },
  { id: "WTX-02", type: "debit", amount: -49, desc: "Checkout payment", date: "07/06/2024", orderId: "ORD-2024-002", method: "wallet", balanceAfter: 130.5 },
  { id: "WTX-03", type: "topup", amount: 100, desc: "Airtel Money top-up", date: "05/06/2024", method: "airtel", balanceAfter: 179.5 },
  { id: "WTX-04", type: "refund", amount: 29, desc: "Return RET-001 refund to wallet", date: "04/06/2024", returnId: "RET-001", orderId: "ORD-2024-001", balanceAfter: 79.5 },
];

export const MOCK_ADMIN_PAYOUTS: AdminPayoutRequest[] = [
  { id: "PAY-001", seller: "TechZone Store", sellerId: 3, amount: 2450, status: "requested", requestedAt: "2024-06-08", bankAccount: "****4521" },
  { id: "PAY-002", seller: "AudioHub", sellerId: 4, amount: 890, status: "requested", requestedAt: "2024-06-07", bankAccount: "****8890" },
];

export function getReturn(id: string): ReturnItem | undefined {
  return MOCK_RETURNS.find((r) => r.id === id);
}

export function getDispute(id: string): DisputeItem | undefined {
  return MOCK_DISPUTES.find((d) => d.id === id);
}

export function getSupportTicket(id: string): SupportTicket | undefined {
  return MOCK_SUPPORT_TICKETS.find((t) => t.id === id);
}

export function getRefund(id: string): RefundRequest | undefined {
  return MOCK_REFUNDS.find((r) => r.id === id);
}

export function getAdminPayout(id: string): AdminPayoutRequest | undefined {
  return MOCK_ADMIN_PAYOUTS.find((p) => p.id === id);
}

export function getWalletTransaction(id: string): WalletTransaction | undefined {
  return MOCK_WALLET_TRANSACTIONS.find((t) => t.id === id);
}
