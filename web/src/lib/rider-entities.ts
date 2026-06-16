import { products } from "./mock-data";

export type RiderTaskProduct = {
  productId: number;
  name: string;
  sku: string;
  variant: string;
  qty: number;
  image: string;
};

export type RiderTaskTimeline = {
  time: string;
  label: string;
  done?: boolean;
  detail?: string;
};

export type RiderTask = {
  id: string;
  type: "delivery" | "pickup" | "return" | "cod";
  status: "assigned" | "picked_up" | "in_transit" | "delivered" | "failed";
  customer: string;
  address: string;
  phone: string;
  zone: string;
  orderId: string;
  amount?: number;
  codAmount?: number;
  paymentType: string;
  eta: string;
  distance: string;
  items: number;
  sellerName: string;
  sellerStore: string;
  sellerPhone: string;
  products: RiderTaskProduct[];
  timeline: RiderTaskTimeline[];
  notes?: string;
};

export const riderProfile = {
  id: "RDR-001",
  name: "Jean Mukendi",
  phone: "+243 812 345 678",
  vehicle: "Motorcycle — Honda CB150",
  zone: "Kinshasa — Gombe",
  rating: 4.9,
  deliveriesToday: 12,
  earningsToday: 84000,
  status: "on_duty" as const,
};

const taskProducts = (indices: number[], qty = 1): RiderTaskProduct[] =>
  indices.map((i) => {
    const p = products[i % products.length];
    return {
      productId: p.id,
      name: p.name,
      sku: `SKU-${p.id}`,
      variant: "Default",
      qty,
      image: p.image,
    };
  });

const deliveryTimeline = (doneSteps: number): RiderTaskTimeline[] => [
  { time: "2024-06-16 09:00", label: "Order placed", done: doneSteps >= 1 },
  { time: "2024-06-16 10:30", label: "Picked from seller", done: doneSteps >= 2 },
  { time: "2024-06-16 11:45", label: "At warehouse", done: doneSteps >= 3 },
  { time: "2024-06-16 13:00", label: "Out for delivery", done: doneSteps >= 4 },
  { time: "—", label: "Delivered", done: doneSteps >= 5 },
];

export const riderTasks: RiderTask[] = [
  {
    id: "TSK-8841",
    type: "delivery",
    status: "assigned",
    customer: "Marie Kabila",
    address: "12 Ave du Commerce, Gombe, Kinshasa",
    phone: "+243 998 112 334",
    zone: "Gombe",
    orderId: "ORD-2024-8841",
    amount: 119900,
    codAmount: 119900,
    paymentType: "Pay at delivery",
    eta: "14:30",
    distance: "2.4 km",
    items: 2,
    sellerName: "Jean Dupont",
    sellerStore: "TechZone Store",
    sellerPhone: "+243 810 556 789",
    products: taskProducts([0, 2], 1),
    timeline: deliveryTimeline(3),
    notes: "Call on arrival — gate code 4521",
  },
  {
    id: "TSK-8842",
    type: "pickup",
    status: "assigned",
    customer: "TechZone Warehouse",
    address: "Zone Industrielle, Limete",
    phone: "+243 810 556 789",
    zone: "Limete",
    orderId: "ORD-2024-8842",
    paymentType: "Prepaid",
    eta: "15:00",
    distance: "5.1 km",
    items: 5,
    sellerName: "Jean Dupont",
    sellerStore: "TechZone Store",
    sellerPhone: "+243 810 556 789",
    products: taskProducts([0, 1, 2, 3, 4], 1),
    timeline: deliveryTimeline(1),
  },
  {
    id: "TSK-8839",
    type: "delivery",
    status: "in_transit",
    customer: "Patrick Lumumba",
    address: "45 Blvd du 30 Juin, Kinshasa",
    phone: "+243 997 445 221",
    zone: "Gombe",
    orderId: "ORD-2024-8839",
    amount: 34900,
    paymentType: "Card",
    eta: "13:45",
    distance: "1.8 km",
    items: 1,
    sellerName: "Claire Bernard",
    sellerStore: "FashionHub",
    sellerPhone: "+243 815 223 901",
    products: taskProducts([3], 1),
    timeline: deliveryTimeline(4),
  },
  {
    id: "TSK-8835",
    type: "return",
    status: "picked_up",
    customer: "Sophie Mbuyi",
    address: "8 Rue de la Paix, Ngaliema",
    phone: "+243 815 223 901",
    zone: "Ngaliema",
    orderId: "ORD-2024-8835",
    paymentType: "Prepaid",
    eta: "16:00",
    distance: "3.2 km",
    items: 1,
    sellerName: "Sarah Lee",
    sellerStore: "HomeEssentials",
    sellerPhone: "+243 999 887 654",
    products: taskProducts([3], 1),
    timeline: deliveryTimeline(2),
    notes: "Return — defective item",
  },
  {
    id: "TSK-8830",
    type: "cod",
    status: "delivered",
    customer: "David Tshisekedi",
    address: "22 Ave Kasa-Vubu, Kinshasa",
    phone: "+243 999 887 654",
    zone: "Bandal",
    orderId: "ORD-2024-8830",
    codAmount: 54900,
    paymentType: "Pay at delivery",
    eta: "12:00",
    distance: "4.0 km",
    items: 3,
    sellerName: "Jean Dupont",
    sellerStore: "TechZone Store",
    sellerPhone: "+243 810 556 789",
    products: taskProducts([1, 2, 5], 1),
    timeline: deliveryTimeline(5),
  },
];

export function getRiderTask(id: string) {
  return riderTasks.find((t) => t.id === id);
}

export function getActiveRiderTasks() {
  return riderTasks.filter((t) => t.status !== "delivered" && t.status !== "failed");
}
