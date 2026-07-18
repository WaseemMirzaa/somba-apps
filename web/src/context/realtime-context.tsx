"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { authApi } from "@/lib/realtime/auth-api";
import { socketClient } from "@/lib/realtime/socket-client";
import type {
  AppNotification,
  BackendUser,
  DeliveryStatus,
  DeliveryTask,
  Order,
  OrderStatus,
  Payment,
  Product,
  RiderLocation,
  WalletTransaction,
} from "@/lib/realtime/types";

type ConnState = "disconnected" | "connecting" | "connected" | "error";

interface RealtimeValue {
  user: BackendUser | null;
  status: ConnState;
  error: string | null;
  orders: Order[];
  products: Product[];
  deliveries: DeliveryTask[];
  notifications: AppNotification[];
  riderLocations: Record<string, RiderLocation>;
  unreadCount: number;
  walletBalance: number;
  walletTransactions: WalletTransaction[];
  payments: Payment[];

  login: (email: string, password: string) => Promise<void>;
  register: (input: {
    email: string;
    password: string;
    name: string;
    role?: string;
    phone?: string;
  }) => Promise<void>;
  logout: () => void;

  placeOrder: (input: {
    items: {
      productId?: string;
      name?: string;
      priceUsd?: number;
      qty: number;
      variant?: string;
    }[];
    paymentMethod: Order["paymentMethod"];
    deliveryFeeUsd?: number;
    zoneId?: string;
    shippingAddress?: string;
  }) => Promise<Order>;
  updateOrderStatus: (orderId: string, status: OrderStatus) => Promise<void>;
  acceptDelivery: (taskId: string) => Promise<void>;
  updateDeliveryStatus: (taskId: string, status: DeliveryStatus) => Promise<void>;
  sendLocation: (taskId: string, lat: number, lng: number) => Promise<void>;
  markRead: (id: string) => Promise<void>;
  topUpWallet: (amountUsd: number, method?: string) => Promise<void>;
  refundOrder: (orderId: string, toWallet?: boolean) => Promise<void>;
}

const RealtimeContext = createContext<RealtimeValue | null>(null);

function upsert<T extends { id: string }>(list: T[], item: T): T[] {
  const idx = list.findIndex((x) => x.id === item.id);
  if (idx === -1) return [item, ...list];
  const next = [...list];
  next[idx] = item;
  return next;
}

