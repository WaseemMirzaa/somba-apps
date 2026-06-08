"use client";

import { createContext, useContext, useState, useCallback } from "react";
import {
  INITIAL_WAREHOUSES,
  type WarehouseRecord,
  warehousePersonaId,
} from "@/lib/warehouses-admin";

type CreateWarehouseInput = {
  name: string;
  city: string;
  country: string;
  address: string;
  capacity: number;
  managerName: string;
  managerEmail: string;
  portalEmail: string;
  zones: string[];
};

type WarehouseAdminContextType = {
  warehouses: WarehouseRecord[];
  getWarehouse: (id: string) => WarehouseRecord | undefined;
  createWarehouse: (input: CreateWarehouseInput) => { record: WarehouseRecord; password: string };
  updateWarehouse: (id: string, patch: Partial<WarehouseRecord>) => void;
  resetCredentials: (id: string) => string;
  getCredential: (id: string) => string | undefined;
  deactivateWarehouse: (id: string) => void;
};

const WarehouseAdminContext = createContext<WarehouseAdminContextType | null>(null);

function generatePassword(): string {
  return `WH-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

export function WarehouseAdminProvider({ children }: { children: React.ReactNode }) {
  const [warehouses, setWarehouses] = useState(INITIAL_WAREHOUSES);
  const [credentials, setCredentials] = useState<Record<string, string>>({
    "WH-PAR": "WH-PARIS24",
    "WH-LYO": "WH-LYON24",
    "WH-KIN": "WH-KINS24",
    "WH-ABJ": "WH-ABID24",
  });

  const getWarehouse = useCallback(
    (id: string) => warehouses.find((w) => w.id === id),
    [warehouses]
  );

  const createWarehouse = useCallback((input: CreateWarehouseInput) => {
    const id = `WH-${input.city.slice(0, 3).toUpperCase()}${Date.now().toString().slice(-3)}`;
    const record: WarehouseRecord = {
      id,
      ...input,
      staff: 0,
      status: "setup",
      createdAt: new Date().toISOString().slice(0, 10),
    };
    const password = generatePassword();
    setWarehouses((w) => [...w, record]);
    setCredentials((c) => ({ ...c, [id]: password }));
    return { record, password };
  }, []);

  const updateWarehouse = useCallback((id: string, patch: Partial<WarehouseRecord>) => {
    setWarehouses((w) => w.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }, []);

  const resetCredentials = useCallback((id: string) => {
    const password = generatePassword();
    setCredentials((c) => ({ ...c, [id]: password }));
    return password;
  }, []);

  const getCredential = useCallback((id: string) => credentials[id], [credentials]);

  const deactivateWarehouse = useCallback((id: string) => {
    setWarehouses((w) => w.map((item) => (item.id === id ? { ...item, status: "inactive" } : item)));
  }, []);

  return (
    <WarehouseAdminContext.Provider
      value={{
        warehouses,
        getWarehouse,
        createWarehouse,
        updateWarehouse,
        resetCredentials,
        getCredential,
        deactivateWarehouse,
      }}
    >
      {children}
    </WarehouseAdminContext.Provider>
  );
}

export function useWarehouseAdmin() {
  const ctx = useContext(WarehouseAdminContext);
  if (!ctx) throw new Error("useWarehouseAdmin must be used within WarehouseAdminProvider");
  return ctx;
}

