"use client";

import { createContext, useContext, useState, useCallback, useEffect, useMemo } from "react";
import { INITIAL_WAREHOUSES, warehousePersonaId } from "@/lib/warehouses-admin";
import {
  WAREHOUSE_STAFF_ROLE_LABELS,
  WAREHOUSE_STAFF_ROLE_LABELS_FR,
  warehouseStaffPersonaId,
} from "@/lib/admin-entities";
import { useWarehouseStaff } from "@/context/warehouse-staff-context";
import type { AdminDepartment } from "@/lib/admin-access";
import type { WarehouseStaffRole } from "@/lib/admin-entities";

export type Persona = {
  id: string;
  role: "guest" | "customer" | "seller" | "admin" | "warehouse" | "rider";
  name: string;
  nameFr?: string;
  email: string;
  portal: string;
  subRole?: string;
  subRoleFr?: string;
  warehouseId?: string;
  /** Admin-only: which department this manager runs. Drives sidebar + access. */
  department?: AdminDepartment;
  /** Warehouse-only: staff tier. Drives warehouse sidebar + access. */
  warehouseRole?: WarehouseStaffRole;
};

const STATIC_PERSONAS: Persona[] = [
  { id: "guest", role: "guest", name: "Guest", nameFr: "Invité", email: "", portal: "/" },
  {
    id: "cust-1",
    role: "customer",
    name: "Marie Dubois",
    nameFr: "Marie Dubois",
    email: "marie@email.com",
    portal: "/shop/account",
  },
  {
    id: "seller-1",
    role: "seller",
    name: "TechZone Store",
    nameFr: "TechZone Store",
    email: "seller@techzone.com",
    portal: "/seller",
    subRole: "Subscribed",
    subRoleFr: "Abonné",
  },
  {
    id: "seller-2",
    role: "seller",
    name: "Fashion Hub",
    nameFr: "Fashion Hub",
    email: "fashion@seller.com",
    portal: "/seller",
    subRole: "No subscription",
    subRoleFr: "Sans abonnement",
  },
  {
    id: "admin-1",
    role: "admin",
    department: "super",
    name: "Admin User",
    nameFr: "Utilisateur admin",
    email: "admin@somba.com",
    portal: "/admin",
    subRole: "Super Admin",
    subRoleFr: "Super admin",
  },
  {
    id: "admin-ops",
    role: "admin",
    department: "operations",
    name: "Ops Manager",
    nameFr: "Responsable des opérations",
    email: "ops@somba.com",
    portal: "/admin/orders",
    subRole: "Operations",
    subRoleFr: "Opérations",
  },
  {
    id: "admin-fin",
    role: "admin",
    department: "finance",
    name: "Finance Lead",
    nameFr: "Responsable finance",
    email: "finance@somba.com",
    portal: "/admin/finance",
    subRole: "Finance",
    subRoleFr: "Finance",
  },
  {
    id: "admin-wh",
    role: "admin",
    department: "warehouse",
    name: "Warehouse Admin",
    nameFr: "Admin entrepôt",
    email: "warehouse-admin@somba.com",
    portal: "/admin/warehouses",
    subRole: "Warehouse Admin",
    subRoleFr: "Admin entrepôt",
  },
  {
    id: "admin-sup",
    role: "admin",
    department: "support",
    name: "Support Agent",
    nameFr: "Agent support",
    email: "support@somba.com",
    portal: "/admin/support",
    subRole: "Support",
    subRoleFr: "Support",
  },
  {
    id: "admin-mkt",
    role: "admin",
    department: "marketing",
    name: "Marketing Mgr",
    nameFr: "Responsable marketing",
    email: "marketing@somba.com",
    portal: "/admin/flash-sales",
    subRole: "Marketing",
    subRoleFr: "Marketing",
  },
  {
    id: "admin-mod",
    role: "admin",
    department: "moderation",
    name: "Moderator",
    nameFr: "Modérateur",
    email: "mod@somba.com",
    portal: "/admin/moderation",
    subRole: "Moderation",
    subRoleFr: "Modération",
  },
  {
    id: "rider-1",
    role: "rider",
    name: "Jean Mukendi",
    nameFr: "Jean Mukendi",
    email: "rider@somba.com",
    portal: "/rider",
  },
];

