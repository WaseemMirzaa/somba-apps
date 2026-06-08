import { BRAND } from "./config";

/** Single brand blue — no gradients */
export const BRAND_BLUE = "#1d4ed8";

/** Free Unsplash image — online shopping / marketplace (Unsplash License) */
export const HERO_IMAGE = {
  src: "https://images.unsplash.com/photo-1607082349566-187342175e2f?auto=format&fit=crop&w=2400&q=80",
  alt: "Vibrant online shopping experience with packages and deals",
  credit: "Unsplash",
  creditUrl: "https://unsplash.com/photos/187342175e2f",
} as const;

export const APP_LINKS = {
  ios: "https://apps.apple.com/app/somba-shop",
  android: "https://play.google.com/store/apps/details?id=com.somba.shop",
  customerApp: "https://apps.apple.com/app/somba-shop",
  riderApp: "https://play.google.com/store/apps/details?id=com.somba.rider",
  sellerSignup: "/login",
  sellOnline: "/sell-online",
  contactSupport: `mailto:${BRAND.supportEmail}?subject=Somba%20%26%20Tekka%20Support`,
} as const;

/** Flipkart-style quick-access strip — portal entry points */
export const PORTAL_QUICK_ACCESS = [
  { id: "admin", label: "Admin", labelFr: "Admin", icon: "Shield" },
  { id: "seller", label: "Seller", labelFr: "Vendeur", icon: "Store" },
  { id: "warehouse", label: "Warehouse", labelFr: "Entrepôt", icon: "Warehouse" },
  { id: "rider", label: "Rider", labelFr: "Livreur", icon: "Bike" },
  { id: "shop", label: "Shop", labelFr: "Boutique", icon: "ShoppingBag" },
] as const;

/** Marketplace deal highlight cards */
export const DEAL_HIGHLIGHTS = [
  { title: "Flash Deals", titleFr: "Offres flash", subtitle: "Up to 50% off", subtitleFr: "Jusqu'à -50 %", tag: "Today", tagFr: "Aujourd'hui", href: "/shop/products" },
  { title: "Electronics", titleFr: "Électronique", subtitle: "From $349", subtitleFr: "À partir de 349 $", tag: "Top rated", tagFr: "Mieux notés", href: "/shop/products" },
  { title: "Fashion", titleFr: "Mode", subtitle: "New arrivals", subtitleFr: "Nouveautés", tag: "Trending", tagFr: "Tendance", href: "/shop/products" },
  { title: "Fast Delivery", titleFr: "Livraison rapide", subtitle: "1–3 days", subtitleFr: "1–3 jours", tag: "Nationwide", tagFr: "National", href: "#modules" },
  { title: "Become a Seller", titleFr: "Devenir vendeur", subtitle: "From $49/mo", subtitleFr: "À partir de 49 $/mois", tag: "Open now", tagFr: "Ouvert", href: "/sell-online" },
  { title: "Mobile App", titleFr: "App mobile", subtitle: "iOS & Android", subtitleFr: "iOS et Android", tag: "Download", tagFr: "Télécharger", href: "#apps" },
] as const;

export const PORTAL_IMAGES = {
  admin: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?q=80&w=1200&auto=format&fit=crop",
  seller: "https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?q=80&w=1200&auto=format&fit=crop",
  warehouse: "https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?q=80&w=1200&auto=format&fit=crop",
  rider: "https://images.unsplash.com/photo-1607083207634-bd02781bccb9?auto=format&fit=crop&w=1200&q=80",
  shop: "https://images.unsplash.com/photo-1472851294608-062f824d29cc?auto=format&fit=crop&w=1200&q=80",
} as const;

export const PORTAL_SECTION = {
  title: "One marketplace, every role",
  titleFr: "Une marketplace, chaque rôle",
  subtitle: "Whether you're shopping, selling, or running operations — Somba & Tekka connects every part of the journey.",
  subtitleFr: "Que vous achetiez, vendiez ou gériez les opérations — Somba & Tekka connecte chaque étape.",
  publicLabel: "For shoppers & sellers",
  publicLabelFr: "Pour acheteurs et vendeurs",
  opsLabel: "For our operations team",
  opsLabelFr: "Pour nos équipes internes",
  explorerLabel: "Explore in detail",
  explorerLabelFr: "Explorer en détail",
} as const;

export const MODULES_SECTION = {
  title: "Built for a better shopping experience",
  titleFr: "Conçu pour mieux acheter",
  subtitle: "From checkout to doorstep — payments, delivery, returns, and seller tools that keep the marketplace running smoothly.",
  subtitleFr: "Du paiement à la livraison — paiements, livraison, retours et outils vendeur pour une marketplace fluide.",
} as const;

