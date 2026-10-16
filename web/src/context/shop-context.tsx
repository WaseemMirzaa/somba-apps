"use client";

import { createContext, useContext, useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useRealtime } from "@/context/realtime-context";
import { socketClient } from "@/lib/realtime/socket-client";
import { useCatalog } from "@/lib/catalog";

/**
 * A cart line. `id` IS the live backend product id, so checkout can send
 * `productId` and the server prices the order itself.
 */
export type CartItem = {
  id: string;
  name: string;
  nameFr: string;
  price: number;
  image: string;
  seller: string;
  qty: number;
  variant: string;
};

export type PromoResult = { ok: boolean; reason?: string };

type ShopContextType = {
  cart: CartItem[];
  wishlist: string[];
  followedStores: string[];
  promoCode: string | null;
  promoDiscount: number;
  /** Delivery zone chosen for the order (id from the public `deliveryZones` setting). */
  zoneId: string | null;
  setZoneId: (zoneId: string | null) => void;
  addToCart: (item: Omit<CartItem, "qty"> & { qty?: number }) => void;
  removeFromCart: (id: string, variant: string) => void;
  updateQty: (id: string, variant: string, qty: number) => void;
  clearCart: () => void;
  cartCount: number;
  toggleWishlist: (productId: string) => void;
  isInWishlist: (productId: string) => boolean;
  moveToWishlist: (id: string, variant: string) => void;
  /** Validates the code on the server (`promos:validate`) against the current subtotal. */
  applyPromo: (code: string) => Promise<PromoResult>;
  removePromo: () => void;
  toggleFollowStore: (storeName: string) => void;
  isFollowingStore: (storeName: string) => boolean;
  recentlyViewed: string[];
  addRecentlyViewed: (productId: string) => void;
};

const ShopContext = createContext<ShopContextType | null>(null);

const STORAGE_KEY = "somba-shop-v2";

type Persisted = {
  cart: CartItem[];
  wishlist: string[];
  followedStores: string[];
  recentlyViewed: string[];
  promoCode: string | null;
  zoneId: string | null;
};

