"use client";

import { createContext, useContext, useState, useCallback, useEffect, useMemo, useRef } from "react";
import { INITIAL_WAREHOUSES, warehousePersonaId } from "@/lib/warehouses-admin";
import {
  WAREHOUSE_STAFF_ROLE_LABELS,
  WAREHOUSE_STAFF_ROLE_LABELS_FR,
  warehouseStaffPersonaId,
} from "@/lib/admin-entities";
import { useWarehouseStaff } from "@/context/warehouse-staff-context";
import { useRealtime } from "@/context/realtime-context";
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
    email: "customer@somba.app",
    portal: "/shop/account",
  },
  {
    id: "seller-1",
    role: "seller",
    name: "Kinshasa Traders",
    nameFr: "Kinshasa Traders",
    email: "seller@somba.app",
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
    name: "Admin Root",
    nameFr: "Admin Root",
    email: "admin@somba.app",
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
    email: "ops@somba.app",
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
    email: "finance@somba.app",
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
    email: "admin@somba.app",
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
    email: "admin@somba.app",
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
    email: "admin@somba.app",
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
    email: "admin@somba.app",
    portal: "/admin/moderation",
    subRole: "Moderation",
    subRoleFr: "Modération",
  },
  {
    id: "rider-1",
    role: "rider",
    name: "Jean Rider",
    nameFr: "Jean Rider",
    email: "rider@somba.app",
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

/**
 * Bridge each demo persona to its seeded backend account so selecting a role in
 * the login screen also authenticates the real Socket.IO session — that is what
 * makes every portal (seller/admin/warehouse/rider) show live backend data.
 * All seeded demo accounts share one password (see api/src/database/seed.ts).
 */
const DEMO_PASSWORD = process.env.NEXT_PUBLIC_DEMO_PASSWORD ?? "Somba@2026";

function backendEmailFor(persona: Persona): string | null {
  if (persona.role === "guest") return null;
  // Specific admin sub-roles map to their own seeded operator accounts.
  if (persona.id === "admin-ops") return "ops@somba.app";
  if (persona.id === "admin-fin") return "finance@somba.app";
  switch (persona.role) {
    case "customer":
      return "customer@somba.app";
    case "seller":
      return "seller@somba.app";
    case "admin":
      return "admin@somba.app";
    case "warehouse":
      return "warehouse@somba.app";
    case "rider":
      return "rider@somba.app";
    default:
      return null;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { staff } = useWarehouseStaff();
  const rt = useRealtime();
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
    rt.logout();
  }, [rt]);

  // Keep the real backend socket session in sync with the selected persona, so
  // every portal reads live data over the authenticated socket. Runs after the
  // persona is resolved/restored and whenever it changes.
  const bridgingRef = useRef<string | null>(null);
  useEffect(() => {
    if (!authReady) return;
    const email = backendEmailFor(persona);
    if (!email) {
      bridgingRef.current = null;
      return;
    }
    if (rt.user?.email === email) {
      bridgingRef.current = email;
      return;
    }
    if (bridgingRef.current === email) return; // attempt already in flight
    bridgingRef.current = email;
    rt.login(email, DEMO_PASSWORD).catch(() => {
      bridgingRef.current = null; // allow a retry on next persona change
    });
  }, [authReady, persona, rt]);

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
