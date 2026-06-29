/** Unified support tickets shared by the admin, seller and customer portals.
 *  Each ticket carries a conversation thread with optional attachments. */

export type SupportSender = "customer" | "seller" | "admin";

export type SupportAttachment = {
  name: string;
  /** "image" renders a thumbnail; "file" renders a chip. */
  kind: "image" | "file";
  /** data URL or remote URL (prototype). */
  url?: string;
};

export type SupportMessage = {
  from: SupportSender;
  text: string;
  textFr?: string;
  at: string;
  attachments?: SupportAttachment[];
};

export type SupportStatus = "open" | "in_progress" | "resolved";

export type SupportTicket = {
  id: string;
  subject: string;
  subjectFr: string;
  category: string;
  categoryFr: string;
  /** Which portal raised it — drives who sees it in their list. */
  audience: "customer" | "seller";
  /** Display name of the raiser (customer name or store name). */
  party: string;
  priority: "low" | "medium" | "high";
  status: SupportStatus;
  date: string;
  messages: SupportMessage[];
};

export const SUPPORT_TICKETS: SupportTicket[] = [
  {
    id: "TKT-441",
    subject: "Order not delivered",
    subjectFr: "Commande non livrée",
    category: "Delivery",
    categoryFr: "Livraison",
    audience: "customer",
    party: "Marie Kabila",
    priority: "high",
    status: "open",
    date: "2026-06-08",
    messages: [
      { from: "customer", text: "My order ORD-2024-001 was marked delivered but I never received it.", textFr: "Ma commande ORD-2024-001 est marquée livrée mais je ne l'ai jamais reçue.", at: "2026-06-08T09:10:00Z" },
      { from: "admin", text: "Sorry about that — we're checking with the rider and will update you shortly.", textFr: "Désolé — nous vérifions avec le livreur et revenons vers vous rapidement.", at: "2026-06-08T09:24:00Z" },
    ],
  },
  {
    id: "TKT-440",
    subject: "Refund delay",
    subjectFr: "Retard de remboursement",
    category: "Refunds",
    categoryFr: "Remboursements",
    audience: "customer",
    party: "Patrick Lumumba",
    priority: "medium",
    status: "in_progress",
    date: "2026-06-07",
    messages: [
      { from: "customer", text: "It's been 10 days and my refund hasn't arrived.", textFr: "Cela fait 10 jours et mon remboursement n'est pas arrivé.", at: "2026-06-07T14:00:00Z" },
      { from: "admin", text: "The refund was issued to your original payment method on the 6th. Please check and confirm.", textFr: "Le remboursement a été émis sur votre moyen de paiement d'origine le 6. Merci de vérifier.", at: "2026-06-07T15:12:00Z" },
    ],
  },
  {
    id: "TKT-438",
    subject: "Payment failed",
    subjectFr: "Paiement échoué",
    category: "Payments",
    categoryFr: "Paiements",
    audience: "customer",
    party: "Sophie Mbuyi",
    priority: "high",
    status: "open",
    date: "2026-06-06",
    messages: [
      { from: "customer", text: "My card was charged twice for one order.", textFr: "Ma carte a été débitée deux fois pour une commande.", at: "2026-06-06T11:30:00Z" },
    ],
  },
  {
    id: "TKT-001",
    subject: "Payout delay inquiry",
    subjectFr: "Demande de retard de versement",
    category: "Payout",
    categoryFr: "Versement",
    audience: "seller",
    party: "TechZone Store",
    priority: "high",
    status: "open",
    date: "2026-06-05",
    messages: [
      { from: "seller", text: "My payout for last week is still pending — please advise.", textFr: "Mon versement de la semaine dernière est toujours en attente — merci de m'indiquer les prochaines étapes.", at: "2026-06-05T08:00:00Z" },
      { from: "admin", text: "Your payout is under routine compliance review and should clear within 48h.", textFr: "Votre versement est en cours de vérification de conformité et sera traité sous 48 h.", at: "2026-06-05T09:05:00Z" },
    ],
  },
  {
    id: "TKT-002",
    subject: "Moderation question",
    subjectFr: "Question de modération",
    category: "Product",
    categoryFr: "Produit",
    audience: "seller",
    party: "TechZone Store",
    priority: "medium",
    status: "resolved",
    date: "2026-06-03",
    messages: [
      { from: "seller", text: "Why was my listing rejected?", textFr: "Pourquoi mon annonce a-t-elle été rejetée ?", at: "2026-06-03T10:00:00Z" },
      { from: "admin", text: "The product images didn't meet our quality guidelines. You can resubmit with clearer photos.", textFr: "Les images ne respectaient pas nos règles de qualité. Vous pouvez resoumettre avec des photos plus nettes.", at: "2026-06-03T10:40:00Z" },
    ],
  },
  {
    id: "TKT-003",
    subject: "Rider pickup delay",
    subjectFr: "Retard d'enlèvement du livreur",
    category: "Orders",
    categoryFr: "Commandes",
    audience: "seller",
    party: "TechZone Store",
    priority: "low",
    status: "open",
    date: "2026-06-06",
    messages: [
      { from: "seller", text: "The rider hasn't picked up batch BATCH-002 yet.", textFr: "Le livreur n'a pas encore récupéré le lot BATCH-002.", at: "2026-06-06T13:00:00Z" },
    ],
  },
];

export const SUPPORT_STATUS_LABELS: Record<SupportStatus, { en: string; fr: string }> = {
  open: { en: "Open", fr: "Ouvert" },
  in_progress: { en: "In progress", fr: "En cours" },
  resolved: { en: "Resolved", fr: "Résolu" },
};

export const SUPPORT_PRIORITY_LABELS: Record<string, { en: string; fr: string }> = {
  high: { en: "High", fr: "Élevée" },
  medium: { en: "Medium", fr: "Moyenne" },
  low: { en: "Low", fr: "Faible" },
};
