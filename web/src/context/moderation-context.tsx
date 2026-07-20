"use client";

import { createContext, useContext, useState, useCallback, useEffect, useMemo } from "react";
import { sellerEntities } from "@/lib/entities";

/**
 * Runtime moderation state — which sellers and products a Super Admin or
 * Moderation manager has blocked. Blocking a seller cascades to every product
 * carrying that store name (products link to sellers by store name), hiding the
 * storefront and locking the seller out of their portal. Persisted to
 * localStorage so the demo survives reloads.
 */

type BlockedSeller = { id: number | string; reason?: string; at: string };
type BlockedProduct = { id: number | string; reason?: string; at: string };

type ModerationContextType = {
  blockedSellers: BlockedSeller[];
  blockedProducts: BlockedProduct[];
  isSellerBlocked: (id: number | string) => boolean;
  isStoreBlocked: (storeName: string) => boolean;
  isProductBlocked: (id: number | string) => boolean;
  /** A product is hidden from customers if it — or its store — is blocked. */
  isProductVisible: (product: { id: number | string; seller: string }) => boolean;
  blockSeller: (id: number | string, reason?: string) => void;
  unblockSeller: (id: number | string) => void;
  blockProduct: (id: number | string, reason?: string) => void;
  unblockProduct: (id: number | string) => void;
};

const ModerationContext = createContext<ModerationContextType | null>(null);
const STORAGE_KEY = "somba-moderation";

export function ModerationProvider({ children }: { children: React.ReactNode }) {
  const [blockedSellers, setBlockedSellers] = useState<BlockedSeller[]>([]);
  const [blockedProducts, setBlockedProducts] = useState<BlockedProduct[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        setBlockedSellers(parsed.sellers ?? []);
        setBlockedProducts(parsed.products ?? []);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const persist = useCallback((sellers: BlockedSeller[], productsList: BlockedProduct[]) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ sellers, products: productsList }));
    } catch {
      /* ignore */
    }
  }, []);

  /** Store names of every blocked seller, for the product cascade. */
  const blockedStoreNames = useMemo(() => {
    const ids = new Set(blockedSellers.map((s) => s.id));
    return new Set(
      sellerEntities.filter((s) => ids.has(s.id)).map((s) => s.storeName)
    );
  }, [blockedSellers]);

  const isSellerBlocked = useCallback(
    (id: number | string) => blockedSellers.some((s) => s.id === id),
    [blockedSellers]
  );

  const isStoreBlocked = useCallback(
    (storeName: string) => blockedStoreNames.has(storeName),
    [blockedStoreNames]
  );

  const isProductBlocked = useCallback(
    (id: number | string) => blockedProducts.some((p) => p.id === id),
    [blockedProducts]
  );

  const isProductVisible = useCallback(
    (product: { id: number | string; seller: string }) =>
      !isProductBlocked(product.id) && !isStoreBlocked(product.seller),
    [isProductBlocked, isStoreBlocked]
  );

  const blockSeller = useCallback(
    (id: number | string, reason?: string) => {
      setBlockedSellers((prev) => {
        if (prev.some((s) => s.id === id)) return prev;
        const next = [...prev, { id, reason, at: new Date().toISOString() }];
        persist(next, blockedProducts);
        return next;
      });
    },
    [persist, blockedProducts]
  );

  const unblockSeller = useCallback(
    (id: number | string) => {
      setBlockedSellers((prev) => {
        const next = prev.filter((s) => s.id !== id);
        persist(next, blockedProducts);
        return next;
      });
    },
    [persist, blockedProducts]
  );

  const blockProduct = useCallback(
    (id: number | string, reason?: string) => {
      setBlockedProducts((prev) => {
        if (prev.some((p) => p.id === id)) return prev;
        const next = [...prev, { id, reason, at: new Date().toISOString() }];
        persist(blockedSellers, next);
        return next;
      });
    },
    [persist, blockedSellers]
  );

  const unblockProduct = useCallback(
    (id: number | string) => {
      setBlockedProducts((prev) => {
        const next = prev.filter((p) => p.id !== id);
        persist(blockedSellers, next);
        return next;
      });
    },
    [persist, blockedSellers]
  );

  return (
    <ModerationContext.Provider
      value={{
        blockedSellers,
        blockedProducts,
        isSellerBlocked,
        isStoreBlocked,
        isProductBlocked,
        isProductVisible,
        blockSeller,
        unblockSeller,
        blockProduct,
        unblockProduct,
      }}
    >
      {children}
    </ModerationContext.Provider>
  );
}

export function useModeration() {
  const ctx = useContext(ModerationContext);
  if (!ctx) throw new Error("useModeration must be used within ModerationProvider");
  return ctx;
}
