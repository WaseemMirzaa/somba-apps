import type { Order, TrackingLegView } from "@/lib/realtime/types";
import type { Step, StepState } from "@/lib/after-sale";
import type { PublicHub } from "@/lib/shop-engage";

/**
 * The parcel's journey as the customer can follow it: seller -> origin warehouse -> (transfer) -> destination
 * warehouse -> the customer. The customer only receives the order (status, per-seller line state, the origin /
 * destination warehouse ids), not the delivery legs, so each step is derived from those:
 *
 *  - a seller's pickup: line `fulfilment` open -> ready (a rider is collecting) -> received (scanned in at the origin);
 *  - everything at a warehouse = order `shipped`; a rider is on the way = `out_for_delivery`; then `delivered`.
 *
 * When the order carries `tracking.legs`, every transfer leg is one hop of the route and gets its own steps
 * ("In transfer to Entrepôt Kinshasa", "At Entrepôt Kinshasa", …); each hop has its own driver. An order without
 * transfer legs keeps the single "Transfer origin → destination" step.
 */
export function customerJourney(
  order: Pick<Order, "status" | "items" | "originHubIds" | "destinationHubId" | "createdAt" | "updatedAt"> & Partial<Pick<Order, "tracking">>,
  hubs: Map<string, PublicHub>,
  fr: boolean,
): Step[] {
  const t = (en: string, frT: string) => (fr ? frT : en);
  const hubName = (id: string | null | undefined) => (id ? hubs.get(id)?.name ?? t("a warehouse", "un entrepôt") : t("a warehouse", "un entrepôt"));
  const status = order.status;
  const ended = status === "cancelled" || status === "returned";
  const rank = ["pending", "confirmed", "processing", "shipped", "out_for_delivery", "delivered"].indexOf(status);

  // Sellers in the order they first appear on the order: the same order as `originHubIds`.
  const sellers: { id: string; name: string; lines: Order["items"] }[] = [];
  for (const it of order.items ?? []) {
    const key = it.sellerId ?? "none";
    let s = sellers.find((x) => x.id === key);
    if (!s) {
      s = { id: key, name: it.sellerName ?? "Somba&Teka", lines: [] };
      sellers.push(s);
    }
    s.lines.push(it);
  }

  const steps: Step[] = [];
  steps.push({ key: "placed", label: t("Order confirmed", "Commande confirmée"), state: rank >= 1 || ended ? "done" : "current", at: order.createdAt });

  const dest = order.destinationHubId ?? null;
  const origins = order.originHubIds ?? [];
  sellers.forEach((s) => {
    const live = s.lines.filter((l) => l.fulfilment !== "cancelled");
    if (live.length === 0) {
      steps.push({ key: `pickup-${s.id}`, label: t(`${s.name}: parcel cancelled by the seller`, `${s.name} : colis annulé par le vendeur`), state: "bad" });
      return;
    }
    // `originHubIds` is one per seller, but the order's lines come back in a different order than the one the
    // hubs were computed in, so a seller can only be tied to its warehouse when every seller shares one.
    const uniqueOrigins = [...new Set(origins.filter(Boolean))];
    const origin = uniqueOrigins.length === 1 ? uniqueOrigins[0] : uniqueOrigins.length === 0 ? dest : null;
    const originText = origin ? hubName(origin) : t("its origin warehouse", "son entrepôt d'origine");
    const allReceived = live.every((l) => l.fulfilment === "received") || rank >= 3;
    const anyReady = live.some((l) => l.fulfilment === "ready" || l.fulfilment === "received");
    const state: StepState = allReceived ? "done" : anyReady || rank >= 2 ? "current" : rank >= 1 ? "current" : "todo";
    steps.push({
      key: `pickup-${s.id}`,
      label: t(`${s.name} → ${originText}: pickup`, `${s.name} → ${originText} : collecte`),
      hint: allReceived ? undefined : anyReady ? t("A rider is collecting the parcel.", "Un livreur collecte le colis.") : t("The seller is packing your order.", "Le vendeur prépare votre commande."),
      state: ended ? (allReceived ? "done" : "todo") : state,
    });
  });

  const hopLegs = transferLegs(order.tracking?.legs);
  const transfer = origins.some((o) => o && dest && o !== dest);
  if (hopLegs.length > 0) {
    hopSteps(hopLegs, { hubName, t, ended, rank, dest }).forEach((st) => steps.push(st));
  } else if (transfer) {
    const from = origins.filter((o) => o && o !== dest).map((o) => hubName(o));
    steps.push({
      key: "transfer",
      label: t(`Transfer ${[...new Set(from)].join(", ")} → ${hubName(dest)}`, `Transfert ${[...new Set(from)].join(", ")} → ${hubName(dest)}`),
      state: ended ? "todo" : rank >= 4 ? "done" : rank === 3 ? "current" : "todo",
    });
  }
  const transfersDone = hopLegs.every((l) => l.status === "delivered");
  steps.push({
    key: "warehouse",
    label: t(`At ${hubName(dest)}, ready to leave`, `À ${hubName(dest)}, prêt au départ`),
    state: ended ? "todo" : rank >= 4 ? "done" : rank === 3 && transfersDone ? "current" : "todo",
  });
  steps.push({
    key: "delivery",
    label: t(`Out for delivery from ${hubName(dest)}`, `En livraison depuis ${hubName(dest)}`),
    state: ended ? "todo" : rank >= 5 ? "done" : rank === 4 ? "current" : "todo",
  });
  steps.push({
    key: "delivered",
    label: t("Delivered to you", "Livré chez vous"),
    state: status === "delivered" || status === "returned" ? "done" : "todo",
    at: status === "delivered" ? order.updatedAt : null,
  });
  if (status === "cancelled") steps.push({ key: "cancelled", label: t("Order cancelled", "Commande annulée"), state: "bad", at: order.updatedAt });
  if (status === "returned") steps.push({ key: "returned", label: t("Order returned", "Commande retournée"), state: "bad", at: order.updatedAt });
  return steps;
}

