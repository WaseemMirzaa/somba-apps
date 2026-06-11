/** Shared mock entities for disputes, notifications, returns, promos. */

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
    body: "Batch BATCH-002 assigned to you.",
    bodyFr: "Lot BATCH-002 vous est assigné.",
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
    reason: "defective",
    createdAt: "2026-06-01",
    refundAmount: 1199,
  },
  {
    id: "RET-002",
    orderId: "ORD-2024-004",
    status: "requested",
    items: ["Nike Air Max 270"],
    reason: "wrong_item",
    createdAt: "2026-06-07",
  },
];