export const PORTALS = [
  {
    id: "shop",
    audience: "shopper" as const,
    audienceLabel: "For shoppers",
    audienceLabelFr: "Pour les acheteurs",
    tagline: "Browse, buy, track, return",
    taglineFr: "Parcourir, acheter, suivre, retourner",
    name: "Customer Shop",
    nameFr: "Boutique Client",
    desc: "Your everyday marketplace — thousands of products, deals across categories, and delivery to your door.",
    descFr: "Votre marketplace du quotidien — milliers de produits, offres par catégorie et livraison à domicile.",
    icon: "ShoppingBag",
    image: PORTAL_IMAGES.shop,
    loginHref: "/shop/products",
    appHref: APP_LINKS.customerApp,
    features: ["Categories, search & flash deals", "Guest checkout & Somba wallet", "Order tracking & easy returns"],
    trust: [
      { icon: "Truck", label: "1–3 day delivery", labelFr: "Livraison 1–3 jours" },
      { icon: "Banknote", label: "COD available", labelFr: "COD disponible" },
      { icon: "Globe", label: "Web + mobile app", labelFr: "Web + app mobile" },
    ],
    modules: [
      { name: "Browse & Discover", nameFr: "Parcourir", icon: "Search", items: ["Categories & search", "Product detail & reviews", "Stores & brands", "Flash sale banners"] },
      { name: "Cart & Checkout", nameFr: "Panier et paiement", icon: "CreditCard", items: ["Cart & wishlist", "Guest checkout", "Wallet & coupons", "Order confirmation"] },
      { name: "After Purchase", nameFr: "Après achat", icon: "PackageCheck", items: ["Order tracking", "Returns & support", "Refer & earn", "Account settings"] },
    ],
  },
  {
    id: "seller",
    audience: "seller" as const,
    audienceLabel: "For sellers",
    audienceLabelFr: "Pour les vendeurs",
    tagline: "List, sell, grow, get paid",
    taglineFr: "Lister, vendre, grandir, être payé",
    name: "Seller Portal",
    nameFr: "Portail Vendeur",
    desc: "Open your store on Somba — manage catalog, orders, promotions, and payouts from one dashboard.",
    descFr: "Ouvrez votre boutique sur Somba — catalogue, commandes, promotions et paiements en un seul tableau de bord.",
    icon: "Store",
    image: PORTAL_IMAGES.seller,
    loginHref: "/sell-online",
    features: ["Product wizard & inventory", "Orders, shipping & returns", "Promotions & revenue analytics"],
    subscription: true,
    trust: [
      { icon: "Users", label: "48K+ shoppers", labelFr: "48K+ acheteurs" },
      { icon: "TrendingUp", label: "Growth tools", labelFr: "Outils de croissance" },
      { icon: "Wallet", label: "Weekly payouts", labelFr: "Paiements hebdo" },
    ],
    modules: [
      { name: "Catalog & Inventory", nameFr: "Catalogue et stock", icon: "Package", items: ["Product create wizard", "SKU inventory", "Low-stock alerts", "Bulk updates"] },
      { name: "Orders & Shipping", nameFr: "Commandes et expédition", icon: "Truck", items: ["Order queue", "Pack & ship", "Tracking updates", "Returns handling"] },
      { name: "Growth & Reviews", nameFr: "Croissance et avis", icon: "Sparkles", items: ["Promotions", "Flash deals", "Customer reviews", "Support tickets"] },
      { name: "Finance", nameFr: "Finance", icon: "Wallet", items: ["Payout statements", "Commission breakdown", "Wallet balance", "Analytics"] },
    ],
  },
  {
    id: "admin",
    audience: "operations" as const,
    audienceLabel: "Staff only",
    audienceLabelFr: "Équipe uniquement",
    tagline: "Run the marketplace",
    taglineFr: "Gérer la marketplace",
    name: "Admin Console",
    nameFr: "Console Admin",
    desc: "Central command for marketplace ops — sellers, orders, finance, fraud, CMS, and fulfillment oversight.",
    descFr: "Centre de commande — vendeurs, commandes, finance, fraude, CMS et suivi fulfillment.",
    icon: "Shield",
    image: PORTAL_IMAGES.admin,
    loginHref: "/login",
    features: ["Seller & product moderation", "GMV analytics & order funnel", "Warehouses, fraud & payouts"],
    trust: [
      { icon: "Shield", label: "Role-based access", labelFr: "Accès par rôle" },
      { icon: "FileCheck", label: "Full audit trail", labelFr: "Journal d'audit" },
      { icon: "BarChart3", label: "Live dashboards", labelFr: "Tableaux de bord" },
    ],
    modules: [
      { name: "Dashboard & Analytics", nameFr: "Tableau de bord et analytics", icon: "LayoutDashboard", items: ["KPI overview", "Revenue charts", "Order funnel", "Audit log"] },
      { name: "Seller & Product Ops", nameFr: "Vendeurs et produits", icon: "Users", items: ["Seller onboarding & KYC", "Product moderation", "Commission rules", "Flash sales"] },
      { name: "Fulfillment & Warehouses", nameFr: "Fulfillment et entrepôts", icon: "Warehouse", items: ["Create warehouses", "Issue portal credentials", "Fulfillment ops mirror", "Cross-city routing"] },
      { name: "Finance & Trust", nameFr: "Finance et confiance", icon: "ShieldCheck", items: ["Payouts & settlements", "Fraud & COD review", "Returns oversight", "Role-based access"] },
      { name: "Growth & Support", nameFr: "Croissance et support", icon: "Megaphone", items: ["CMS & banners", "Marketing campaigns", "Customer support tickets", "Platform settings"] },
    ],
  },
  {
    id: "warehouse",
    audience: "operations" as const,
    audienceLabel: "Staff only",
    audienceLabelFr: "Équipe uniquement",
    tagline: "Fulfillment hub",
    taglineFr: "Hub fulfillment",
    name: "Warehouse Portal",
    nameFr: "Portail Entrepôt",
    desc: "Receive seller parcels, sort, batch, and hand off to riders — with COD reconciliation and returns handling.",
    descFr: "Réception des colis, tri, lots et remise aux livreurs — avec rapprochement COD et retours.",
    icon: "Warehouse",
    image: PORTAL_IMAGES.warehouse,
    loginHref: "/login",
    features: ["Inbound & parcel inspection", "Sort lanes & batch builder", "Dispatch, riders & exceptions"],
    trust: [
      { icon: "ScanLine", label: "Barcode scanning", labelFr: "Scan codes-barres" },
      { icon: "Clock", label: "Real-time queues", labelFr: "Files temps réel" },
      { icon: "Truck", label: "Rider handoff", labelFr: "Remise livreur" },
    ],
    modules: [
      { name: "Inbound & Receiving", nameFr: "Réception", icon: "Inbox", items: ["Inbound shipments", "Parcel inspection", "Receiving checklist", "Exception flagging"] },
      { name: "Sorting & Inventory", nameFr: "Tri et inventaire", icon: "ArrowUpDown", items: ["Sort lanes", "SKU inventory", "Batch builder", "Hub capacity"] },
      { name: "Dispatch & Delivery", nameFr: "Expédition et livraison", icon: "Send", items: ["Dispatch batches", "Rider assignment", "Live deliveries", "Route tracking"] },
      { name: "Post-Delivery", nameFr: "Après livraison", icon: "RotateCcw", items: ["Returns processing", "Replacements", "Exchanges", "COD reconciliation"] },
    ],
  },
  {
    id: "rider",
    audience: "operations" as const,
    audienceLabel: "Partners",
    audienceLabelFr: "Partenaires",
    tagline: "Last-mile delivery",
    taglineFr: "Dernier kilomètre",
    name: "Rider App",
    nameFr: "App Livreur",
    desc: "Mobile app for delivery partners — task queue, GPS navigation, COD collection, and daily earnings.",
    descFr: "App mobile pour les livreurs — tâches, GPS, encaissement COD et gains quotidiens.",
    icon: "Bike",
    image: PORTAL_IMAGES.rider,
    loginHref: "/login",
    appHref: APP_LINKS.riderApp,
    features: ["Active delivery queue", "Navigate & call customers", "Proof of delivery & COD"],
    trust: [
      { icon: "Smartphone", label: "Mobile-first", labelFr: "Mobile d'abord" },
      { icon: "MapPin", label: "GPS routes", labelFr: "Itinéraires GPS" },
      { icon: "CircleDollarSign", label: "Earnings tracker", labelFr: "Suivi des gains" },
    ],
    modules: [
      { name: "Tasks", nameFr: "Tâches", icon: "ListChecks", items: ["Active delivery queue", "Pickup & drop details", "Mark delivered", "Failed delivery reasons"] },
      { name: "Navigation & Contact", nameFr: "Navigation et contact", icon: "Navigation", items: ["Map navigation", "Call customer", "Proof of delivery", "Open-box confirmation"] },
      { name: "Earnings", nameFr: "Gains", icon: "CircleDollarSign", items: ["Daily earnings", "COD collected", "Incentive bonuses", "Payout history"] },
    ],
  },
] as const;

