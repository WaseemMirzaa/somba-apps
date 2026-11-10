/**
 * The platform settings of the delivery model (api `settings:set`, validated the same way on the server): how long the route
 * adds to a delivery, when a multi-seller order splits, and express delivery. Labels in English and French, help text, and the
 * range each value must stay in. The admin settings page draws these; the tests check them against the API's ranges.
 *
 * No imports: `npm test` loads this file on its own.
 */

export interface DeliveryModelField {
  key: string;
  kind: "text" | "toggle";
  label: string;
  labelFr: string;
  hint: string;
  hintFr: string;
  inputMode?: "decimal" | "numeric";
  /** Client-side range check (the server checks again and its message is shown). */
  range?: { min: number; max: number; integer?: boolean };
  /** Only shown while express delivery is switched on (the other express fields have nothing to say before that). */
  express?: boolean;
}

export const DELIVERY_MODEL_TITLE = { en: "Delivery model", fr: "Modèle de livraison" };

export const DELIVERY_MODEL_FIELDS: DeliveryModelField[] = [
  {
    key: "localDeliveryDays",
    kind: "text",
    label: "Local delivery days",
    labelFr: "Jours de livraison locale",
    hint: "Whole days 0 to 30 the platform needs from the destination warehouse to the customer. Added to the seller's preparation time to give the delivery date shoppers see.",
    hintFr: "Jours entiers de 0 à 30 dont la plateforme a besoin entre l'entrepôt de destination et le client. S'ajoutent au délai de préparation du vendeur pour donner la date de livraison affichée.",
    inputMode: "numeric",
    range: { min: 0, max: 30, integer: true },
  },
  {
    key: "splitDeliveryAfterHours",
    kind: "text",
    label: "Deliver what arrived after (hours)",
    labelFr: "Livrer ce qui est arrivé après (heures)",
    hint: "Whole hours 0 to 720. A multi-seller order waits for every parcel; once the oldest waiting parcel is older than this, the parcels already at the warehouse go out alone and the rest follows. 0 = never split.",
    hintFr: "Heures entières de 0 à 720. Une commande multi-vendeurs attend tous les colis ; dès que le plus ancien colis en attente dépasse ce délai, les colis déjà à l'entrepôt partent seuls et le reste suit. 0 = ne jamais séparer.",
    inputMode: "numeric",
    range: { min: 0, max: 720, integer: true },
  },
  {
    key: "expressDeliveryEnabled",
    kind: "toggle",
    label: "Express delivery",
    labelFr: "Livraison express",
    hint: "On: when the seller allows it and seller and customer are in the same commune, a rider goes straight from the store to the customer, skipping the warehouse. Turn it on only once the rider app that knows express runs is out.",
    hintFr: "Activé : quand le vendeur l'autorise et que vendeur et client sont dans la même commune, un livreur va directement du magasin au client, sans passer par l'entrepôt. N'activez que lorsque l'application livreur qui gère l'express est disponible.",
  },
  {
    key: "expressDeliveryDays",
    kind: "text",
    label: "Express delivery days",
    labelFr: "Jours de livraison express",
    hint: "Whole days 0 to 30 the platform needs from the seller to the customer on an express order, on top of the seller's preparation time. 0 = same day.",
    hintFr: "Jours entiers de 0 à 30 dont la plateforme a besoin entre le vendeur et le client pour une commande express, en plus du délai de préparation. 0 = le jour même.",
    inputMode: "numeric",
    range: { min: 0, max: 30, integer: true },
    express: true,
  },
  {
    key: "expressBaseUsd",
    kind: "text",
    label: "Express base fee (USD)",
    labelFr: "Frais de base express (USD)",
    hint: "0 to 100. Charged on every express delivery. There is no transfer fee and no area flat fee on express.",
    hintFr: "0 à 100. Facturés sur chaque livraison express. Pas de frais de transfert ni de tarif fixe de zone en express.",
    inputMode: "decimal",
    range: { min: 0, max: 100 },
    express: true,
  },
  {
    key: "expressPerKmUsd",
    kind: "text",
    label: "Express fee per km (USD)",
    labelFr: "Frais express par km (USD)",
    hint: "0 to 50. Distance from the seller's pin to the customer's pin.",
    hintFr: "0 à 50. Distance entre le point du vendeur et celui du client.",
    inputMode: "decimal",
    range: { min: 0, max: 50 },
    express: true,
  },
  {
    key: "expressMaxUsd",
    kind: "text",
    label: "Express fee cap (USD)",
    labelFr: "Plafond des frais express (USD)",
    hint: "0 to 500. The express fee (base + distance) never goes above this.",
    hintFr: "0 à 500. Les frais express (base + distance) ne dépassent jamais ce montant.",
    inputMode: "decimal",
    range: { min: 0, max: 500 },
    express: true,
  },
  {
    key: "expressMaxKm",
    kind: "text",
    label: "Express maximum distance (km)",
    labelFr: "Distance maximale express (km)",
    hint: "0 to 100. Farther than this, the order goes through the warehouse instead. 0 = no limit.",
    hintFr: "0 à 100. Au-delà, la commande passe par l'entrepôt. 0 = pas de limite.",
    inputMode: "decimal",
    range: { min: 0, max: 100 },
    express: true,
  },
];

/** The fields to draw: the express ones only while express delivery is on (a value that is not "true" counts as off). */
export function visibleDeliveryFields(expressEnabled: string | null | undefined): DeliveryModelField[] {
  const on = String(expressEnabled ?? "").trim().toLowerCase() === "true";
  return DELIVERY_MODEL_FIELDS.filter((f) => on || !f.express);
}

/** The text of a range problem in the admin's language, or null when the value is fine. */
export function rangeProblem(range: { min: number; max: number; integer?: boolean }, raw: string, fr: boolean): string | null {
  const text = raw.trim();
  const n = Number(text.replace(",", "."));
  const { min, max, integer } = range;
  if (!text || !Number.isFinite(n) || n < min || n > max || (integer && !Number.isInteger(n))) {
    return fr ? `Saisissez ${integer ? "un nombre entier" : "un nombre"} entre ${min} et ${max}.` : `Enter ${integer ? "a whole number" : "a number"} between ${min} and ${max}.`;
  }
  return null;
}