const PERSONA_ROLE_LABELS: Record<Persona["role"], { en: string; fr: string }> = {
  guest: { en: "Guest", fr: "Invité" },
  customer: { en: "Customer", fr: "Client" },
  seller: { en: "Seller", fr: "Vendeur" },
  admin: { en: "Admin", fr: "Admin" },
  warehouse: { en: "Warehouse", fr: "Entrepôt" },
  rider: { en: "Rider", fr: "Livreur" },
};

export function getPersonaDisplayName(persona: Persona, fr: boolean) {
  return fr && persona.nameFr ? persona.nameFr : persona.name;
}

export function getPersonaDisplaySubRole(persona: Persona, fr: boolean) {
  if (fr && persona.subRoleFr) return persona.subRoleFr;
  if (persona.subRole) return persona.subRole;
  const labels = PERSONA_ROLE_LABELS[persona.role];
  return fr ? labels.fr : labels.en;
}

function buildWarehouseManagerPersonas(): Persona[] {
  return INITIAL_WAREHOUSES.filter((w) => w.status === "active").map((w) => ({
    id: warehousePersonaId(w.id),
    role: "warehouse" as const,
    name: w.managerName,
    nameFr: w.managerName,
    email: w.portalEmail,
    portal: "/warehouse",
    subRole: `${w.name} Manager`,
    subRoleFr: `Responsable — ${w.name}`,
    warehouseId: w.id,
    warehouseRole: "manager" as const,
  }));
}

/** Static fallback for modules that import PERSONAS before provider mounts */
export const PERSONAS: Persona[] = [...STATIC_PERSONAS, ...buildWarehouseManagerPersonas()];

type AuthContextType = {
  persona: Persona;
  personas: Persona[];
  isAuthenticated: boolean;
  authReady: boolean;
  login: (personaId: string) => void;
  logout: () => void;
  switchPersona: (personaId: string) => void;
};

const AuthContext = createContext<AuthContextType | null>(null);
const STORAGE_KEY = "somba-persona-id";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { staff } = useWarehouseStaff();
  const [persona, setPersona] = useState<Persona>(STATIC_PERSONAS[0]);
  const [authReady, setAuthReady] = useState(false);

  const personas = useMemo(() => {
    const staffPersonas: Persona[] = staff
      .filter((s) => s.status === "active")
      .map((s) => ({
        id: warehouseStaffPersonaId(s.id),
        role: "warehouse" as const,
        name: s.name,
        email: s.email,
        portal: "/warehouse",
        subRole: WAREHOUSE_STAFF_ROLE_LABELS[s.role],
        subRoleFr: WAREHOUSE_STAFF_ROLE_LABELS_FR[s.role],
        warehouseId: s.warehouseId,
        warehouseRole: s.role,
      }));
    return [...STATIC_PERSONAS, ...buildWarehouseManagerPersonas(), ...staffPersonas];
  }, [staff]);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const p = personas.find((x) => x.id === stored);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate persisted state from localStorage after mount (SSR-safe; a lazy initializer would cause a hydration mismatch)
      if (p) setPersona(p);
    }
    setAuthReady(true);
  }, [personas]);

  const login = useCallback(
    (personaId: string) => {
      const p = personas.find((x) => x.id === personaId);
      if (p) {
        setPersona(p);
        localStorage.setItem(STORAGE_KEY, personaId);
      }
    },
    [personas]
  );

  const logout = useCallback(() => {
    setPersona(STATIC_PERSONAS[0]);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  const switchPersona = login;

  return (
    <AuthContext.Provider
      value={{
        persona,
        personas,
        isAuthenticated: persona.role !== "guest",
        authReady,
        login,
        logout,
        switchPersona,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
