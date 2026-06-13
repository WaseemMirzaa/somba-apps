export type WarehouseOperator = {
  id: string;
  name: string;
  email: string;
  role: "Manager" | "Inbound" | "Sorting" | "Dispatch";
  status: "active" | "suspended";
};

export type WarehouseRecord = {
  id: string;
  name: string;
  city: string;
  country: string;
  address: string;
  capacity: number;
  staff: number;
  status: "active" | "inactive" | "setup";
  managerName: string;
  managerEmail: string;
  /** Portal login email (credentials issued by admin) */
  portalEmail: string;
  zones: string[];
  operators?: WarehouseOperator[];
  createdAt: string;
};

/** Seed operator accounts for a warehouse (manager + sample staff) when none are stored. */
export function defaultOperators(w: WarehouseRecord): WarehouseOperator[] {
  const slug = w.id.toLowerCase().replace("wh-", "");
  return [
    { id: `${w.id}-OP1`, name: w.managerName, email: w.portalEmail, role: "Manager", status: "active" },
    { id: `${w.id}-OP2`, name: "Inbound Operator", email: `inbound.${slug}@somba.com`, role: "Inbound", status: "active" },
    { id: `${w.id}-OP3`, name: "Dispatch Operator", email: `dispatch.${slug}@somba.com`, role: "Dispatch", status: "active" },
  ];
}

export const INITIAL_WAREHOUSES: WarehouseRecord[] = [
  {
    id: "WH-PAR",
    name: "Paris Fulfillment Center",
    city: "Paris",
    country: "France",
    address: "12 Rue de la Logistique, 75012 Paris",
    capacity: 50000,
    staff: 86,
    status: "active",
    managerName: "Claire Martin",
    managerEmail: "claire.martin@somba.com",
    portalEmail: "warehouse.paris@somba.com",
    zones: ["Zone A — Île-de-France", "Zone B — Versailles"],
    createdAt: "2024-01-15",
  },
  {
    id: "WH-LYO",
    name: "Lyon Regional Hub",
    city: "Lyon",
    country: "France",
    address: "45 Av. de la République, 69003 Lyon",
    capacity: 20000,
    staff: 34,
    status: "active",
    managerName: "Pierre Dubois",
    managerEmail: "pierre.dubois@somba.com",
    portalEmail: "warehouse.lyon@somba.com",
    zones: ["Zone Rhône-Alpes"],
    createdAt: "2024-02-01",
  },
  {
    id: "WH-KIN",
    name: "Kinshasa Hub",
    city: "Kinshasa",
    country: "DRC",
    address: "8 Ave du Commerce, Gombe, Kinshasa",
    capacity: 15000,
    staff: 52,
    status: "active",
    managerName: "Jean Warehouse",
    managerEmail: "wh@somba.com",
    portalEmail: "warehouse.kinshasa@somba.com",
    zones: ["Zone A — Gombe", "Zone B — Limete", "Zone C — Bandal"],
    createdAt: "2024-03-10",
  },
  {
    id: "WH-ABJ",
    name: "Abidjan Hub",
    city: "Abidjan",
    country: "Côte d'Ivoire",
    address: "Zone 4, Marcory, Abidjan",
    capacity: 12000,
    staff: 28,
    status: "active",
    managerName: "Aminata Koné",
    managerEmail: "aminata.kone@somba.com",
    portalEmail: "warehouse.abidjan@somba.com",
    zones: ["Zone Cocody", "Zone Plateau"],
    createdAt: "2024-04-05",
  },
];

export function warehousePersonaId(warehouseId: string): string {
  return `wh-${warehouseId.toLowerCase().replace("wh-", "")}`;
}