export const PORTAL_GROUPS = [
  { id: "shopper", label: "Shop", labelFr: "Acheter", icon: "ShoppingBag", portalIds: ["shop"] as const },
  { id: "seller", label: "Sell", labelFr: "Vendre", icon: "Store", portalIds: ["seller"] as const },
  { id: "operations", label: "Operations", labelFr: "Opérations", icon: "Shield", portalIds: ["admin", "warehouse", "rider"] as const },
] as const;

/** Marketplace services — what shoppers and sellers get */
export const PLATFORM_MODULES = [
  {
    id: "fulfillment",
    name: "Fast Fulfillment",
    nameFr: "Livraison rapide",
    desc: "Seller to warehouse to your doorstep — live tracking on every order, 1–3 day delivery in most areas.",
    descFr: "Du vendeur à votre porte — suivi en direct, livraison en 1–3 jours dans la plupart des zones.",
    highlight: "1–3 day delivery",
    highlightFr: "Livraison 1–3 jours",
    cta: "Shop with fast delivery",
    ctaFr: "Acheter avec livraison rapide",
    href: "/shop/products",
    tag: "Nationwide",
    tagFr: "National",
    icon: "Truck",
    image: PORTAL_IMAGES.warehouse,
    trust: [
      { icon: "Warehouse", label: "Multi-hub", labelFr: "Multi-hub" },
      { icon: "Zap", label: "Real-time tracking", labelFr: "Suivi temps réel" },
      { icon: "MapPin", label: "Last-mile delivery", labelFr: "Dernier kilomètre" },
    ],
  },
  {
    id: "cod",
    name: "Secure Payments",
    nameFr: "Paiements sécurisés",
    desc: "Card, Somba wallet, or cash on delivery — fraud-checked checkout with buyer protection on every order.",
    descFr: "Carte, portefeuille Somba ou COD — paiement vérifié avec protection acheteur sur chaque commande.",
    highlight: "COD + wallet",
    highlightFr: "COD + portefeuille",
    cta: "See payment options",
    ctaFr: "Voir les paiements",
    href: "/shop/products",
    tag: "Buyer safe",
    tagFr: "Acheteur protégé",
    icon: "ShieldCheck",
    image: "https://images.unsplash.com/photo-1563986768609-322da13575f3?q=80&w=1200&auto=format&fit=crop",
    trust: [
      { icon: "Banknote", label: "COD available", labelFr: "COD disponible" },
      { icon: "Wallet", label: "Wallet & coupons", labelFr: "Portefeuille & coupons" },
      { icon: "Lock", label: "Encrypted checkout", labelFr: "Paiement chiffré" },
    ],
  },
  {
    id: "returns",
    name: "Easy Returns",
    nameFr: "Retours faciles",
    desc: "30-day returns from your order page — refund, replacement, or exchange with doorstep pickup arranged for you.",
    descFr: "Retours sous 30 jours depuis votre commande — remboursement, échange ou remplacement avec collecte à domicile.",
    highlight: "30-day returns",
    highlightFr: "Retours 30 jours",
    cta: "How returns work",
    ctaFr: "Comment retourner",
    href: "/shop/products",
    tag: "Hassle-free",
    tagFr: "Sans tracas",
    icon: "RotateCcw",
    image: "https://images.unsplash.com/photo-1607083207634-bd02781bccb9?auto=format&fit=crop&w=1200&q=80",
    trust: [
      { icon: "PackageCheck", label: "Door pickup", labelFr: "Collecte à domicile" },
      { icon: "RefreshCw", label: "Quick refunds", labelFr: "Remboursements rapides" },
      { icon: "Headphones", label: "24/7 support", labelFr: "Support 24/7" },
    ],
  },
  {
    id: "subscription",
    name: "Sell on Somba",
    nameFr: "Vendre sur Somba",
    desc: "Join 1,200+ verified sellers — list products, reach 48K+ shoppers, and get weekly payouts from $49/mo.",
    descFr: "Rejoignez 1 200+ vendeurs vérifiés — listez, touchez 48K+ acheteurs et soyez payé chaque semaine dès 49 $/mois.",
    highlight: "From $49/mo",
    highlightFr: "À partir de 49 $/mois",
    cta: "Start selling online",
    ctaFr: "Vendre en ligne",
    href: "/sell-online",
    tag: "Open to sellers",
    tagFr: "Ouvert aux vendeurs",
    icon: "Store",
    image: "https://images.unsplash.com/photo-1556761175-5973dc0f32e7?q=80&w=1200&auto=format&fit=crop",
    trust: [
      { icon: "Star", label: "Verified sellers", labelFr: "Vendeurs vérifiés" },
      { icon: "TrendingUp", label: "Growth tools", labelFr: "Outils de croissance" },
      { icon: "BadgeCheck", label: "Simple onboarding", labelFr: "Onboarding simple" },
    ],
  },
] as const;

