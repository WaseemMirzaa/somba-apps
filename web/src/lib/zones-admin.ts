/** Delivery zones defined by commune (Q3); rider assignment is manual (Q4). */

export type AdminZone = {
  id: string;
  commune: string;
  city: string;
  deliveryFeeUsd: number;
  riders: string[];
  status: "active" | "paused";
  statusFr?: string;
};

export const ZONE_CITIES = ["Kinshasa", "Lubumbashi"] as const;

export const ZONE_RIDERS = [
  "Jean Mbiya",
  "Patrick Kasongo",
  "Divine Ilunga",
  "Espoir Tshibangu",
  "Grace Mwamba",
  "Samuel Lukusa",
  "Christ Kabeya",
  "Merveille Nsimba",
] as const;

export const ADMIN_ZONES: AdminZone[] = [
  { id: "z-gombe", commune: "Gombe", city: "Kinshasa", deliveryFeeUsd: 3, riders: ["Jean Mbiya", "Patrick Kasongo"], status: "active", statusFr: "Actif" },
  { id: "z-limete", commune: "Limete", city: "Kinshasa", deliveryFeeUsd: 5, riders: ["Divine Ilunga"], status: "active", statusFr: "Actif" },
  { id: "z-masina", commune: "Masina", city: "Kinshasa", deliveryFeeUsd: 6, riders: [], status: "active", statusFr: "Actif" },
  { id: "z-ngaliema", commune: "Ngaliema", city: "Kinshasa", deliveryFeeUsd: 5, riders: ["Espoir Tshibangu"], status: "active", statusFr: "Actif" },
  { id: "z-kalamu", commune: "Kalamu", city: "Kinshasa", deliveryFeeUsd: 4, riders: [], status: "paused", statusFr: "En pause" },
  { id: "z-lub-centre", commune: "Centre-ville", city: "Lubumbashi", deliveryFeeUsd: 4, riders: ["Grace Mwamba"], status: "active", statusFr: "Actif" },
  { id: "z-lub-kampemba", commune: "Kampemba", city: "Lubumbashi", deliveryFeeUsd: 5, riders: [], status: "active", statusFr: "Actif" },
];
