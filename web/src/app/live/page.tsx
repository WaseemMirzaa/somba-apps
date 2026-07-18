"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  Bell,
  CheckCircle2,
  CreditCard,
  MapPin,
  Package,
  Radio,
  RotateCcw,
  Truck,
  Wallet,
  Wifi,
  WifiOff,
} from "lucide-react";
import { useRealtime } from "@/context/realtime-context";
import { socketClient } from "@/lib/realtime/socket-client";
import type {
  DeliveryStatus,
  DeliveryTask,
  OrderStatus,
} from "@/lib/realtime/types";

const DEMO_ACCOUNTS = [
  { label: "Customer", email: "customer@somba.app" },
  { label: "Admin", email: "admin@somba.app" },
  { label: "Warehouse", email: "warehouse@somba.app" },
  { label: "Rider", email: "rider@somba.app" },
];
const DEMO_PASSWORD = "Somba@2026";

const NEXT_ORDER_STATUS: Record<string, OrderStatus[]> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["processing"],
  processing: ["shipped"],
  shipped: ["out_for_delivery"],
  out_for_delivery: ["delivered"],
};

const NEXT_DELIVERY_STATUS: Record<string, DeliveryStatus[]> = {
  assigned: ["picked_up"],
  picked_up: ["in_transit"],
  in_transit: ["delivered", "failed"],
};