export const PAYMENT_OPTIONS = [
  { title: "Card & Wallet", titleFr: "Carte et portefeuille", desc: "Pay securely at checkout with saved cards or your Somba wallet balance.", descFr: "Payez en toute sécurité par carte ou portefeuille Somba." },
  { title: "Cash on Delivery", titleFr: "Paiement à la livraison", desc: "Order now and pay when your package arrives — available on eligible items.", descFr: "Commandez maintenant, payez à la réception — sur articles éligibles." },
  { title: "Seller Plans", titleFr: "Plans vendeur", desc: "Monthly plans from $49 for businesses that want to sell on Somba & Tekka.", descFr: "Plans mensuels à partir de 49 $ pour vendre sur Somba & Tekka." },
  { title: "Mobile App", titleFr: "Application mobile", desc: "Shop and track orders on iOS and Android — same account, same cart.", descFr: "Achetez et suivez vos commandes sur iOS et Android." },
] as const;

/** Why shoppers and sellers choose Somba & Tekka */
export const WHY_CHOOSE = [
  { title: "Verified sellers", titleFr: "Vendeurs vérifiés", desc: "Every store on Somba is reviewed — shop with confidence from trusted merchants.", descFr: "Chaque boutique est vérifiée — achetez en confiance." },
  { title: "Fast delivery", titleFr: "Livraison rapide", desc: "1–3 day delivery nationwide with real-time tracking from warehouse to doorstep.", descFr: "Livraison en 1–3 jours avec suivi en temps réel." },
  { title: "Thousands of products", titleFr: "Des milliers de produits", desc: "Electronics, fashion, home, beauty, grocery, and more — all in one marketplace.", descFr: "Électronique, mode, maison, beauté, épicerie et plus — tout au même endroit." },
  { title: "Easy returns", titleFr: "Retours faciles", desc: "Start a return in seconds from your account — replacements and refunds handled for you.", descFr: "Retour en quelques clics — remplacement ou remboursement géré pour vous." },
  { title: "Sell and grow", titleFr: "Vendre et grandir", desc: "Open your store, list products, run promotions, and reach customers across the country.", descFr: "Ouvrez votre boutique, listez vos produits et touchez des clients partout." },
  { title: "Bilingual FR/EN", titleFr: "Bilingue FR/EN", desc: "Shop, sell, and get support in French or English across web and mobile.", descFr: "Achetez, vendez et obtenez de l'aide en français ou en anglais." },
  { title: "Mobile & web", titleFr: "Mobile et web", desc: "Shop on the web or download the Somba app — same cart, same orders, anywhere.", descFr: "Achetez sur le web ou l'app Somba — même panier, mêmes commandes." },
  { title: "Secure payments", titleFr: "Paiements sécurisés", desc: "Card, wallet, and COD options with buyer protection on every order.", descFr: "Carte, portefeuille et COD avec protection acheteur sur chaque commande." },
] as const;

