"use client";

import { createContext, useContext, useState, useCallback, useEffect } from "react";
import { categories as seedCategories } from "@/lib/mock-data";

/**
 * Runtime category catalog. Seeded from the mock categories, but a Super
 * Admin / Moderation manager can add and edit categories (name + image) at
 * runtime. Persisted to localStorage so the demo survives reloads and the
 * storefront category grid reflects edits.
 */

export type Category = {
  id: number;
  name: string;
  nameFr: string;
  icon: string;
  image: string;
};

export type CategoryInput = {
  name: string;
  nameFr: string;
  icon: string;
  image: string;
};

type CategoriesContextType = {
  categories: Category[];
  addCategory: (input: CategoryInput) => void;
  updateCategory: (id: number, input: CategoryInput) => void;
};

const CategoriesContext = createContext<CategoriesContextType | null>(null);
const STORAGE_KEY = "somba-categories";

export function CategoriesProvider({ children }: { children: React.ReactNode }) {
  const [categories, setCategories] = useState<Category[]>(seedCategories);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate persisted state from localStorage after mount (SSR-safe; a lazy initializer would cause a hydration mismatch)
      if (raw) setCategories(JSON.parse(raw));
    } catch {
      /* ignore */
    }
  }, []);

  const addCategory = useCallback(
    (input: CategoryInput) => {
      setCategories((prev) => {
        const id = prev.reduce((max, c) => Math.max(max, c.id), 0) + 1;
        const next = [...prev, { id, ...input }];
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        } catch {
          /* ignore */
        }
        return next;
      });
    },
    []
  );

  const updateCategory = useCallback(
    (id: number, input: CategoryInput) => {
      setCategories((prev) => {
        const next = prev.map((c) => (c.id === id ? { ...c, ...input } : c));
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        } catch {
          /* ignore */
        }
        return next;
      });
    },
    []
  );

  return (
    <CategoriesContext.Provider value={{ categories, addCategory, updateCategory }}>
      {children}
    </CategoriesContext.Provider>
  );
}

export function useCategories() {
  const ctx = useContext(CategoriesContext);
  if (!ctx) throw new Error("useCategories must be used within CategoriesProvider");
  return ctx;
}
