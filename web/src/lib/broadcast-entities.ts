/** Platform broadcast notifications — push (FCM), SMS, and email (Marketing & Content). */

export type BroadcastChannel = "push" | "sms" | "email";

export type Broadcast = {
  id: string;
  channel: BroadcastChannel;
  audience: string;
  title: string;
  body: string;
  status: "draft" | "scheduled" | "sent";
  reach: string;
  date: string;
};

export const BROADCAST_CHANNELS: { id: BroadcastChannel; label: string; labelFr: string }[] = [
  { id: "push", label: "Push (FCM)", labelFr: "Push (FCM)" },
  { id: "sms", label: "SMS", labelFr: "SMS" },
  { id: "email", label: "Email", labelFr: "E-mail" },
];

export const BROADCAST_AUDIENCES: { id: string; label: string; labelFr: string }[] = [
  { id: "all", label: "Everyone", labelFr: "Tout le monde" },
  { id: "customers", label: "Customers", labelFr: "Clients" },
  { id: "sellers", label: "Sellers", labelFr: "Vendeurs" },
  { id: "riders", label: "Riders", labelFr: "Livreurs" },
  { id: "kinshasa", label: "Kinshasa", labelFr: "Kinshasa" },
  { id: "lubumbashi", label: "Lubumbashi", labelFr: "Lubumbashi" },
];

export const BROADCASTS: Broadcast[] = [
  { id: "BC-051", channel: "push", audience: "Customers", title: "Soldes électronique ce week-end", body: "Jusqu'à -50% sur une sélection.", status: "sent", reach: "48.2K", date: "2026-06-10" },
  { id: "BC-050", channel: "sms", audience: "Riders", title: "Réunion équipe Kinshasa", body: "Briefing demain 8h à l'entrepôt de Gombe.", status: "sent", reach: "126", date: "2026-06-09" },
  { id: "BC-049", channel: "email", audience: "Sellers", title: "Nouveaux taux de commission", body: "Les commissions par catégorie évoluent le 1er juillet.", status: "scheduled", reach: "1.2K", date: "2026-06-14" },
  { id: "BC-048", channel: "push", audience: "Kinshasa", title: "Livraison gratuite aujourd'hui", body: "Livraison offerte sur Gombe et Limete.", status: "sent", reach: "12.4K", date: "2026-06-08" },
  { id: "BC-047", channel: "email", audience: "Everyone", title: "Mise à jour des conditions", body: "Nos CGU ont été mises à jour.", status: "draft", reach: "—", date: "2026-06-07" },
];