export const SELLER_PLANS = [
  {
    id: "starter",
    name: "Starter",
    price: 49,
    period: "month",
    desc: "Perfect for new sellers — up to 100 products, order management, and email support.",
    features: ["100 product listings", "Order management", "Basic analytics", "Email support"],
    popular: false,
  },
  {
    id: "pro",
    name: "Professional",
    price: 99,
    period: "month",
    desc: "Growing stores — unlimited products, flash sales, advanced analytics, and priority support.",
    features: ["Unlimited products", "Promotions & flash sales", "Advanced analytics", "Priority support", "API access"],
    popular: true,
  },
  {
    id: "enterprise",
    name: "Enterprise",
    price: null,
    period: "custom",
    desc: "Large brands — multi-store, custom commission, dedicated account manager, and SLA.",
    features: ["Multi-store", "Custom commission", "Dedicated manager", "SLA & onboarding", "White-label options"],
    popular: false,
  },
] as const;

export const PLATFORM_STATS = [
  { value: "12K+", label: "Products listed", labelFr: "Produits listés" },
  { value: "1,200+", label: "Verified sellers", labelFr: "Vendeurs vérifiés" },
  { value: "1–3d", label: "Avg. delivery", labelFr: "Livraison moy." },
  { value: "FR/EN", label: "Bilingual support", labelFr: "Support bilingue" },
] as const;

export const PRODUCT_HERO = {
  title: BRAND.tagline,
  titleFr: `Achetez malin. Livré vite.`,
  subtitle: `${BRAND.fullName} is your online marketplace — shop thousands of products from verified sellers, with fast delivery, secure payments, and easy returns.`,
  subtitleFr: `${BRAND.fullName} est votre marketplace en ligne — des milliers de produits de vendeurs vérifiés, livraison rapide, paiements sécurisés et retours faciles.`,
  intro: `Whether you're shopping for electronics, fashion, or everyday essentials — browse, add to cart, and get it delivered. Want to grow your business? Open a seller store on Somba and reach customers nationwide.`,
  introFr: `Que vous cherchiez de l'électronique, de la mode ou l'essentiel du quotidien — parcourez, ajoutez au panier et recevez chez vous. Vous voulez développer votre activité ? Ouvrez une boutique vendeur sur Somba.`,
  bullets: [
    "Thousands of products from verified sellers",
    "1–3 day delivery with real-time tracking",
    "Card, wallet, and cash on delivery",
  ],
  bulletsFr: [
    "Des milliers de produits de vendeurs vérifiés",
    "Livraison en 1–3 jours avec suivi en temps réel",
    "Carte, portefeuille et paiement à la livraison",
  ],
  guarantee: "Free to browse · Guest checkout · Easy returns within 30 days",
  guaranteeFr: "Navigation gratuite · Paiement invité · Retours faciles sous 30 jours",
};