function StatusPill({ status }: { status: string }) {
  const tone =
    status === "delivered"
      ? "bg-emerald-100 text-emerald-700"
      : status === "cancelled" || status === "failed"
        ? "bg-rose-100 text-rose-700"
        : status === "pending" || status === "unassigned"
          ? "bg-amber-100 text-amber-700"
          : "bg-sky-100 text-sky-700";
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${tone}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

export default function LiveConsolePage() {
  const rt = useRealtime();
  const [email, setEmail] = useState("customer@somba.app");
  const [password, setPassword] = useState(DEMO_PASSWORD);
  const [busy, setBusy] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [unassigned, setUnassigned] = useState<DeliveryTask[]>([]);
  const [newProduct, setNewProduct] = useState({
    name: "",
    price: "",
    category: "Electronics",
    stock: "10",
  });

  const isAdmin = rt.user?.role.startsWith("admin") || rt.user?.role === "warehouse_staff";
  const isRider = rt.user?.role === "rider";
  const isCustomer = rt.user?.role === "customer";
  const isSeller = rt.user?.role === "seller";
  const canRefund =
    rt.user?.role === "admin" || rt.user?.role === "admin_finance";

  const doLogin = useCallback(
    async (e: string) => {
      setBusy(true);
      setLoginError(null);
      try {
        await rt.login(e, password);
      } catch (err) {
        setLoginError((err as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [rt, password],
  );

  const refreshUnassigned = useCallback(async () => {
    if (!isRider) return;
    try {
      setUnassigned(await socketClient.request<DeliveryTask[]>("delivery:unassigned"));
    } catch {
      /* ignore */
    }
  }, [isRider]);

  // Riders: keep the unassigned pool fresh as orders stream in.
  useEffect(() => {
    if (!isRider || rt.status !== "connected") return;
    refreshUnassigned();
  }, [isRider, rt.status, rt.orders.length, refreshUnassigned]);

  const placeTestOrder = useCallback(
    async (paymentMethod: "cod" | "wallet") => {
      const p = rt.products[0];
      if (!p) return;
      setBusy(true);
      try {
        await rt.placeOrder({
          items: [{ productId: p.id, qty: 1 }],
          paymentMethod,
          deliveryFeeUsd: 3,
          shippingAddress: JSON.stringify({
            city: "Kinshasa",
            line1: "12 Ave du Commerce",
          }),
        });
      } catch (e) {
        alert((e as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [rt],
  );

  const topUp = useCallback(async () => {
    setBusy(true);
    try {
      await rt.topUpWallet(50, "airtel_money");
    } finally {
      setBusy(false);
    }
  }, [rt]);

  const requestPayout = useCallback(async () => {
    setBusy(true);
    try {
      await rt.requestPayout(100, "bank");
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [rt]);

  const openReturn = useCallback(
    async (orderId: string) => {
      setBusy(true);
      try {
        await rt.openDispute(orderId, "return", "Item not as described");
      } catch (e) {
        alert((e as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [rt],
  );

  const publishProduct = useCallback(async () => {
    if (!newProduct.name || !newProduct.price) return;
    setBusy(true);
    try {
      await rt.createProduct({
        name: newProduct.name,
        price: Number(newProduct.price),
        category: newProduct.category,
        stock: Number(newProduct.stock) || 0,
      });
      setNewProduct({ name: "", price: "", category: "Electronics", stock: "10" });
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [rt, newProduct]);

  const streamLocation = useCallback(
    async (task: DeliveryTask) => {
      // Simulate a few GPS pings the customer will see live.
      const base = { lat: -4.325, lng: 15.322 };
      for (let i = 0; i < 5; i++) {
        await rt.sendLocation(
          task.id,
          base.lat + i * 0.001,
          base.lng + i * 0.001,
        );
        await new Promise((r) => setTimeout(r, 600));
      }
    },
    [rt],
  );

  const connectionBadge = useMemo(() => {
    const map = {
      connected: { icon: Wifi, text: "Live", cls: "text-emerald-600" },
      connecting: { icon: Radio, text: "Connecting…", cls: "text-amber-600" },
      disconnected: { icon: WifiOff, text: "Offline", cls: "text-slate-400" },
      error: { icon: WifiOff, text: "Error", cls: "text-rose-600" },
    } as const;
    return map[rt.status];
  }, [rt.status]);

  // ---- Not signed in: login panel ----
  if (!rt.user) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 p-6">
        <div className="text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-600 text-white">
            <Activity className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Realtime Console</h1>
          <p className="mt-1 text-sm text-slate-500">
            Live WebSocket link to the Somba&amp;Teka backend. Sign in as any
            role — orders, deliveries and notifications update instantly across
            web and mobile.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <label className="mb-1 block text-xs font-semibold text-slate-600">
            Email
          </label>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mb-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <label className="mb-1 block text-xs font-semibold text-slate-600">
            Password
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mb-4 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <button
            onClick={() => doLogin(email)}
            disabled={busy}
            className="w-full rounded-lg bg-sky-600 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy ? "Signing in…" : "Sign in"}
          </button>
          {loginError && (
            <p className="mt-2 text-center text-xs text-rose-600">{loginError}</p>
          )}
          <p className="mt-4 text-center text-xs text-slate-400">
            Quick sign-in (password {DEMO_PASSWORD})
          </p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {DEMO_ACCOUNTS.map((a) => (
              <button
                key={a.email}
                onClick={() => {
                  setEmail(a.email);
                  doLogin(a.email);
                }}
                disabled={busy}
                className="rounded-lg border border-slate-200 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                {a.label}
              </button>
            ))}
          </div>
        </div>
      </main>
    );
  }

  const Badge = connectionBadge.icon;

  // ---- Signed in: role-adaptive live dashboard ----
  return (
    <main className="mx-auto max-w-5xl p-4 sm:p-6">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold text-slate-900">{rt.user.name}</h1>
            <StatusPill status={rt.user.role} />
          </div>
          <p className="text-xs text-slate-500">{rt.user.email}</p>
        </div>
        <div className="flex items-center gap-4">
          <span className={`flex items-center gap-1.5 text-sm font-semibold ${connectionBadge.cls}`}>
            <Badge className="h-4 w-4" /> {connectionBadge.text}
          </span>
          <span className="relative flex items-center gap-1.5 text-sm text-slate-600">
            <Bell className="h-4 w-4" />
            {rt.unreadCount > 0 && (
              <span className="absolute -right-2 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
                {rt.unreadCount}
              </span>
            )}
          </span>
          <button
            onClick={rt.logout}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            Sign out
          </button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* Customer: wallet */}
          {isCustomer && (
            <section className="rounded-2xl border border-slate-200 bg-gradient-to-br from-sky-600 to-indigo-600 p-4 text-white shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="flex items-center gap-1.5 text-xs font-medium text-sky-100">
                    <Wallet className="h-4 w-4" /> Wallet balance
                  </p>
                  <p className="mt-1 text-3xl font-bold">
                    ${rt.walletBalance.toFixed(2)}
                  </p>
                </div>
                <button
                  onClick={topUp}
                  disabled={busy}
                  className="rounded-lg bg-white/15 px-3 py-2 text-xs font-semibold backdrop-blur hover:bg-white/25 disabled:opacity-50"
                >
                  + Top up $50
                </button>
              </div>
              {rt.walletTransactions.length > 0 && (
                <div className="mt-3 space-y-1 border-t border-white/20 pt-2 text-xs text-sky-50">
                  {rt.walletTransactions.slice(0, 3).map((t) => (
                    <div key={t.id} className="flex justify-between">
                      <span>{t.description}</span>
                      <span className="font-semibold">
                        {t.type === "debit" ? "-" : "+"}${t.amount.toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* Customer: place an order */}
          {isCustomer && (
            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="flex items-center gap-2 font-semibold text-slate-800">
                  <Package className="h-4 w-4" /> Storefront
                </h2>
                <div className="flex gap-2">
                  <button
                    onClick={() => placeTestOrder("cod")}
                    disabled={busy || !rt.products.length}
                    className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                  >
                    Order (COD)
                  </button>
                  <button
                    onClick={() => placeTestOrder("wallet")}
                    disabled={busy || !rt.products.length}
                    className="flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                  >
                    <Wallet className="h-3 w-3" /> Pay w/ wallet
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {rt.products.slice(0, 6).map((p) => (
                  <div
                    key={p.id}
                    className="rounded-lg border border-slate-100 p-2 text-xs"
                  >
                    <p className="line-clamp-2 font-medium text-slate-700">
                      {p.name}
                    </p>
                    <p className="mt-1 text-slate-500">
                      ${p.price} · stock {p.stock}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Seller: publish a product (appears live in customers' storefronts) */}
          {isSeller && (
            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="mb-3 flex items-center gap-2 font-semibold text-slate-800">
                <Package className="h-4 w-4" /> Publish a product
              </h2>
              <div className="grid grid-cols-2 gap-2">
                <input
                  placeholder="Product name"
                  value={newProduct.name}
                  onChange={(e) =>
                    setNewProduct((p) => ({ ...p, name: e.target.value }))
                  }
                  className="col-span-2 rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
                <input
                  placeholder="Price (USD)"
                  type="number"
                  value={newProduct.price}
                  onChange={(e) =>
                    setNewProduct((p) => ({ ...p, price: e.target.value }))
                  }
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
                <input
                  placeholder="Stock"
                  type="number"
                  value={newProduct.stock}
                  onChange={(e) =>
                    setNewProduct((p) => ({ ...p, stock: e.target.value }))
                  }
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
                <select
                  value={newProduct.category}
                  onChange={(e) =>
                    setNewProduct((p) => ({ ...p, category: e.target.value }))
                  }
                  className="col-span-2 rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  {["Electronics", "Fashion", "Jewelery", "Home & Living", "Beauty"].map(
                    (c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ),
                  )}
                </select>
                <button
                  onClick={publishProduct}
                  disabled={busy || !newProduct.name || !newProduct.price}
                  className="col-span-2 rounded-lg bg-sky-600 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  Publish → live to all shoppers
                </button>
              </div>
              <p className="mt-3 text-xs font-semibold text-slate-500">
                My catalog ({rt.products.filter((p) => p.sellerName === rt.user?.name).length})
              </p>
              <div className="mt-1 space-y-1">
                {rt.products
                  .filter((p) => p.sellerName === rt.user?.name)
                  .slice(0, 8)
                  .map((p) => (
                    <div
                      key={p.id}
                      className="flex justify-between rounded-lg border border-slate-100 px-2 py-1 text-xs"
                    >
                      <span className="text-slate-700">{p.name}</span>
                      <span className="text-slate-500">
                        ${p.price} · stock {p.stock}
                      </span>
                    </div>
                  ))}
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                  <Wallet className="h-4 w-4" /> Payouts
                </h3>
                <button
                  onClick={requestPayout}
                  disabled={busy}
                  className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                >
                  Request $100 payout
                </button>
              </div>
              <div className="mt-2 space-y-1">
                {rt.payouts.length === 0 && (
                  <p className="text-xs text-slate-400">No payouts yet.</p>
                )}
                {rt.payouts.slice(0, 6).map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between rounded-lg border border-slate-100 px-2 py-1 text-xs"
                  >
                    <span className="text-slate-700">
                      {p.reference} · ${p.amountUsd.toFixed(2)}
                    </span>
                    <StatusPill status={p.status} />
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Orders (role-scoped) */}
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-3 flex items-center gap-2 font-semibold text-slate-800">
              <Activity className="h-4 w-4" />
              {isCustomer ? "My orders" : "All orders"}
              <span className="ml-auto text-xs font-normal text-slate-400">
                live
              </span>
            </h2>
            <div className="space-y-2">
              {rt.orders.length === 0 && (
                <p className="py-6 text-center text-sm text-slate-400">
                  No orders yet.
                </p>
              )}
              {rt.orders.map((o) => {
                const loc = rt.riderLocations[o.id];
                return (
                  <div
                    key={o.id}
                    className="rounded-lg border border-slate-100 p-3"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-slate-800">
                          {o.reference}
                        </p>
                        <p className="text-xs text-slate-500">
                          {o.customerName} · ${o.totalUsd.toFixed(2)} ·{" "}
                          {o.paymentMethod}
                        </p>
                      </div>
                      <StatusPill status={o.status} />
                    </div>
                    {loc && (
                      <p className="mt-1 flex items-center gap-1 text-xs text-emerald-600">
                        <MapPin className="h-3 w-3" /> rider @ {loc.lat.toFixed(3)},{" "}
                        {loc.lng.toFixed(3)}
                      </p>
                    )}
                    {isCustomer &&
                      (o.status === "delivered" ||
                        o.status === "out_for_delivery" ||
                        o.status === "confirmed") && (
                        <button
                          onClick={() => openReturn(o.id)}
                          disabled={busy}
                          className="mt-2 flex items-center gap-1 rounded-md border border-amber-300 px-2 py-1 text-[11px] font-medium text-amber-700 hover:bg-amber-50 disabled:opacity-50"
                        >
                          <RotateCcw className="h-3 w-3" /> Open return
                        </button>
                      )}
                    {isAdmin && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {(NEXT_ORDER_STATUS[o.status] ?? []).map((s) => (
                          <button
                            key={s}
                            onClick={() => rt.updateOrderStatus(o.id, s)}
                            className="rounded-md bg-slate-800 px-2 py-1 text-[11px] font-medium text-white hover:bg-slate-700"
                          >
                            → {s.replace(/_/g, " ")}
                          </button>
                        ))}
                        {(canRefund) &&
                          o.status !== "returned" &&
                          o.status !== "cancelled" && (
                            <button
                              onClick={() => rt.refundOrder(o.id, true)}
                              className="flex items-center gap-1 rounded-md border border-rose-300 px-2 py-1 text-[11px] font-medium text-rose-700 hover:bg-rose-50"
                            >
                              <RotateCcw className="h-3 w-3" /> Refund → wallet
                            </button>
                          )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          {/* Rider: deliveries */}
          {isRider && (
            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="mb-3 flex items-center gap-2 font-semibold text-slate-800">
                <Truck className="h-4 w-4" /> Deliveries
              </h2>
              {unassigned.length > 0 && (
                <div className="mb-3">
                  <p className="mb-1 text-xs font-semibold text-slate-500">
                    Unassigned pool
                  </p>
                  {unassigned.map((t) => (
                    <div
                      key={t.id}
                      className="mb-1 flex items-center justify-between rounded-lg border border-amber-100 bg-amber-50 p-2 text-xs"
                    >
                      <span>
                        {t.orderReference} · COD ${t.codAmountUsd.toFixed(2)}
                      </span>
                      <button
                        onClick={async () => {
                          await rt.acceptDelivery(t.id);
                          refreshUnassigned();
                        }}
                        className="rounded-md bg-emerald-600 px-2 py-1 font-medium text-white"
                      >
                        Accept
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {rt.deliveries.map((t) => (
                <div
                  key={t.id}
                  className="mb-1 rounded-lg border border-slate-100 p-2 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-slate-700">
                      {t.orderReference}
                    </span>
                    <StatusPill status={t.status} />
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {(NEXT_DELIVERY_STATUS[t.status] ?? []).map((s) => (
                      <button
                        key={s}
                        onClick={() => rt.updateDeliveryStatus(t.id, s)}
                        className="rounded-md bg-slate-800 px-2 py-1 font-medium text-white"
                      >
                        → {s.replace(/_/g, " ")}
                      </button>
                    ))}
                    {(t.status === "assigned" ||
                      t.status === "picked_up" ||
                      t.status === "in_transit") && (
                      <button
                        onClick={() => streamLocation(t)}
                        className="rounded-md border border-sky-300 px-2 py-1 font-medium text-sky-700"
                      >
                        Stream GPS
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </section>
          )}
        </div>

        {/* Notifications feed */}
        <aside className="space-y-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="flex items-center gap-2 font-semibold text-slate-800">
            <Bell className="h-4 w-4" /> Notifications
          </h2>
          {rt.notifications.length === 0 && (
            <p className="py-6 text-center text-sm text-slate-400">
              Nothing yet.
            </p>
          )}
          {rt.notifications.slice(0, 20).map((n) => (
            <button
              key={n.id}
              onClick={() => rt.markRead(n.id)}
              className={`block w-full rounded-lg border p-2 text-left text-xs ${
                n.read
                  ? "border-slate-100 bg-white"
                  : "border-sky-200 bg-sky-50"
              }`}
            >
              <div className="flex items-center gap-1.5 font-semibold text-slate-800">
                {!n.read && <CheckCircle2 className="h-3 w-3 text-sky-500" />}
                {n.title}
              </div>
              <p className="text-slate-500">{n.body}</p>
            </button>
          ))}

          {rt.payments.length > 0 && (
            <>
              <h2 className="mt-4 flex items-center gap-2 border-t border-slate-100 pt-3 font-semibold text-slate-800">
                <CreditCard className="h-4 w-4" /> Payments
              </h2>
              {rt.payments.slice(0, 12).map((p) => (
                <div
                  key={p.id}
                  className="rounded-lg border border-slate-100 p-2 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-700">
                      {p.orderReference}
                    </span>
                    <StatusPill status={p.status} />
                  </div>
                  <p className="text-slate-500">
                    ${p.amountUsd.toFixed(2)} · {p.method.replace(/_/g, " ")}
                  </p>
                </div>
              ))}
            </>
          )}

          {/* Finance: approve/reject payouts */}
          {canRefund && rt.payouts.length > 0 && (
            <>
              <h2 className="mt-4 flex items-center gap-2 border-t border-slate-100 pt-3 font-semibold text-slate-800">
                <Wallet className="h-4 w-4" /> Payout requests
              </h2>
              {rt.payouts.slice(0, 10).map((p) => (
                <div
                  key={p.id}
                  className="rounded-lg border border-slate-100 p-2 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-700">
                      {p.sellerName} · ${p.amountUsd.toFixed(2)}
                    </span>
                    <StatusPill status={p.status} />
                  </div>
                  {p.status === "requested" && (
                    <div className="mt-1 flex gap-1.5">
                      <button
                        onClick={() => rt.approvePayout(p.id)}
                        className="rounded-md bg-emerald-600 px-2 py-1 font-medium text-white"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => rt.rejectPayout(p.id, "Declined")}
                        className="rounded-md border border-slate-200 px-2 py-1 font-medium text-slate-600"
                      >
                        Reject
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </>
          )}

          {/* Disputes / returns */}
          {rt.disputes.length > 0 && (
            <>
              <h2 className="mt-4 flex items-center gap-2 border-t border-slate-100 pt-3 font-semibold text-slate-800">
                <RotateCcw className="h-4 w-4" /> Disputes / returns
              </h2>
              {rt.disputes.slice(0, 10).map((d) => (
                <div
                  key={d.id}
                  className="rounded-lg border border-slate-100 p-2 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-700">
                      {d.orderReference} · {d.type}
                    </span>
                    <StatusPill status={d.status} />
                  </div>
                  <p className="text-slate-500">{d.reason}</p>
                  {isAdmin && d.status === "open" && (
                    <div className="mt-1 flex gap-1.5">
                      <button
                        onClick={() => rt.resolveDispute(d.id, true)}
                        className="rounded-md bg-emerald-600 px-2 py-1 font-medium text-white"
                      >
                        Resolve + refund
                      </button>
                      <button
                        onClick={() => rt.resolveDispute(d.id, false)}
                        className="rounded-md border border-slate-200 px-2 py-1 font-medium text-slate-600"
                      >
                        Resolve
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </>
          )}
        </aside>
      </div>
    </main>
  );
}
