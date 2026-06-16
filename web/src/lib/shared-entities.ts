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
  productId: number;
  productName: string;
  productImage: string;
  variant?: string;
  warehouse: string;
  warehouseHub: string;
  warehouseContact: string;
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
    buyerId: "cust-3",
    buyerName: "Sophie Martin",
    sellerId: 2,
    sellerName: "SportStyle",
    status: "open",
    reason: "not_as_described",
    description: "Shoes colour does not match listing photos — ordered white, received grey.",
    createdAt: "2024-06-05",
    productId: 4,
    productName: "Nike Air Max 270",
    productImage: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=400&q=80",
    variant: "Size 40 · White",
    warehouse: "Kinshasa Hub",
    warehouseHub: "WH-KIN-01",
    warehouseContact: "ops.kinshasa@somba.com",
    messages: [
      { from: "buyer", text: "The white shoes arrived grey. Photos in the listing clearly show white.", at: "2024-06-05T10:00:00Z" },
      { from: "seller", text: "Sorry for the inconvenience. Lighting in our studio may differ — can you share a photo of the item received?", at: "2024-06-05T14:30:00Z" },
      { from: "buyer", text: "Uploaded comparison photos to my order page. The box label also says grey.", at: "2024-06-05T16:15:00Z" },
    ],
  },
  {
    id: "DSP-002",
    orderId: "ORD-2024-002",
    buyerId: "cust-2",
    buyerName: "John Smith",
    sellerId: 1,
    sellerName: "TechZone Store",
    status: "seller_responded",
    reason: "defective",
    description: "Headphones left speaker crackling and cuts out after 10 minutes of use.",
    createdAt: "2024-06-03",
    productId: 3,
    productName: "Galaxy Buds Pro",
    productImage: "https://images.unsplash.com/photo-1590658268037-6bf12165a8df?auto=format&fit=crop&w=400&q=80",
    variant: "Black",
    warehouse: "Paris Nord FC",
    warehouseHub: "WH-PAR-02",
    warehouseContact: "ops.paris@somba.com",
    messages: [
      { from: "buyer", text: "Left speaker has static noise and drops audio completely.", at: "2024-06-03T12:00:00Z" },
      { from: "seller", text: "We can offer replacement or full refund. Please confirm your preference.", at: "2024-06-04T09:00:00Z" },
      { from: "buyer", text: "I'd prefer a replacement if stock is available.", at: "2024-06-04T11:45:00Z" },
      { from: "admin", text: "Somba support reviewing case — we'll confirm replacement eligibility within 24h.", at: "2024-06-04T15:00:00Z" },
    ],
  },
];

export const MOCK_RETURNS: ReturnItem[] = [
  {
    id: "RET-001",
    orderId: "ORD-2024-001",
    status: "approved",
    items: ["Nike Air Max 270"],
    reason: "Wrong size",
    createdAt: "2024-06-05",
    refundAmount: 129,
  },
  {
    id: "RET-002",
    orderId: "ORD-2024-004",
    status: "in_transit",
    items: ["Dyson V15 Vacuum"],
    reason: "Damaged item",
    createdAt: "2024-06-04",
    refundAmount: 649,
  },
  {
    id: "RET-003",
    orderId: "ORD-2024-003",
    status: "refunded",
    items: ["Nike Air Max 270"],
    reason: "Not as described",
    createdAt: "2024-06-02",
    refundAmount: 129,
  },
];

export function getReturn(id: string): ReturnItem | undefined {
  return MOCK_RETURNS.find((r) => r.id === id);
}

export function getDispute(id: string): DisputeItem | undefined {
  return MOCK_DISPUTES.find((d) => d.id === id);
}
