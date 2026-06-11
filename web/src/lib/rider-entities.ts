export type RiderTask = {
  id: string;
  type: "delivery" | "pickup" | "return" | "cod";
  status: "assigned" | "picked_up" | "in_transit" | "delivered" | "failed";
  customer: string;
  address: string;
  phone: string;
  orderId: string;
  amount?: number;
  codAmount?: number;
  eta: string;
  distance: string;
  items: number;
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

export const riderTasks: RiderTask[] = [
  {
    id: "TSK-8841",
    type: "delivery",
    status: "assigned",
    customer: "Marie Kabila",
    address: "12 Ave du Commerce, Gombe, Kinshasa",
    phone: "+243 998 112 334",
    orderId: "ORD-2024-8841",
    amount: 119900,
    codAmount: 119900,
    eta: "14:30",
    distance: "2.4 km",
    items: 2,
    notes: "Call on arrival — gate code 4521",
  },
  {
    id: "TSK-8842",
    type: "pickup",
    status: "assigned",
    customer: "TechZone Warehouse",
    address: "Zone Industrielle, Limete",
    phone: "+243 810 556 789",
    orderId: "ORD-2024-8842",
    eta: "15:00",
    distance: "5.1 km",
    items: 5,
  },
  {
    id: "TSK-8839",
    type: "delivery",
    status: "in_transit",
    customer: "Patrick Lumumba",
    address: "45 Blvd du 30 Juin, Kinshasa",
    phone: "+243 997 445 221",
    orderId: "ORD-2024-8839",
    amount: 34900,
    eta: "13:45",
    distance: "1.8 km",
    items: 1,
  },
  {
    id: "TSK-8835",
    type: "return",
    status: "picked_up",
    customer: "Sophie Mbuyi",
    address: "8 Rue de la Paix, Ngaliema",
    phone: "+243 815 223 901",
    orderId: "ORD-2024-8835",
    eta: "16:00",
    distance: "3.2 km",
    items: 1,
    notes: "Return — defective item",
  },
  {
    id: "TSK-8830",
    type: "cod",
    status: "delivered",
    customer: "David Tshisekedi",
    address: "22 Ave Kasa-Vubu, Kinshasa",
    phone: "+243 999 887 654",
    orderId: "ORD-2024-8830",
    codAmount: 54900,
    eta: "12:00",
    distance: "4.0 km",
    items: 3,
  },
];

export type RiderBatchStop = {
  seq: number;
  taskId: string;
  address: string;
  status: "completed" | "current" | "pending";
};

export type RiderBatch = {
  id: string;
  riderId: string;
  zone: string;
  stops: RiderBatchStop[];
};

export const riderBatches: RiderBatch[] = [
  {
    id: "BATCH-002",
    riderId: "RDR-001",
    zone: "Kinshasa — Gombe",
    stops: [
      { seq: 1, taskId: "TSK-8830", address: "22 Ave Kasa-Vubu, Kinshasa", status: "completed" },
      { seq: 2, taskId: "TSK-8839", address: "45 Blvd du 30 Juin, Kinshasa", status: "current" },
      { seq: 3, taskId: "TSK-8841", address: "12 Ave du Commerce, Gombe", status: "pending" },
      { seq: 4, taskId: "TSK-8842", address: "Zone Industrielle, Limete", status: "pending" },
    ],
  },
];

export function getRiderTask(id: string) {
  return riderTasks.find((t) => t.id === id);
}

export function getRiderBatch(id: string) {
  const normalized = id === "B-042" ? "BATCH-002" : id;
  return riderBatches.find((b) => b.id === normalized);
}
