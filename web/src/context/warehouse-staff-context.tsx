"use client";

import { createContext, useContext, useState, useCallback } from "react";
import {
  INITIAL_WAREHOUSE_STAFF,
  warehouseStaffPersonaId,
  type WarehouseStaffMember,
  type WarehouseStaffRole,
  type WarehouseStaffStatus,
} from "@/lib/admin-entities";

type CreateStaffInput = {
  name: string;
  email: string;
  phone: string;
  role: WarehouseStaffRole;
  warehouseId: string;
  status: WarehouseStaffStatus;
};

type WarehouseStaffContextType = {
  staff: WarehouseStaffMember[];
  getStaff: (id: string) => WarehouseStaffMember | undefined;
  createStaff: (input: CreateStaffInput) => WarehouseStaffMember;
  updateStaff: (id: string, patch: Partial<WarehouseStaffMember>) => void;
  toggleStaffStatus: (id: string) => void;
  getStaffByWarehouse: (warehouseId: string) => WarehouseStaffMember[];
};

const WarehouseStaffContext = createContext<WarehouseStaffContextType | null>(null);

export function WarehouseStaffProvider({ children }: { children: React.ReactNode }) {
  const [staff, setStaff] = useState<WarehouseStaffMember[]>(INITIAL_WAREHOUSE_STAFF);

  const getStaff = useCallback((id: string) => staff.find((s) => s.id === id), [staff]);

  const createStaff = useCallback((input: CreateStaffInput) => {
    const id = `WHS-${Date.now().toString().slice(-6)}`;
    const record: WarehouseStaffMember = {
      id,
      ...input,
      createdAt: new Date().toISOString().slice(0, 10),
    };
    setStaff((prev) => [...prev, record]);
    return record;
  }, []);

  const updateStaff = useCallback((id: string, patch: Partial<WarehouseStaffMember>) => {
    setStaff((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }, []);

  const toggleStaffStatus = useCallback((id: string) => {
    setStaff((prev) =>
      prev.map((s) =>
        s.id === id ? { ...s, status: s.status === "active" ? "inactive" : "active" } : s
      )
    );
  }, []);

  const getStaffByWarehouse = useCallback(
    (warehouseId: string) => staff.filter((s) => s.warehouseId === warehouseId),
    [staff]
  );

  return (
    <WarehouseStaffContext.Provider
      value={{ staff, getStaff, createStaff, updateStaff, toggleStaffStatus, getStaffByWarehouse }}
    >
      {children}
    </WarehouseStaffContext.Provider>
  );
}

export function useWarehouseStaff() {
  const ctx = useContext(WarehouseStaffContext);
  if (!ctx) throw new Error("useWarehouseStaff must be used within WarehouseStaffProvider");
  return ctx;
}

export { warehouseStaffPersonaId };
