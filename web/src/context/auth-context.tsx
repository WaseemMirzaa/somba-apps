"use client";

import { createContext, useContext, useState, useCallback, useEffect } from "react";
import { INITIAL_WAREHOUSES, warehousePersonaId } from "@/lib/warehouses-admin";

export type Persona = {
  id: string;
  role: "guest" | "customer" | "seller" | "admin" | "warehouse" | "rider";
  name: string;
  email: string;
  portal: string;
  subRole?: string;
  warehouseId?: string;
};

const STATIC_PERSONAS: Persona[] = [
  { id: "guest", role: "guest", name: "Guest", email: "", portal: "/" },
  { id: "cust-1", role: "customer", name: "Marie Dubois", email: "marie@email.com", portal: "/shop/account" },
  { id: "seller-1", role: "seller", name: "TechZone Store", email: "seller@techzone.com", portal: "/seller", subRole: "Subscribed" },
  { id: "seller-2", role: "seller", name: "Fashion Hub", email: "fashion@seller.com", portal: "/seller", subRole: "No subscription" },
  { id: "admin-1", role: "admin", name: "Admin User", email: "admin@somba.com", portal: "/admin", subRole: "Super Admin" },
  { id: "admin-ops", role: "admin", name: "Ops Manager", email: "ops@somba.com", portal: "/admin", subRole: "Operations" },
  { id: "admin-fin", role: "admin", name: "Finance Lead", email: "finance@somba.com", portal: "/admin/finance", subRole: "Finance" },
  { id: "admin-sup", role: "admin", name: "Support Agent", email: "support@somba.com", portal: "/admin/support", subRole: "Support" },
  { id: "admin-mkt", role: "admin", name: "Marketing Mgr", email: "marketing@somba.com", portal: "/admin/marketing", subRole: "Marketing" },
  { id: "admin-mod", role: "admin", name: "Moderator", email: "mod@somba.com", portal: "/admin/moderation", subRole: "Moderation" },
  { id: "rider-1", role: "rider", name: "Jean Mukendi", email: "rider@somba.com", portal: "/rider" },
];

function buildWarehousePersonas(): Persona[] {
  return INITIAL_WAREHOUSES.filter((w) => w.status === "active").map((w) => ({
    id: warehousePersonaId(w.id),
    role: "warehouse" as const,
    name: w.managerName,
    email: w.portalEmail,
    portal: "/warehouse",
    subRole: `${w.name} Manager`,
    warehouseId: w.id,
  }));
}

export const PERSONAS: Persona[] = [...STATIC_PERSONAS, ...buildWarehousePersonas()];

type AuthContextType = {
  persona: Persona;
  isAuthenticated: boolean;
  authReady: boolean;
  login: (personaId: string) => void;
  logout: () => void;
  switchPersona: (personaId: string) => void;
};

const AuthContext = createContext<AuthContextType | null>(null);
const STORAGE_KEY = "somba-persona-id";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [persona, setPersona] = useState<Persona>(PERSONAS[0]);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const p = PERSONAS.find((x) => x.id === stored);
      if (p) setPersona(p);
    }
    setAuthReady(true);
  }, []);

  const login = useCallback((personaId: string) => {
    const p = PERSONAS.find((x) => x.id === personaId);
    if (p) {
      setPersona(p);
      localStorage.setItem(STORAGE_KEY, personaId);
    }
  }, []);

  const logout = useCallback(() => {
    setPersona(PERSONAS[0]);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  const switchPersona = login;

  return (
    <AuthContext.Provider
      value={{
        persona,
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
