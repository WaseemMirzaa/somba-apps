/** Customer-review moderation and reported-content queue (Reviews & Moderation). */

export type ReviewItem = {
  id: string;
  product: string;
  seller: string;
  customer: string;
  rating: number;
  text: string;
  date: string;
  status: "pending" | "published" | "removed";
};

export type ReportItem = {
  id: string;
  type: "review" | "product" | "store";
  target: string;
  targetFr?: string;
  reporter: string;
  reporterFr?: string;
  reason: string;
  reasonFr?: string;
  date: string;
  status: "open" | "resolved" | "dismissed";
};

export const REVIEWS: ReviewItem[] = [
  { id: "RV-1042", product: "Samsung Galaxy S24 Ultra", seller: "TechZone Store", customer: "Marie D.", rating: 5, text: "Livraison rapide, produit conforme. Très satisfaite.", date: "2026-06-10", status: "pending" },
  { id: "RV-1041", product: "Nike Air Max 270", seller: "SportStyle", customer: "Ahmed B.", rating: 2, text: "Taille trop petite, semelle décollée à l'arrivée.", date: "2026-06-10", status: "pending" },
  { id: "RV-1040", product: "Sony WH-1000XM5", seller: "AudioHub", customer: "Sophie L.", rating: 4, text: "Bon son mais batterie moyenne.", date: "2026-06-09", status: "pending" },
  { id: "RV-1039", product: "Dyson V15 Vacuum", seller: "HomeEssentials", customer: "Patrick K.", rating: 1, text: "Arnaque, contactez-moi sur whatsapp +243…", date: "2026-06-09", status: "pending" },
  { id: "RV-1038", product: "MacBook Air M3", seller: "Apple Official", customer: "Grace M.", rating: 5, text: "Parfait, rien à dire.", date: "2026-06-08", status: "published" },
  { id: "RV-1037", product: "Levi's 501 Jeans", seller: "DenimWorld", customer: "Divine I.", rating: 3, text: "Couleur différente de la photo.", date: "2026-06-08", status: "published" },
  { id: "RV-1036", product: "PlayStation 5", seller: "GameZone", customer: "Espoir T.", rating: 1, text: "Contenu insultant supprimé.", date: "2026-06-07", status: "removed" },
];

export const REPORTS: ReportItem[] = [
  { id: "RP-308", type: "review", target: "RV-1039 · Dyson V15", reporter: "HomeEssentials", reason: "Spam / external contact", reasonFr: "Spam / contact externe", date: "2026-06-10", status: "open" },
  { id: "RP-307", type: "product", target: "Counterfeit AirPods Pro", targetFr: "AirPods Pro contrefaits", reporter: "Customer · Marie D.", reporterFr: "Client · Marie D.", reason: "Counterfeit goods", reasonFr: "Produits contrefaits", date: "2026-06-10", status: "open" },
  { id: "RP-306", type: "store", target: "QuickDeals Store", reporter: "Customer · Ahmed B.", reporterFr: "Client · Ahmed B.", reason: "Misleading store info", reasonFr: "Informations boutique trompeuses", date: "2026-06-09", status: "open" },
  { id: "RP-305", type: "review", target: "RV-1031 · iPhone case", targetFr: "RV-1031 · coque iPhone", reporter: "AccessoryHub", reason: "Offensive language", reasonFr: "Langage offensant", date: "2026-06-08", status: "resolved" },
  { id: "RP-304", type: "product", target: "Unbranded power bank", targetFr: "Batterie externe sans marque", reporter: "Customer · Sophie L.", reporterFr: "Client · Sophie L.", reason: "Safety concern", reasonFr: "Problème de sécurité", date: "2026-06-07", status: "dismissed" },
];
