/**
 * Copy of the public "Sell online" page. Written to describe only what the
 * platform really does today: no audience sizes, no testimonials, no invented
 * fees. Prices and listing quotas on the page come live from `sellers:plans`.
 */

export const SELL_ONLINE_WHY = [
  { icon: "Users", title: "Shoppers already here", titleFr: "Des acheteurs déjà présents", desc: "Your products appear in the Somba&Teka shop and app next to other sellers' listings, so you do not have to build a storefront and its traffic from scratch.", descFr: "Vos produits apparaissent dans la boutique et l'app Somba&Teka à côté de ceux des autres vendeurs : pas besoin de construire une vitrine et son trafic." },
  { icon: "Truck", title: "Delivery handled", titleFr: "Livraison prise en charge", desc: "Riders collect parcels from your pickup address and deliver them. You pack the order and mark it ready.", descFr: "Les livreurs collectent les colis à votre adresse de collecte et les livrent. Vous préparez la commande et la marquez prête." },
  { icon: "Wallet", title: "Clear payouts", titleFr: "Paiements clairs", desc: "Earnings from delivered orders become available for payout. Request one from your finance dashboard and follow it until it is paid.", descFr: "Les gains des commandes livrées deviennent disponibles. Demandez un paiement depuis votre tableau de bord finance et suivez-le jusqu'au versement." },
  { icon: "TrendingUp", title: "Growth tools", titleFr: "Outils de croissance", desc: "Discount campaigns, real sales analytics, a store health score and public replies to customer reviews.", descFr: "Campagnes de remise, analytique de ventes réelle, score de santé de la boutique et réponses publiques aux avis clients." },
  { icon: "ShieldCheck", title: "Approved stores", titleFr: "Boutiques validées", desc: "Every store is approved by moderators before it can sell, which keeps the marketplace trustworthy for buyers.", descFr: "Chaque boutique est validée par la modération avant de pouvoir vendre, ce qui garde la marketplace fiable pour les acheteurs." },
  { icon: "Headphones", title: "Support in the portal", titleFr: "Support dans le portail", desc: "Open a support ticket from your seller portal. The portal is available in French and English.", descFr: "Ouvrez un ticket de support depuis votre portail vendeur. Le portail est disponible en français et en anglais." },
] as const;

export const SELL_ONLINE_STEPS = [
  { step: "1", title: "Create your seller account", titleFr: "Créez votre compte vendeur", desc: "Sign up, then open your store with its name and the address where riders collect parcels.", descFr: "Inscrivez-vous, puis ouvrez votre boutique avec son nom et l'adresse où les livreurs collectent les colis." },
  { step: "2", title: "Get approved", titleFr: "Faites valider la boutique", desc: "Moderators review your store. You are notified as soon as you can start listing products.", descFr: "La modération examine votre boutique. Vous êtes prévenu dès que vous pouvez publier des produits." },
  { step: "3", title: "List your products", titleFr: "Publiez vos produits", desc: "The product wizard takes a title, photo, price and stock. Some listings may be reviewed before they go live.", descFr: "L'assistant produit demande un titre, une photo, un prix et un stock. Certaines annonces peuvent être vérifiées avant leur mise en ligne." },
  { step: "4", title: "Sell and get paid", titleFr: "Vendez et soyez payé", desc: "Pack orders, mark them ready, follow your earnings and request payouts.", descFr: "Préparez les commandes, marquez-les prêtes, suivez vos gains et demandez vos paiements." },
] as const;

export const SELL_ONLINE_TOOLS = [
  { icon: "Package", name: "Product catalogue", nameFr: "Catalogue produits", desc: "Product wizard with photos, stock and low-stock view", descFr: "Assistant produit avec photos, stock et vue stock bas" },
  { icon: "ShoppingCart", name: "Order management", nameFr: "Gestion des commandes", desc: "Live order queue, mark as ready, shipment tracking", descFr: "File de commandes en direct, marquage prêt, suivi" },
  { icon: "BarChart3", name: "Analytics", nameFr: "Analytique", desc: "Revenue, customers, store health and fulfilment speed", descFr: "Revenu, clients, santé de la boutique et rapidité de traitement" },
  { icon: "Sparkles", name: "Promotions", nameFr: "Promotions", desc: "Discount campaigns on all or selected products", descFr: "Campagnes de remise sur tout ou partie de vos produits" },
  { icon: "Star", name: "Reviews", nameFr: "Avis", desc: "Reply publicly to customer reviews", descFr: "Répondez publiquement aux avis clients" },
  { icon: "Wallet", name: "Finance", nameFr: "Finance", desc: "Payouts, statements and commission breakdown", descFr: "Paiements, relevés et détail des commissions" },
] as const;

export const SELL_ONLINE_FAQ = [
  { q: "Who can sell on Somba&Teka?", qFr: "Qui peut vendre sur Somba&Teka ?", a: "Anyone can apply: create a seller account and open a store. Moderators approve each store before it can list products.", aFr: "Tout le monde peut postuler : créez un compte vendeur et ouvrez une boutique. La modération valide chaque boutique avant qu'elle puisse publier des produits." },
  { q: "What does it cost?", qFr: "Combien ça coûte ?", a: "The plans above show the current prices and listing limits. On top of the plan, a commission is deducted from each delivered sale; your finance dashboard shows the exact rate and amounts.", aFr: "Les offres ci-dessus affichent les prix et limites d'annonces actuels. En plus de l'offre, une commission est déduite de chaque vente livrée ; votre tableau de bord finance montre le taux et les montants exacts." },
  { q: "How does delivery work?", qFr: "Comment fonctionne la livraison ?", a: "You pack the order and mark it ready. A rider collects it from your pickup address and delivers it to the customer.", aFr: "Vous préparez la commande et la marquez prête. Un livreur la collecte à votre adresse de collecte et la livre au client." },
  { q: "When do I get paid?", qFr: "Quand suis-je payé ?", a: "Once orders are delivered their earnings become available. Request a payout from your finance dashboard; the finance team reviews it and you can follow its status there.", aFr: "Une fois les commandes livrées, leurs gains deviennent disponibles. Demandez un paiement depuis votre tableau de bord finance ; l'équipe finance l'examine et vous suivez son statut au même endroit." },
  { q: "How long until I can sell?", qFr: "Combien de temps avant de vendre ?", a: "As soon as moderators approve your store you can list products. Listings may also be reviewed before they appear in the shop.", aFr: "Dès que la modération valide votre boutique, vous pouvez publier des produits. Les annonces peuvent aussi être vérifiées avant d'apparaître dans la boutique." },
] as const;

export const SELL_ONLINE_HERO = {
  subtitle: "Open a store, list your products and sell to shoppers on Somba&Teka. Orders, delivery, payouts, promotions and reviews are all managed from one seller portal.",
  subtitleFr: "Ouvrez une boutique, publiez vos produits et vendez aux acheteurs de Somba&Teka. Commandes, livraison, paiements, promotions et avis se gèrent depuis un seul portail vendeur.",
  cta: "Start selling",
  ctaFr: "Commencer à vendre",
  secondaryCta: "View seller plans",
  secondaryCtaFr: "Voir les offres",
} as const;