export const TRUST_SIGNALS = [
  { label: "Verified sellers", labelFr: "Vendeurs vérifiés" },
  { label: "Fast 1–3 day delivery", labelFr: "Livraison 1–3 jours" },
  { label: "Secure checkout", labelFr: "Paiement sécurisé" },
  { label: "Easy 30-day returns", labelFr: "Retours 30 jours" },
] as const;

export const CONVERSION_PATHS = [
  {
    id: "shopper",
    badge: "Most popular",
    badgeFr: "Le plus populaire",
    title: "I want to shop",
    titleFr: "Je veux acheter",
    desc: "Browse categories, compare deals, and checkout — guest or account, card, wallet, or COD.",
    descFr: "Parcourez les catégories, comparez les offres et payez — invité ou compte, carte, portefeuille ou COD.",
    cta: "Shop now",
    ctaFr: "Acheter maintenant",
    href: "/shop/products",
    highlight: true,
  },
  {
    id: "seller",
    badge: "For businesses",
    badgeFr: "Pour les entreprises",
    title: "I want to sell on Somba",
    titleFr: "Je veux vendre sur Somba",
    desc: "Open your store, list products, manage orders, and get paid — choose a seller plan that fits your business.",
    descFr: "Ouvrez votre boutique, listez vos produits, gérez les commandes et soyez payé — choisissez un plan vendeur.",
    cta: "Sell online",
    ctaFr: "Vendre en ligne",
    href: "/sell-online",
    highlight: false,
  },
  {
    id: "staff",
    badge: "Team access",
    badgeFr: "Accès équipe",
    title: "I'm on the Somba team",
    titleFr: "Je fais partie de l'équipe Somba",
    desc: "Staff and partners — sign in to your portal: admin, warehouse, rider, or seller dashboard.",
    descFr: "Équipe et partenaires — connectez-vous à votre portail : admin, entrepôt, livreur ou vendeur.",
    cta: "Staff login",
    ctaFr: "Connexion équipe",
    href: "/login",
    highlight: false,
  },
] as const;

export const HOW_IT_WORKS = [
  { step: "01", title: "Browse & discover", titleFr: "Parcourir et découvrir", desc: "Search by category, compare prices and reviews, and add favourites to your cart or wishlist.", descFr: "Cherchez par catégorie, comparez prix et avis, ajoutez au panier ou à la liste de souhaits." },
  { step: "02", title: "Checkout securely", titleFr: "Payer en sécurité", desc: "Pay with card, Somba wallet, or cash on delivery — guest checkout available on every order.", descFr: "Payez par carte, portefeuille Somba ou à la livraison — paiement invité disponible." },
  { step: "03", title: "Track your order", titleFr: "Suivre votre commande", desc: "Real-time updates from warehouse dispatch to rider delivery — know exactly when it arrives.", descFr: "Mises à jour en temps réel de l'expédition à la livraison — sachez quand ça arrive." },
  { step: "04", title: "Returns made easy", titleFr: "Retours simplifiés", desc: "Not happy? Start a return from your account — refund, replacement, or exchange in a few clicks.", descFr: "Pas satisfait ? Lancez un retour depuis votre compte — remboursement, remplacement ou échange." },
] as const;

export const TESTIMONIALS = [
  {
    quote: "I ordered a phone on Tuesday and it arrived Thursday — tracking was spot-on. COD made it easy since I prefer paying on delivery.",
    quoteFr: "J'ai commandé un téléphone mardi et reçu jeudi — le suivi était parfait. Le COD m'a simplifié la vie.",
    name: "Marie Dupont",
    role: "Customer, Lyon",
    roleFr: "Cliente, Lyon",
    initials: "MD",
  },
  {
    quote: "We listed 200 SKUs in our first week on Somba. Orders, payouts, and promotions are all in one seller dashboard — our revenue is up 40%.",
    quoteFr: "200 références en une semaine sur Somba. Commandes, paiements et promos dans un seul tableau de bord — +40 % de revenus.",
    name: "Ahmed Benali",
    role: "Owner, TechZone Store",
    roleFr: "Propriétaire, TechZone Store",
    initials: "AB",
  },
  {
    quote: "Returns used to be a headache. On Somba I requested a replacement from my order page and had a new item within three days.",
    quoteFr: "Les retours étaient compliqués. Sur Somba j'ai demandé un remplacement depuis ma commande et reçu en trois jours.",
    name: "Sophie Laurent",
    role: "Customer, Paris",
    roleFr: "Cliente, Paris",
    initials: "SL",
  },
] as const;

