"use client";

import { createContext, useContext, useState, useCallback } from "react";
import { MOCK_PROMOS } from "@/lib/shared-entities";

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

type ShopContextType = {
  cart: CartItem[];
  wishlist: string[];
  followedStores: string[];
  promoCode: string | null;
  promoDiscount: number;
  addToCart: (item: Omit<CartItem, "qty"> & { qty?: number }) => void;
  removeFromCart: (id: string, variant: string) => void;
  updateQty: (id: string, variant: string, qty: number) => void;
  cartCount: number;
  toggleWishlist: (productId: string) => void;
  isInWishlist: (productId: string) => boolean;
  moveToWishlist: (id: string, variant: string) => void;
  applyPromo: (code: string) => boolean;
  removePromo: () => void;
  toggleFollowStore: (storeName: string) => void;
  isFollowingStore: (storeName: string) => boolean;
  recentlyViewed: string[];
  addRecentlyViewed: (productId: string) => void;
};

const ShopContext = createContext<ShopContextType | null>(null);

export function ShopProvider({ children }: { children: React.ReactNode }) {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [wishlist, setWishlist] = useState<string[]>([]);
  const [followedStores, setFollowedStores] = useState<string[]>([]);
  const [promoCode, setPromoCode] = useState<string | null>(null);
  const [promoDiscount, setPromoDiscount] = useState(0);
  const [recentlyViewed, setRecentlyViewed] = useState<string[]>([]);

  const addToCart = useCallback((item: Omit<CartItem, "qty"> & { qty?: number }) => {
    setCart((prev) => {
      const existing = prev.find((x) => x.id === item.id && x.variant === item.variant);
      if (existing) {
        return prev.map((x) =>
          x.id === item.id && x.variant === item.variant
            ? { ...x, qty: x.qty + (item.qty ?? 1) }
            : x
        );
      }
      return [...prev, { ...item, qty: item.qty ?? 1 }];
    });
  }, []);

  const removeFromCart = useCallback((id: string, variant: string) => {
    setCart((prev) => prev.filter((x) => !(x.id === id && x.variant === variant)));
  }, []);

  const updateQty = useCallback((id: string, variant: string, qty: number) => {
    setCart((prev) =>
      prev.map((x) => (x.id === id && x.variant === variant ? { ...x, qty } : x))
    );
  }, []);

  const toggleWishlist = useCallback((productId: string) => {
    setWishlist((prev) =>
      prev.includes(productId) ? prev.filter((x) => x !== productId) : [...prev, productId]
    );
  }, []);

  const isInWishlist = useCallback(
    (productId: string) => wishlist.includes(productId),
    [wishlist]
  );

  const moveToWishlist = useCallback((id: string, variant: string) => {
    setCart((prev) => {
      const item = prev.find((x) => x.id === id && x.variant === variant);
      if (item) setWishlist((w) => (w.includes(id) ? w : [...w, id]));
      return prev.filter((x) => !(x.id === id && x.variant === variant));
    });
  }, []);

  const applyPromo = useCallback((code: string) => {
    const promo = MOCK_PROMOS.find((p) => p.code.toUpperCase() === code.toUpperCase());
    if (!promo) return false;
    const subtotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
    if (promo.minOrder && subtotal < promo.minOrder) return false;
    const discount = promo.type === "percent" ? Math.round(subtotal * (promo.value / 100)) : promo.value;
    setPromoCode(promo.code);
    setPromoDiscount(discount);
    return true;
  }, [cart]);

  const removePromo = useCallback(() => {
    setPromoCode(null);
    setPromoDiscount(0);
  }, []);

  const toggleFollowStore = useCallback((storeName: string) => {
    setFollowedStores((prev) =>
      prev.includes(storeName) ? prev.filter((s) => s !== storeName) : [...prev, storeName]
    );
  }, []);

  const isFollowingStore = useCallback(
    (storeName: string) => followedStores.includes(storeName),
    [followedStores]
  );

  const addRecentlyViewed = useCallback((productId: string) => {
    setRecentlyViewed((prev) => [productId, ...prev.filter((id) => id !== productId)].slice(0, 12));
  }, []);

  const cartCount = cart.reduce((s, i) => s + i.qty, 0);

  return (
    <ShopContext.Provider
      value={{
        cart,
        wishlist,
        followedStores,
        promoCode,
        promoDiscount,
        addToCart,
        removeFromCart,
        updateQty,
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