function readStored(): Partial<Persisted> {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Partial<Persisted>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function cleanCart(list: unknown): CartItem[] {
  if (!Array.isArray(list)) return [];
  return list
    .filter((x) => x && typeof x.id === "string" && Number.isFinite(Number(x.qty)))
    .map((x) => ({
      id: String(x.id),
      name: String(x.name ?? ""),
      nameFr: String(x.nameFr ?? x.name ?? ""),
      price: Number(x.price) || 0,
      image: String(x.image ?? ""),
      seller: String(x.seller ?? ""),
      qty: Math.max(1, Math.min(100, Math.floor(Number(x.qty)))),
      variant: String(x.variant ?? "Default"),
    }));
}

export function ShopProvider({ children }: { children: React.ReactNode }) {
  const rt = useRealtime();
  const [cart, setCart] = useState<CartItem[]>([]);
  const [wishlist, setWishlist] = useState<string[]>([]);
  const [followedStores, setFollowedStores] = useState<string[]>([]);
  const [promoCode, setPromoCode] = useState<string | null>(null);
  const [promoDiscount, setPromoDiscount] = useState(0);
  const [zoneId, setZoneIdState] = useState<string | null>(null);
  const [recentlyViewed, setRecentlyViewed] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const restoredPromo = useRef<string | null>(null);

  // Restore after mount (keeps server and first client render identical).
  useEffect(() => {
    const s = readStored();
    /* eslint-disable react-hooks/set-state-in-effect */
    setCart(cleanCart(s.cart));
    setWishlist(Array.isArray(s.wishlist) ? s.wishlist.map(String) : []);
    setFollowedStores(Array.isArray(s.followedStores) ? s.followedStores.map(String) : []);
    setRecentlyViewed(Array.isArray(s.recentlyViewed) ? s.recentlyViewed.map(String) : []);
    setZoneIdState(typeof s.zoneId === "string" ? s.zoneId : null);
    restoredPromo.current = typeof s.promoCode === "string" ? s.promoCode : null;
    setHydrated(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  // Persist (only after the first restore so we never overwrite saved data with empties).
  useEffect(() => {
    if (!hydrated) return;
    try {
      const data: Persisted = { cart, wishlist, followedStores, recentlyViewed, promoCode, zoneId };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      /* storage may be blocked (private window) — the cart still works for this session */
    }
  }, [hydrated, cart, wishlist, followedStores, recentlyViewed, promoCode, zoneId]);

  // Keep the cart in sync across tabs.
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key !== STORAGE_KEY) return;
      const s = readStored();
      setCart(cleanCart(s.cart));
      setWishlist(Array.isArray(s.wishlist) ? s.wishlist.map(String) : []);
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const addToCart = useCallback((item: Omit<CartItem, "qty"> & { qty?: number }) => {
    setCart((prev) => {
      const add = Math.max(1, item.qty ?? 1);
      const existing = prev.find((x) => x.id === item.id && x.variant === item.variant);
      if (existing) {
        return prev.map((x) =>
          x.id === item.id && x.variant === item.variant
            ? { ...x, price: item.price, qty: Math.min(100, x.qty + add) }
            : x,
        );
      }
      return [...prev, { ...item, qty: Math.min(100, add) }];
    });
  }, []);

  const removeFromCart = useCallback((id: string, variant: string) => {
    setCart((prev) => prev.filter((x) => !(x.id === id && x.variant === variant)));
  }, []);

  const updateQty = useCallback((id: string, variant: string, qty: number) => {
    const next = Math.max(1, Math.min(100, Math.floor(qty) || 1));
    setCart((prev) => prev.map((x) => (x.id === id && x.variant === variant ? { ...x, qty: next } : x)));
  }, []);

  const clearCart = useCallback(() => {
    setCart([]);
    setPromoCode(null);
    setPromoDiscount(0);
  }, []);

  const toggleWishlist = useCallback((productId: string) => {
    setWishlist((prev) =>
      prev.includes(productId) ? prev.filter((x) => x !== productId) : [...prev, productId],
    );
  }, []);

  const isInWishlist = useCallback((productId: string) => wishlist.includes(productId), [wishlist]);

  const moveToWishlist = useCallback((id: string, variant: string) => {
    setWishlist((w) => (w.includes(id) ? w : [...w, id]));
    setCart((prev) => prev.filter((x) => !(x.id === id && x.variant === variant)));
  }, []);

  const catalog = useCatalog();
  // Subtotal at LIVE catalogue prices (the server prices the order the same way).
  const subtotal = useMemo(() => {
    const byId = new Map(catalog.map((p) => [p.id, p.price]));
    return cart.reduce((s, i) => s + (byId.get(i.id) ?? i.price) * i.qty, 0);
  }, [cart, catalog]);

  const applyPromo = useCallback(
    async (code: string): Promise<PromoResult> => {
      const clean = code.trim();
      if (!clean) return { ok: false, reason: "Enter a promo code." };
      if (subtotal <= 0) return { ok: false, reason: "Your cart is empty." };
      try {
        const res = await socketClient.request<{ ok: boolean; discount: number; code?: string; reason?: string }>(
          "promos:validate",
          { code: clean, subtotalUsd: subtotal },
        );
        if (!res.ok) {
          setPromoCode(null);
          setPromoDiscount(0);
          return { ok: false, reason: res.reason ?? "Invalid code." };
        }
        setPromoCode(res.code ?? clean.toUpperCase());
        setPromoDiscount(res.discount);
        return { ok: true };
      } catch (e) {
        return { ok: false, reason: (e as Error).message };
      }
    },
    [subtotal],
  );

  const removePromo = useCallback(() => {
    setPromoCode(null);
    setPromoDiscount(0);
  }, []);

  // Re-check the code whenever the cart total changes (or after a reload / sign-in),
  // so the discount shown is always the one the server will apply.
  useEffect(() => {
    if (!hydrated || rt.status !== "connected") return;
    const code = promoCode ?? restoredPromo.current;
    if (!code) return;
    if (!rt.user) return;
    if (subtotal <= 0) {
      restoredPromo.current = null;
      return;
    }
    restoredPromo.current = null;
    let alive = true;
    socketClient
      .request<{ ok: boolean; discount: number; code?: string }>("promos:validate", { code, subtotalUsd: subtotal })
      .then((res) => {
        if (!alive) return;
        if (res.ok) {
          setPromoCode(res.code ?? code);
          setPromoDiscount(res.discount);
        } else {
          setPromoCode(null);
          setPromoDiscount(0);
        }
      })
      .catch(() => {
        /* keep what we have; the order is re-validated by the server anyway */
      });
    return () => {
      alive = false;
    };
  }, [hydrated, rt.status, rt.user, subtotal, promoCode]);

  const toggleFollowStore = useCallback((storeName: string) => {
    setFollowedStores((prev) =>
      prev.includes(storeName) ? prev.filter((s) => s !== storeName) : [...prev, storeName],
    );
  }, []);

  const isFollowingStore = useCallback(
    (storeName: string) => followedStores.includes(storeName),
    [followedStores],
  );

  const addRecentlyViewed = useCallback((productId: string) => {
    setRecentlyViewed((prev) => {
      if (prev[0] === productId) return prev;
      return [productId, ...prev.filter((id) => id !== productId)].slice(0, 12);
    });
  }, []);

  const setZoneId = useCallback((z: string | null) => setZoneIdState(z), []);

  const cartCount = cart.reduce((s, i) => s + i.qty, 0);

  return (
    <ShopContext.Provider
      value={{
        cart,
        wishlist,
        followedStores,
        promoCode,
        promoDiscount,
        zoneId,
        setZoneId,
        addToCart,
        removeFromCart,
        updateQty,
        clearCart,
        cartCount,
        toggleWishlist,
        isInWishlist,
        moveToWishlist,
        applyPromo,
        removePromo,
        toggleFollowStore,
        isFollowingStore,
        recentlyViewed,
        addRecentlyViewed,
      }}
    >
      {children}
    </ShopContext.Provider>
  );
}

export function useShop() {
  const ctx = useContext(ShopContext);
  if (!ctx) throw new Error("useShop must be used within ShopProvider");
  return ctx;
}

export type CartLine = CartItem & {
  /** Live unit price from the catalogue (falls back to the price saved in the cart). */
  livePrice: number;
  stock: number | null;
  /** The product is no longer live in the catalogue. */
  unavailable: boolean;
};

/** Cart lines enriched with the live catalogue (price, stock, availability). */
export function useCartLines(): { lines: CartLine[]; subtotal: number; hasUnavailable: boolean } {
  const { cart } = useShop();
  const rt = useRealtime();
  const catalog = useCatalog();
  return useMemo(() => {
    const byId = new Map(catalog.map((p) => [p.id, p]));
    const catalogReady = rt.status === "connected" && catalog.length > 0;
    const lines = cart.map<CartLine>((i) => {
      const p = byId.get(i.id);
      return {
        ...i,
        livePrice: p ? p.price : i.price,
        stock: p ? p.stock : null,
        unavailable: catalogReady && (!p || p.stock <= 0),
      };
    });
    return {
      lines,
      subtotal: lines.reduce((s, l) => s + l.livePrice * l.qty, 0),
      hasUnavailable: lines.some((l) => l.unavailable),
    };
  }, [cart, catalog, rt.status]);
}