export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<BackendUser | null>(null);
  const [status, setStatus] = useState<ConnState>("disconnected");
  const [error, setError] = useState<string | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [deliveries, setDeliveries] = useState<DeliveryTask[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [riderLocations, setRiderLocations] = useState<
    Record<string, RiderLocation>
  >({});
  const [walletBalance, setWalletBalance] = useState(0);
  const [walletTransactions, setWalletTransactions] = useState<
    WalletTransaction[]
  >([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const booted = useRef(false);

  const logout = useCallback(() => {
    authApi.clear();
    socketClient.disconnect();
    setUser(null);
    setStatus("disconnected");
    setOrders([]);
    setDeliveries([]);
    setNotifications([]);
    setRiderLocations({});
    setWalletBalance(0);
    setWalletTransactions([]);
    setPayments([]);
  }, []);

  /** Wire socket listeners + hydrate initial state after connect. */
  const bind = useCallback(async () => {
    const s = socketClient.current;
    if (!s) return;

    s.off();
    s.on("connect", () => setStatus("connected"));
    s.on("disconnect", () => setStatus("connecting"));
    s.on("connect_error", () => setStatus("error"));
    s.on("unauthorized", () => {
      setError("Session expired. Please sign in again.");
      logout();
    });

    // Server pushes — no polling.
    s.on("order:created", (o: Order) => setOrders((cur) => upsert(cur, o)));
    s.on("order:updated", (o: Order) => setOrders((cur) => upsert(cur, o)));
    s.on("delivery:updated", (d: DeliveryTask) =>
      setDeliveries((cur) => upsert(cur, d)),
    );
    s.on("delivery:location", (loc: RiderLocation) =>
      setRiderLocations((cur) => ({ ...cur, [loc.orderId]: loc })),
    );
    s.on("notification:new", (n: AppNotification) =>
      setNotifications((cur) => upsert(cur, n)),
    );
    s.on("product:created", (p: Product) =>
      setProducts((cur) => upsert(cur, p)),
    );
    s.on("product:updated", (p: Product) =>
      setProducts((cur) => upsert(cur, p)),
    );
    s.on("wallet:updated", (w: { balance: number }) =>
      setWalletBalance(w.balance),
    );
    s.on("wallet:transaction", (t: WalletTransaction) =>
      setWalletTransactions((cur) => upsert(cur, t)),
    );
    s.on("payment:created", (p: Payment) =>
      setPayments((cur) => upsert(cur, p)),
    );
    s.on("payment:updated", (p: Payment) =>
      setPayments((cur) => upsert(cur, p)),
    );

    // Initial hydration (one-shot reads over the socket).
    try {
      const [ord, prod, notif] = await Promise.all([
        socketClient.request<Order[]>("orders:list"),
        socketClient.request<Product[]>("products:list"),
        socketClient.request<AppNotification[]>("notifications:list"),
      ]);
      setOrders(ord);
      setProducts(prod);
      setNotifications(notif);
      const del = await socketClient
        .request<DeliveryTask[]>("delivery:list")
        .catch(() => []);
      setDeliveries(del);
      const [wallet, walletTx, pays] = await Promise.all([
        socketClient
          .request<{ balance: number }>("wallet:get")
          .catch(() => ({ balance: 0 })),
        socketClient
          .request<WalletTransaction[]>("wallet:transactions")
          .catch(() => []),
        socketClient.request<Payment[]>("payments:list").catch(() => []),
      ]);
      setWalletBalance(wallet.balance);
      setWalletTransactions(walletTx);
      setPayments(pays);
    } catch {
      /* hydration is best-effort; live events still flow */
    }
  }, [logout]);

  const connectWith = useCallback(
    async (accessToken: string, backendUser: BackendUser) => {
      setStatus("connecting");
      setUser(backendUser);
      const s = socketClient.connect(accessToken);
      s.on("ready", () => setStatus("connected"));
      await bind();
    },
    [bind],
  );

  const login = useCallback(
    async (email: string, password: string) => {
      setError(null);
      const result = await authApi.login(email, password);
      authApi.saveTokens(result);
      await connectWith(result.accessToken, result.user);
    },
    [connectWith],
  );

  const register = useCallback(
    async (input: {
      email: string;
      password: string;
      name: string;
      role?: string;
      phone?: string;
    }) => {
      setError(null);
      const result = await authApi.register(input);
      authApi.saveTokens(result);
      await connectWith(result.accessToken, result.user);
    },
    [connectWith],
  );

  // Restore a session on first mount using the stored refresh token.
  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    const refresh = authApi.getRefresh();
    if (!refresh) return;
    (async () => {
      try {
        const result = await authApi.refresh(refresh);
        authApi.saveTokens(result);
        await connectWith(result.accessToken, result.user);
      } catch {
        authApi.clear();
      }
    })();
  }, [connectWith]);

  const placeOrder = useCallback<RealtimeValue["placeOrder"]>((input) => {
    return socketClient.request<Order>("orders:create", input);
  }, []);

  const updateOrderStatus = useCallback(
    async (orderId: string, statusValue: OrderStatus) => {
      await socketClient.request("orders:updateStatus", {
        orderId,
        status: statusValue,
      });
    },
    [],
  );

  const acceptDelivery = useCallback(async (taskId: string) => {
    await socketClient.request("delivery:accept", { taskId });
    const del = await socketClient
      .request<DeliveryTask[]>("delivery:list")
      .catch(() => []);
    setDeliveries(del);
  }, []);

  const updateDeliveryStatus = useCallback(
    async (taskId: string, statusValue: DeliveryStatus) => {
      await socketClient.request("delivery:updateStatus", {
        taskId,
        status: statusValue,
      });
    },
    [],
  );

  const sendLocation = useCallback(
    async (taskId: string, lat: number, lng: number) => {
      await socketClient.request("delivery:location", { taskId, lat, lng });
    },
    [],
  );

  const markRead = useCallback(async (id: string) => {
    await socketClient.request("notifications:markRead", { id });
    setNotifications((cur) =>
      cur.map((n) => (n.id === id ? { ...n, read: true } : n)),
    );
  }, []);

  const topUpWallet = useCallback(async (amountUsd: number, method?: string) => {
    await socketClient.request("wallet:topup", { amountUsd, method });
    // wallet:updated / wallet:transaction arrive via push.
  }, []);

  const refundOrder = useCallback(
    async (orderId: string, toWallet = true) => {
      await socketClient.request("orders:refund", { orderId, toWallet });
    },
    [],
  );

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications],
  );

  const value = useMemo<RealtimeValue>(
    () => ({
      user,
      status,
      error,
      orders,
      products,
      deliveries,
      notifications,
      riderLocations,
      unreadCount,
      walletBalance,
      walletTransactions,
      payments,
      login,
      register,
      logout,
      placeOrder,
      updateOrderStatus,
      acceptDelivery,
      updateDeliveryStatus,
      sendLocation,
      markRead,
      topUpWallet,
      refundOrder,
    }),
    [
      user,
      status,
      error,
      orders,
      products,
      deliveries,
      notifications,
      riderLocations,
      unreadCount,
      walletBalance,
      walletTransactions,
      payments,
      login,
      register,
      logout,
      placeOrder,
      updateOrderStatus,
      acceptDelivery,
      updateDeliveryStatus,
      sendLocation,
      markRead,
      topUpWallet,
      refundOrder,
    ],
  );

  return (
    <RealtimeContext.Provider value={value}>
      {children}
    </RealtimeContext.Provider>
  );
}

export function useRealtime(): RealtimeValue {
  const ctx = useContext(RealtimeContext);
  if (!ctx) {
    throw new Error("useRealtime must be used within a RealtimeProvider");
  }
  return ctx;
}