export const FAQ_ITEMS = [
  {
    q: "What is Somba & Tekka?",
    qFr: "Qu'est-ce que Somba & Tekka ?",
    a: `${BRAND.fullName} is an online marketplace where you can shop from verified sellers across electronics, fashion, home, beauty, and more — with fast delivery and secure payments.`,
    aFr: `${BRAND.fullName} est une marketplace en ligne où vous achetez auprès de vendeurs vérifiés — électronique, mode, maison, beauté et plus — avec livraison rapide.`,
  },
  {
    q: "How do I become a seller?",
    qFr: "Comment devenir vendeur ?",
    a: "Visit /sell-online for the full seller guide. Choose a plan (Starter from $49/mo, Pro $99/mo, or Enterprise), sign up at /login, and start listing products.",
    aFr: "Consultez /sell-online pour le guide vendeur complet. Choisissez un plan, inscrivez-vous sur /login et listez vos produits.",
  },
  {
    q: "What payment methods are accepted?",
    qFr: "Quels moyens de paiement sont acceptés ?",
    a: "We accept credit/debit cards, Somba wallet balance, and cash on delivery (COD) on eligible orders. Guest checkout is available without creating an account.",
    aFr: "Cartes bancaires, portefeuille Somba et paiement à la livraison (COD) sur commandes éligibles. Paiement invité sans compte.",
  },
  {
    q: "How long does delivery take?",
    qFr: "Quel est le délai de livraison ?",
    a: "Most orders arrive in 1–3 business days. You'll get real-time tracking from dispatch to doorstep via your account or the mobile app.",
    aFr: "La plupart des commandes arrivent en 1–3 jours ouvrés. Suivi en temps réel via votre compte ou l'app mobile.",
  },
  {
    q: "How do returns work?",
    qFr: "Comment fonctionnent les retours ?",
    a: "Start a return from your order history within 30 days. Choose refund, replacement, or exchange — pickup can be scheduled from your account.",
    aFr: "Lancez un retour depuis votre historique sous 30 jours. Remboursement, remplacement ou échange — collecte planifiable depuis votre compte.",
  },
] as const;

/** Flipkart-style sell-online landing — /sell-online */
export const SELL_ONLINE_HERO = {
  title: "Grow your business — sell online on Somba & Tekka",
  titleFr: "Développez votre activité — vendez en ligne sur Somba & Tekka",
  subtitle: "Reach millions of shoppers, get fulfillment support, and get paid on time. List your products and start selling in as little as 24 hours.",
  subtitleFr: "Touchez des millions d'acheteurs, bénéficiez du fulfillment et soyez payé à temps. Listez vos produits et vendez en 24 h.",
  cta: "Start selling",
  ctaFr: "Commencer à vendre",
  secondaryCta: "View seller plans",
  secondaryCtaFr: "Voir les plans",
} as const;

export const SELL_ONLINE_STATS = [
  { value: "48K+", label: "Active customers", labelFr: "Clients actifs" },
  { value: "1,200+", label: "Verified sellers", labelFr: "Vendeurs vérifiés" },
  { value: "12K+", label: "Products listed", labelFr: "Produits listés" },
  { value: "1–3d", label: "Avg. delivery", labelFr: "Livraison moy." },
] as const;

export const SELL_ONLINE_WHY = [
  { icon: "Users", title: "Huge customer base", titleFr: "Large base clients", desc: "Access shoppers across France and beyond — no need to build your own traffic.", descFr: "Accédez aux acheteurs en France et au-delà — sans créer votre propre trafic." },
  { icon: "Truck", title: "Fulfillment support", titleFr: "Support fulfillment", desc: "Warehouse sorting, dispatch, and last-mile delivery handled by Somba logistics.", descFr: "Tri entrepôt, expédition et dernier kilomètre gérés par la logistique Somba." },
  { icon: "Wallet", title: "Timely payouts", titleFr: "Paiements à temps", desc: "Transparent commission, weekly payouts, and a full finance dashboard in your seller portal.", descFr: "Commission transparente, paiements hebdomadaires et tableau de bord finance complet." },
  { icon: "TrendingUp", title: "Growth tools", titleFr: "Outils de croissance", desc: "Promotions, flash sales, analytics, and review management to scale your store.", descFr: "Promotions, flash sales, analytics et gestion des avis pour faire grandir votre boutique." },
  { icon: "ShieldCheck", title: "Trusted marketplace", titleFr: "Marketplace de confiance", desc: "Sell on a verified platform where buyers already shop electronics, fashion, and more.", descFr: "Vendez sur une plateforme vérifiée où les acheteurs achètent déjà électronique, mode et plus." },
  { icon: "Headphones", title: "Seller support", titleFr: "Support vendeur", desc: "Dedicated seller support in French and English — onboarding help when you need it.", descFr: "Support vendeur dédié en français et anglais — aide à l'onboarding quand vous en avez besoin." },
] as const;

