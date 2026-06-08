"use client";

import { createContext, useContext, useState, useCallback } from "react";
import { products } from "@/lib/mock-data";
import { MOCK_PROMOS } from "@/lib/shared-entities";

export type CartItem = {
  id: number;
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
  wishlist: number[];
  followedStores: string[];
  promoCode: string | null;
  promoDiscount: number;
  addToCart: (item: Omit<CartItem, "qty"> & { qty?: number }) => void;
  removeFromCart: (id: number, variant: string) => void;
  updateQty: (id: number, variant: string, qty: number) => void;
  cartCount: number;
  toggleWishlist: (productId: number) => void;
  isInWishlist: (productId: number) => boolean;
  moveToWishlist: (id: number, variant: string) => void;
  applyPromo: (code: string) => boolean;
  removePromo: () => void;
  toggleFollowStore: (storeName: string) => void;
  isFollowingStore: (storeName: string) => boolean;
  recentlyViewed: number[];
  addRecentlyViewed: (productId: number) => void;
};

const defaultCart: CartItem[] = [
  { ...products[0], qty: 1, variant: "256GB Black" },
  { ...products[2], qty: 2, variant: "White" },
];

const ShopContext = createContext<ShopContextType | null>(null);

export function ShopProvider({ children }: { children: React.ReactNode }) {
  const [cart, setCart] = useState<CartItem[]>(defaultCart);
  const [wishlist, setWishlist] = useState<number[]>([1, 3]);
  const [followedStores, setFollowedStores] = useState<string[]>([]);
  const [promoCode, setPromoCode] = useState<string | null>(null);
  const [promoDiscount, setPromoDiscount] = useState(0);
  const [recentlyViewed, setRecentlyViewed] = useState<number[]>([1, 3, 5]);

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

  const removeFromCart = useCallback((id: number, variant: string) => {
    setCart((prev) => prev.filter((x) => !(x.id === id && x.variant === variant)));
  }, []);

  const updateQty = useCallback((id: number, variant: string, qty: number) => {
    setCart((prev) =>
      prev.map((x) => (x.id === id && x.variant === variant ? { ...x, qty } : x))
    );
  }, []);

  const toggleWishlist = useCallback((productId: number) => {
    setWishlist((prev) =>
      prev.includes(productId) ? prev.filter((x) => x !== productId) : [...prev, productId]
    );
  }, []);

  const isInWishlist = useCallback(
    (productId: number) => wishlist.includes(productId),
    [wishlist]
  );

  const moveToWishlist = useCallback((id: number, variant: string) => {
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

  const addRecentlyViewed = useCallback((productId: number) => {
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