/**
 * The hops of one order as steps (staff views): "In transfer to X" per hop with its driver, "At X" between hops.
 * `dest` is the customer's warehouse (its "At …" step is left to the delivery steps).
 */
export function hopRouteSteps(legs: TrackingLegView[], hubName: (id: string | null | undefined) => string, dest: string | null, fr: boolean): Step[] {
  const t = (en: string, frT: string) => (fr ? frT : en);
  return hopSteps(transferLegs(legs), { hubName, t, ended: false, rank: 0, dest });
}

/** The transfer legs of an order in route order (hop 1 first). */
export function transferLegs(legs: TrackingLegView[] | null | undefined): TrackingLegView[] {
  return (legs ?? [])
    .filter((l) => l.kind === "transfer")
    .sort((a, b) => (a.hop ?? 0) - (b.hop ?? 0) || String(a.createdAt).localeCompare(String(b.createdAt)));
}

/**
 * Two steps per hop: "In transfer to X" (its driver named by first name) and, when X is not the customer's warehouse,
 * "At X". The customer's own warehouse closes the journey with the usual "At … ready to leave" step.
 */
function hopSteps(
  legs: TrackingLegView[],
  ctx: { hubName: (id: string | null | undefined) => string; t: (en: string, fr: string) => string; ended: boolean; rank: number; dest: string | null },
): Step[] {
  const { hubName, t, ended, dest } = ctx;
  const out: Step[] = [];
  let firstOpen = true;
  legs.forEach((l, i) => {
    const from = l.fromHubName ?? l.fromHub?.name ?? hubName(l.fromHub?.id);
    const to = l.toHubName ?? l.toHub?.name ?? hubName(l.toHub?.id);
    const hop = l.hop ?? i + 1;
    const hops = l.hops ?? legs.length;
    const moving = l.status === "picked_up" || l.status === "in_transit";
    const done = l.status === "delivered";
    const failed = l.status === "failed";
    let state: Step["state"] = done ? "done" : failed ? "bad" : moving ? "current" : "todo";
    if (!done && !moving && !failed && firstOpen && !ended) state = "current";
    if (!done) firstOpen = false;
    const bits: string[] = [];
    if (hops > 1) bits.push(t(`Hop ${hop} of ${hops}`, `Étape ${hop} sur ${hops}`));
    bits.push(`${from} → ${to}`);
    if (l.riderFirstName) bits.push(t(`driver ${l.riderFirstName}`, `chauffeur ${l.riderFirstName}`));
    else if (!done) bits.push(t("driver not chosen yet", "chauffeur pas encore choisi"));
    if (l.runReference) bits.push(`${t("run", "navette")} ${l.runReference}`);
    if (hop < hops && done === false && hops > legs.length) bits.push(t("more hops follow", "d'autres étapes suivent"));
    out.push({
      key: `hop-${l.id}`,
      label: t(`In transfer to ${to}`, `En transfert vers ${to}`),
      hint: bits.join(" · "),
      state: ended && !done ? "todo" : state,
      at: l.deliveredAt ?? l.pickedUpAt ?? null,
    });
    // The flat shape has names only: the last hop of the chain ends at the customer's warehouse, whatever its name.
    const toId = l.toHub?.id ?? null;
    const lastHop = l.hop != null && l.hops != null && l.hop >= l.hops;
    const atDestination = !!dest && (toId ? toId === dest : lastHop || to === hubName(dest));
    if (!atDestination) {
      out.push({
        key: `at-${l.id}`,
        label: t(`At ${to}`, `À ${to}`),
        state: done ? "done" : "todo",
        at: l.receivedAt ?? l.deliveredAt ?? null,
      });
    }
  });
  return out;
}