export const SELL_ONLINE_STEPS = [
  { step: "1", title: "Create your seller account", titleFr: "Créez votre compte vendeur", desc: "Sign up at /login, complete your business profile, and choose a seller plan.", descFr: "Inscrivez-vous sur /login, complétez votre profil et choisissez un plan vendeur." },
  { step: "2", title: "List your products", titleFr: "Listez vos produits", desc: "Use the product wizard to add SKUs, images, pricing, and inventory — go live in hours.", descFr: "Utilisez l'assistant produit pour ajouter références, images, prix et stock — en ligne en quelques heures." },
  { step: "3", title: "Receive orders", titleFr: "Recevez les commandes", desc: "Orders flow into your seller dashboard — pack, ship, or hand off to Somba fulfillment.", descFr: "Les commandes arrivent dans votre tableau de bord — emballez, expédiez ou confiez au fulfillment Somba." },
  { step: "4", title: "Get paid", titleFr: "Soyez payé", desc: "Track earnings, request payouts, and grow with promotions and analytics.", descFr: "Suivez vos revenus, demandez des paiements et grandissez avec promos et analytics." },
] as const;

export const SELL_ONLINE_TOOLS = [
  { icon: "Package", name: "Product catalog", nameFr: "Catalogue produits", desc: "Wizard, bulk upload, low-stock alerts", descFr: "Assistant, import en masse, alertes stock" },
  { icon: "ShoppingCart", name: "Order management", nameFr: "Gestion commandes", desc: "Queue, pack & ship, tracking updates", descFr: "File, préparation, suivi" },
  { icon: "BarChart3", name: "Analytics", nameFr: "Analytics", desc: "Revenue, funnel, retention, goals", descFr: "Revenus, funnel, rétention, objectifs" },
  { icon: "Sparkles", name: "Promotions", nameFr: "Promotions", desc: "Flash deals and discount campaigns", descFr: "Offres flash et campagnes promo" },
  { icon: "Star", name: "Reviews", nameFr: "Avis", desc: "Respond to customers and build trust", descFr: "Répondez aux clients et gagnez la confiance" },
  { icon: "Wallet", name: "Finance", nameFr: "Finance", desc: "Payouts, statements, commission breakdown", descFr: "Paiements, relevés, détail commissions" },
] as const;

export const SELL_ONLINE_FAQ = [
  { q: "Who can sell on Somba & Tekka?", qFr: "Qui peut vendre sur Somba & Tekka ?", a: "Any registered business or individual seller can apply. You need a valid seller subscription (Starter, Pro, or Enterprise) and completed business verification.", aFr: "Toute entreprise ou vendeur individuel inscrit peut postuler. Abonnement vendeur (Starter, Pro ou Entreprise) et vérification requis." },
  { q: "What are the seller fees?", qFr: "Quels sont les frais vendeur ?", a: "Monthly plans start at $49/mo (Starter). Platform commission applies per category (typically 8–15%). No hidden listing fees on Pro and Enterprise.", aFr: "Plans mensuels à partir de 49 $/mois (Starter). Commission par catégorie (8–15 % en général). Pas de frais de listing cachés sur Pro et Entreprise." },
  { q: "How does fulfillment work?", qFr: "Comment fonctionne le fulfillment ?", a: "You can self-ship or use Somba's hybrid fulfillment — warehouse receives, sorts, and dispatches to riders for last-mile delivery.", aFr: "Expédition autonome ou fulfillment hybride Somba — entrepôt, tri et livraison dernier kilomètre." },
  { q: "When do I get paid?", qFr: "Quand suis-je payé ?", a: "Payouts are processed weekly after order delivery and return window. Request payouts from your seller finance dashboard.", aFr: "Paiements hebdomadaires après livraison et délai de retour. Demandez depuis le tableau de bord finance vendeur." },
  { q: "How fast can I go live?", qFr: "Quel délai pour être en ligne ?", a: "Most sellers list their first products within 24 hours of subscribing. Our onboarding team can help with catalog setup.", aFr: "La plupart des vendeurs listent leurs premiers produits sous 24 h après abonnement. Notre équipe aide à la mise en place du catalogue." },
] as const;

export const SELL_ONLINE_IMAGE = {
  src: "https://images.unsplash.com/photo-1556761175-5973dc0f32e7?q=85&w=2400&auto=format&fit=crop",
  alt: "Business team growing online sales",
} as const;

/** Bento grid cell sizes for portal showcase */
export const PORTAL_BENTO: Record<string, "large" | "medium" | "small"> = {
  admin: "large",
  seller: "medium",
  warehouse: "small",
  rider: "small",
  shop: "medium",
};
