/**
 * The demo catalogue: eight stores, their listings in every state, and the pictures each one needs.
 *
 * Plain data. Nothing here touches a database. `seed-demo.ts` turns it into rows through the real services, and
 * `deploy/demo/images/manifest.json` (built from `images` below) names the picture files.
 *
 * Product names are generic on purpose (no real brands). Categories are the ones `bootstrap-prod` creates.
 */
export type CategoryName = 'Electronics' | 'Fashion' | 'Home & Living' | 'Beauty' | 'Sports' | 'Books' | 'Toys' | 'Grocery';
export type DemoStoreKey = 'A' | 'B' | 'C' | 'F' | 'G';
export type ListingState = 'live' | 'pending' | 'rejected' | 'removed' | 'draft';

export interface DemoProduct {
  /** Stock code, unique per store (the `UQ_products_seller_sku` index). Also the prefix of the picture files. */
  sku: string;
  store: DemoStoreKey;
  category: CategoryName;
  name: string;
  nameFr: string;
  description: string;
  descriptionFr: string;
  /** Price in USD. */
  price: number;
  /** Strike-through price (the discount badge is computed from it). */
  was?: number;
  stock: number;
  state: ListingState;
  /** How many pictures: files `<sku>-1.jpg` … `<sku>-n.jpg`. */
  pictures: number;
  /** What the pictures must show (read by the person choosing them). */
  look: string;
  brand?: string;
  weightGrams: number;
  deliveryDays: number;
  /** Option groups, in English. */
  variants?: { name: string; options: string[] }[];
  /** Units per option label ("Size: M · Colour: Blue"). Keys are exactly the labels the checkout builds. */
  variantStock?: Record<string, number>;
  /** Leave the French text to the machine translator (shows the "Translated automatically" badge on a live server). */
  machineFr?: boolean;
}

export const DEMO_PRODUCTS: DemoProduct[] = [
  // ─────────────────────────── Store A: full catalogue, Pro plan ───────────────────────────
  {
    sku: 'MK-DRS', store: 'A', category: 'Fashion', name: 'Wax Print Maxi Dress', nameFr: 'Robe longue en pagne wax',
    description: 'A long, flowing dress in bold African wax print cotton. Fitted bodice, side pockets, fully lined. Machine washable at 30 degrees.',
    descriptionFr: 'Une robe longue et fluide en coton wax aux motifs africains audacieux. Corsage ajusté, poches latérales, entièrement doublée. Lavable en machine à 30 degrés.',
    price: 45, was: 60, stock: 40, state: 'live', pictures: 8, weightGrams: 450, deliveryDays: 2, brand: 'Maison Kinshasa',
    look: 'African wax print (Ankara/pagne) maxi or long dress, worn by a model or on a hanger. Eight DIFFERENT photos (front, back, detail of the fabric, different prints/colours ok).',
    variants: [{ name: 'Size', options: ['S', 'M', 'L', 'XL'] }, { name: 'Colour', options: ['Blue', 'Red'] }],
    variantStock: { 'Size: S · Colour: Blue': 6, 'Size: M · Colour: Blue': 8, 'Size: L · Colour: Blue': 6, 'Size: XL · Colour: Blue': 4, 'Size: S · Colour: Red': 4, 'Size: M · Colour: Red': 6, 'Size: L · Colour: Red': 4, 'Size: XL · Colour: Red': 2 },
  },
  {
    sku: 'MK-SNK', store: 'A', category: 'Fashion', name: 'Canvas Sneakers', nameFr: 'Baskets en toile',
    description: 'Light everyday sneakers with a rubber sole and cushioned insole. Easy to clean, true to size.',
    descriptionFr: 'Baskets légères pour tous les jours, semelle en caoutchouc et semelle intérieure amortissante. Faciles à nettoyer, taille normale.',
    price: 32, stock: 31, state: 'live', pictures: 3, weightGrams: 700, deliveryDays: 2,
    look: 'Plain canvas sneakers (low-top, white or beige or grey, no visible brand logo), product shots on a clean background or worn.',
    variants: [{ name: 'Size', options: ['40', '41', '42', '43', '44'] }],
    variantStock: { 'Size: 40': 5, 'Size: 41': 8, 'Size: 42': 9, 'Size: 43': 7, 'Size: 44': 2 },
  },
  {
    sku: 'MK-SHR', store: 'A', category: 'Fashion', name: "Men's Linen Shirt", nameFr: 'Chemise en lin pour homme',
    description: 'Breathable short-sleeve linen shirt for hot days. Relaxed fit, button front, chest pocket.',
    descriptionFr: 'Chemise en lin respirante à manches courtes pour les jours chauds. Coupe décontractée, boutonnage devant, poche poitrine.',
    price: 28, stock: 22, state: 'live', pictures: 2, weightGrams: 300, deliveryDays: 2,
    look: "A man's plain linen or cotton casual shirt (white, light blue or beige), on a model or flat lay.",
    variants: [{ name: 'Size', options: ['M', 'L', 'XL'] }],
    variantStock: { 'Size: M': 8, 'Size: L': 9, 'Size: XL': 5 },
  },
  {
    sku: 'MK-BAG', store: 'A', category: 'Fashion', name: 'Leather Handbag', nameFr: 'Sac à main en cuir',
    description: 'Structured handbag in soft faux leather with a zip closure, inner pocket and a removable shoulder strap.',
    descriptionFr: 'Sac à main structuré en similicuir souple, fermeture zippée, poche intérieure et bandoulière amovible.',
    price: 38, was: 49, stock: 14, state: 'live', pictures: 2, weightGrams: 650, deliveryDays: 3,
    look: "A woman's handbag (brown, black or tan), no visible brand logo, product shot on a clean background or held.",
  },
  {
    sku: 'MK-SHB', store: 'A', category: 'Beauty', name: 'Shea Butter 250 g', nameFr: 'Beurre de karité 250 g',
    description: 'Raw, unrefined shea butter for skin and hair. Deeply moisturising, no additives.',
    descriptionFr: 'Beurre de karité brut et non raffiné pour la peau et les cheveux. Hydrate en profondeur, sans additifs.',
    price: 9, stock: 120, state: 'live', pictures: 2, weightGrams: 300, deliveryDays: 1,
    look: 'A jar or lump of shea butter (creamy yellow/ivory), possibly with shea nuts. No readable brand.',
  },
  {
    sku: 'MK-OIL', store: 'A', category: 'Beauty', name: 'Argan Hair Oil 100 ml', nameFr: "Huile d'argan pour cheveux 100 ml",
    description: 'Light argan oil that tames frizz and adds shine. Use on damp or dry hair.',
    descriptionFr: "Huile d'argan légère qui discipline les frisottis et donne de l'éclat. À utiliser sur cheveux humides ou secs.",
    price: 11, stock: 80, state: 'live', pictures: 1, weightGrams: 180, deliveryDays: 1,
    look: 'A small amber/golden glass dropper bottle of oil (argan or hair oil), no readable brand.',
  },
  {
    sku: 'MK-SOP', store: 'A', category: 'Beauty', name: 'African Black Soap Bar', nameFr: 'Savon noir africain',
    description: 'Traditional black soap made with plantain ash and palm oil. Gentle on the skin, cleanses deeply.',
    descriptionFr: "Savon noir traditionnel fabriqué avec de la cendre de plantain et de l'huile de palme. Doux pour la peau, nettoie en profondeur.",
    price: 4, stock: 200, state: 'live', pictures: 1, weightGrams: 150, deliveryDays: 1, machineFr: true,
    look: 'A bar or chunk of dark brown/black natural soap (African black soap), on a neutral background.',
  },
  {
    sku: 'MK-PLM', store: 'A', category: 'Grocery', name: 'Red Palm Oil 1 L', nameFr: 'Huile de palme rouge 1 L',
    description: 'Pure red palm oil, cold pressed and unrefined. Rich colour and flavour for traditional dishes.',
    descriptionFr: "Huile de palme rouge pure, pressée à froid et non raffinée. Couleur et saveur riches pour les plats traditionnels.",
    price: 6.5, was: 8, stock: 150, state: 'live', pictures: 2, weightGrams: 1000, deliveryDays: 1,
    look: 'A bottle or jar of red/orange palm oil (clearly deep orange-red oil), or palm fruits. NOT palm trees only.',
  },
  {
    sku: 'MK-HNY', store: 'A', category: 'Grocery', name: 'Natural Honey 500 g', nameFr: 'Miel naturel 500 g',
    description: 'Raw forest honey from small beekeepers. Thick, floral and unheated.',
    descriptionFr: "Miel brut de forêt issu de petits apiculteurs. Épais, floral et non chauffé.",
    price: 8, stock: 90, state: 'live', pictures: 2, weightGrams: 650, deliveryDays: 1,
    look: 'A jar of honey (golden), with or without a honey dipper. No readable brand.',
  },
  {
    sku: 'MK-COF', store: 'A', category: 'Grocery', name: 'Ground Coffee 500 g', nameFr: 'Café moulu 500 g',
    description: 'Medium-roast Arabica from the Kivu highlands, ground for filter and moka pots.',
    descriptionFr: "Arabica torréfié moyen des hauts plateaux du Kivu, moulu pour filtre et cafetière moka.",
    price: 10, stock: 75, state: 'live', pictures: 2, weightGrams: 520, deliveryDays: 1,
    look: 'Coffee: ground coffee in a bowl or bag, or roasted beans, or a cup of coffee. No readable brand.',
  },
  {
    sku: 'MK-RIC', store: 'A', category: 'Grocery', name: 'Long Grain Rice 5 kg', nameFr: 'Riz long grain 5 kg',
    description: 'Clean, long grain white rice in a 5 kg bag. Cooks fluffy and separate.',
    descriptionFr: 'Riz blanc long grain propre en sac de 5 kg. Cuit léger et bien détaché.',
    price: 9, stock: 6, state: 'live', pictures: 1, weightGrams: 5100, deliveryDays: 2,
    look: 'Uncooked white rice (a bowl, scoop or sack of rice grains). No readable brand.',
  },
  {
    sku: 'MK-LMP', store: 'A', category: 'Home & Living', name: 'Solar LED Lantern', nameFr: 'Lanterne solaire LED',
    description: 'Rechargeable lantern with a solar panel and USB charging. Three brightness modes, up to 12 hours of light.',
    descriptionFr: 'Lanterne rechargeable avec panneau solaire et charge USB. Trois niveaux de luminosité, jusqu’à 12 heures de lumière.',
    price: 14, was: 18, stock: 64, state: 'live', pictures: 2, weightGrams: 380, deliveryDays: 2,
    look: 'A portable LED lantern / camping lantern (lit or unlit), product photo.',
  },
  {
    sku: 'MK-PLT', store: 'A', category: 'Home & Living', name: 'Ceramic Dinner Plate Set, 12 pieces', nameFr: 'Service de 12 assiettes en céramique',
    description: 'Twelve-piece set: four dinner plates, four side plates and four bowls. Dishwasher safe.',
    descriptionFr: 'Service de douze pièces : quatre assiettes plates, quatre assiettes à dessert et quatre bols. Passe au lave-vaisselle.',
    price: 34, stock: 18, state: 'live', pictures: 2, weightGrams: 5200, deliveryDays: 3,
    look: 'A set of plain ceramic plates and bowls (white or pastel), stacked or arranged on a table.',
  },
  {
    sku: 'MK-MAT', store: 'A', category: 'Home & Living', name: 'Woven Floor Mat', nameFr: 'Tapis tressé',
    description: 'Hand-woven floor mat in natural fibre, 120 x 180 cm. Out of stock until the next batch arrives.',
    descriptionFr: 'Tapis tressé à la main en fibres naturelles, 120 x 180 cm. Rupture de stock jusqu’au prochain lot.',
    price: 18, stock: 0, state: 'live', pictures: 1, weightGrams: 2200, deliveryDays: 4,
    look: 'A woven natural-fibre floor mat or rug (straw, raffia, jute), on a floor.',
  },
  {
    sku: 'MK-CSH', store: 'A', category: 'Home & Living', name: 'Cushion Cover Set, 4 pieces', nameFr: 'Housses de coussin, lot de 4',
    description: 'Four printed cushion covers, 45 x 45 cm, with a hidden zip. Colourful geometric patterns.',
    descriptionFr: 'Quatre housses de coussin imprimées, 45 x 45 cm, avec fermeture éclair cachée. Motifs géométriques colorés.',
    price: 16, stock: 35, state: 'live', pictures: 1, weightGrams: 400, deliveryDays: 2, machineFr: true,
    look: 'Colourful patterned throw cushions / cushion covers on a sofa or bed.',
  },
  {
    sku: 'MK-PHN', store: 'A', category: 'Electronics', name: 'Smartphone A15', nameFr: 'Smartphone A15',
    description: '6.5 inch display, 128 GB storage, dual SIM, 5000 mAh battery. Includes charger and cable. One year warranty.',
    descriptionFr: 'Écran de 6,5 pouces, 128 Go de stockage, double SIM, batterie 5000 mAh. Chargeur et câble inclus. Garantie un an.',
    price: 129, was: 149, stock: 8, state: 'live', pictures: 4, weightGrams: 230, deliveryDays: 2, brand: 'Somba Tech',
    look: 'A generic modern smartphone (no visible brand logo or readable brand), front/back/angled/in hand. Four different photos.',
    variants: [{ name: 'Colour', options: ['Black', 'Blue'] }],
    variantStock: { 'Colour: Black': 5, 'Colour: Blue': 3 },
  },
  {
    sku: 'MK-EAR', store: 'A', category: 'Electronics', name: 'Wireless Earbuds', nameFr: 'Écouteurs sans fil',
    description: 'Bluetooth 5.3 earbuds with a charging case. Around 20 hours of playback in total.',
    descriptionFr: 'Écouteurs Bluetooth 5.3 avec boîtier de charge. Environ 20 heures d’écoute au total.',
    price: 24, stock: 55, state: 'live', pictures: 2, weightGrams: 60, deliveryDays: 2,
    look: 'White or black wireless earbuds with a charging case, no readable brand.',
  },
  {
    sku: 'MK-PWR', store: 'A', category: 'Electronics', name: 'Power Bank 20,000 mAh', nameFr: 'Batterie externe 20 000 mAh',
    description: 'Two USB outputs and one USB-C port. Charges a phone about five times. Indicator lights show what is left.',
    descriptionFr: 'Deux sorties USB et un port USB-C. Recharge un téléphone environ cinq fois. Des voyants indiquent la charge restante.',
    price: 22, stock: 48, state: 'live', pictures: 2, weightGrams: 420, deliveryDays: 2,
    look: 'A power bank (portable battery) with cables, no readable brand.',
  },
  {
    sku: 'MK-BLL', store: 'A', category: 'Sports', name: 'Football, Size 5', nameFr: 'Ballon de football, taille 5',
    description: 'Machine-stitched match ball, size 5. Durable cover, good bounce on grass and hard pitches.',
    descriptionFr: 'Ballon de match cousu machine, taille 5. Enveloppe résistante, bon rebond sur herbe et terrain dur.',
    price: 15, stock: 60, state: 'live', pictures: 1, weightGrams: 430, deliveryDays: 2,
    look: 'A football / soccer ball (white with black or coloured panels) on grass or plain background, no readable brand.',
  },
  {
    sku: 'MK-YOG', store: 'A', category: 'Sports', name: 'Yoga Mat', nameFr: 'Tapis de yoga',
    description: 'Non-slip yoga mat, 6 mm thick, with a carrying strap.',
    descriptionFr: 'Tapis de yoga antidérapant de 6 mm d’épaisseur, avec sangle de transport.',
    price: 17, stock: 41, state: 'live', pictures: 1, weightGrams: 900, deliveryDays: 2, machineFr: true,
    look: 'A rolled or unrolled yoga mat (purple, blue, green or grey), no readable brand.',
  },
  {
    sku: 'MK-TOY', store: 'A', category: 'Toys', name: 'Wooden Building Blocks, 50 pieces', nameFr: 'Blocs de construction en bois, 50 pièces',
    description: 'Fifty smooth wooden blocks in different shapes and colours. Safe paint, for ages three and up.',
    descriptionFr: 'Cinquante blocs en bois lisses de formes et couleurs variées. Peinture sans danger, dès trois ans.',
    price: 19, stock: 27, state: 'live', pictures: 2, weightGrams: 1100, deliveryDays: 2,
    look: 'Colourful wooden toy building blocks.',
  },
  {
    sku: 'MK-NBK', store: 'A', category: 'Books', name: 'Planner 2027, A5', nameFr: 'Agenda 2027, A5',
    description: 'Weekly planner with a hard cover, ribbon marker and a pocket for notes. A5 size.',
    descriptionFr: 'Agenda hebdomadaire à couverture rigide, marque-page ruban et pochette pour notes. Format A5.',
    price: 7, stock: 70, state: 'live', pictures: 1, weightGrams: 350, deliveryDays: 2,
    look: 'A planner / notebook / diary on a desk, no readable brand and no year visible other than blank.',
  },
  // Listings in the other moderation states (store A)
  {
    sku: 'MK-LAM', store: 'A', category: 'Home & Living', name: 'Rechargeable Desk Lamp', nameFr: 'Lampe de bureau rechargeable',
    description: 'Foldable LED desk lamp with three colour temperatures and a USB charging port. Waiting for moderation.',
    descriptionFr: 'Lampe de bureau LED pliable à trois températures de couleur et port de charge USB. En attente de modération.',
    price: 16, stock: 30, state: 'pending', pictures: 1, weightGrams: 500, deliveryDays: 2,
    look: 'An LED desk lamp on a desk.',
  },
  {
    sku: 'MK-SPK', store: 'A', category: 'Electronics', name: 'Bluetooth Speaker', nameFr: 'Enceinte Bluetooth',
    description: 'Portable speaker with deep bass and a splash-proof body. Also waiting for moderation.',
    descriptionFr: 'Enceinte portable aux basses profondes, résistante aux éclaboussures. Également en attente de modération.',
    price: 21, stock: 40, state: 'pending', pictures: 1, weightGrams: 520, deliveryDays: 2,
    look: 'A portable bluetooth speaker, no readable brand.',
  },
  {
    sku: 'MK-WCH', store: 'A', category: 'Fashion', name: 'Digital Wrist Watch', nameFr: 'Montre numérique',
    description: 'Digital watch with stopwatch, alarm and a water-resistant case. Rejected: the photo does not show the product clearly.',
    descriptionFr: 'Montre numérique avec chronomètre, alarme et boîtier résistant à l’eau. Refusée : la photo ne montre pas clairement le produit.',
    price: 12, stock: 25, state: 'rejected', pictures: 1, weightGrams: 80, deliveryDays: 3,
    look: 'A digital wrist watch, a plain product photo.',
  },
  {
    sku: 'MK-ENG', store: 'A', category: 'Grocery', name: 'Energy Drink Pack, 12 cans', nameFr: 'Pack de 12 canettes de boisson énergisante',
    description: 'Twelve cans of energy drink. Taken down by a moderator: the label claims were not allowed.',
    descriptionFr: 'Douze canettes de boisson énergisante. Retiré par un modérateur : les allégations de l’étiquette n’étaient pas autorisées.',
    price: 14, stock: 50, state: 'removed', pictures: 1, weightGrams: 4200, deliveryDays: 3,
    look: 'A plain unbranded drink can or several cans (no readable brand or logo).',
  },
  {
    sku: 'MK-BPK', store: 'A', category: 'Fashion', name: 'School Backpack', nameFr: 'Sac à dos scolaire',
    description: 'Padded backpack with two compartments and a bottle pocket. Saved as a draft, not on sale yet.',
    descriptionFr: 'Sac à dos rembourré à deux compartiments et poche pour bouteille. Enregistré en brouillon, pas encore en vente.',
    price: 19, stock: 45, state: 'draft', pictures: 1, weightGrams: 600, deliveryDays: 3,
    look: 'A backpack (plain, no readable brand).',
  },

  // ─────────────────────────── Store B: Free plan (Limete) ───────────────────────────
  {
    sku: 'MB-PNT', store: 'B', category: 'Grocery', name: 'Roasted Peanuts 500 g', nameFr: 'Arachides grillées 500 g',
    description: 'Salted roasted peanuts, packed fresh every week.', descriptionFr: 'Arachides grillées salées, emballées fraîches chaque semaine.',
    price: 4.5, stock: 140, state: 'live', pictures: 1, weightGrams: 520, deliveryDays: 2,
    look: 'Roasted peanuts (in a bowl, bag or scattered).',
  },
  {
    sku: 'MB-FLR', store: 'B', category: 'Grocery', name: 'Cassava Flour 2 kg', nameFr: 'Farine de manioc 2 kg',
    description: 'Fine cassava flour for fufu and bread. Sun-dried and stone-ground.', descriptionFr: 'Farine de manioc fine pour le fufu et le pain. Séchée au soleil et moulue.',
    price: 5, stock: 85, state: 'live', pictures: 1, weightGrams: 2050, deliveryDays: 2, machineFr: true,
    look: 'A bowl or pile of white flour (cassava flour) or cassava roots.',
  },
  {
    sku: 'MB-TEA', store: 'B', category: 'Grocery', name: 'Hibiscus Tea (Bissap) 250 g', nameFr: 'Thé d’hibiscus (bissap) 250 g',
    description: 'Dried hibiscus flowers for a deep red, tangy drink served hot or cold.', descriptionFr: 'Fleurs d’hibiscus séchées pour une boisson rouge et acidulée, chaude ou froide.',
    price: 6, stock: 60, state: 'live', pictures: 1, weightGrams: 270, deliveryDays: 2, machineFr: true,
    look: 'Dried hibiscus flowers or a glass of red hibiscus tea.',
  },
  {
    sku: 'MB-BIN', store: 'B', category: 'Home & Living', name: 'Storage Bin Set, 3 pieces', nameFr: 'Lot de 3 bacs de rangement',
    description: 'Three stackable plastic bins with lids, in three sizes.', descriptionFr: 'Trois bacs en plastique empilables avec couvercle, en trois tailles.',
    price: 17, stock: 28, state: 'live', pictures: 1, weightGrams: 2400, deliveryDays: 3, machineFr: true,
    look: 'Plastic storage bins / containers with lids, stacked.',
  },
  {
    sku: 'MB-BTL', store: 'B', category: 'Sports', name: 'Steel Water Bottle 750 ml', nameFr: 'Gourde en acier 750 ml',
    description: 'Insulated stainless steel bottle that keeps drinks cold for 24 hours or hot for 12.', descriptionFr: 'Gourde isotherme en acier inoxydable qui garde les boissons froides 24 heures ou chaudes 12 heures.',
    price: 13, stock: 52, state: 'live', pictures: 1, weightGrams: 380, deliveryDays: 2, machineFr: true,
    look: 'A stainless steel / metal reusable water bottle, no readable brand.',
  },
  {
    sku: 'MB-TOW', store: 'B', category: 'Home & Living', name: 'Cotton Bath Towel', nameFr: 'Serviette de bain en coton',
    description: 'Soft 100% cotton bath towel, 70 x 140 cm.', descriptionFr: 'Serviette de bain douce en coton 100 %, 70 x 140 cm.',
    price: 11, stock: 66, state: 'live', pictures: 1, weightGrams: 480, deliveryDays: 2, machineFr: true,
    look: 'Folded cotton bath towels (white or coloured).',
  },
  {
    sku: 'MB-NBK', store: 'B', category: 'Books', name: 'Exercise Notebooks, 5 pack', nameFr: 'Cahiers d’exercices, lot de 5',
    description: 'Five ruled school notebooks, 96 pages each.', descriptionFr: 'Cinq cahiers d’écolier à lignes, 96 pages chacun.',
    price: 5.5, stock: 120, state: 'live', pictures: 1, weightGrams: 600, deliveryDays: 2, machineFr: true,
    look: 'A stack of notebooks / exercise books.',
  },

  // ─────────────────────────── Store C: approved, no two-factor ───────────────────────────
  {
    sku: 'MC-FAN', store: 'C', category: 'Electronics', name: 'Rechargeable Stand Fan', nameFr: 'Ventilateur sur pied rechargeable',
    description: 'Quiet stand fan with a built-in battery that runs about eight hours without mains power.', descriptionFr: 'Ventilateur sur pied silencieux avec batterie intégrée, environ huit heures d’autonomie sans secteur.',
    price: 26, stock: 33, state: 'live', pictures: 2, weightGrams: 3600, deliveryDays: 3, machineFr: true,
    look: 'An electric fan (stand fan or desk fan).',
  },
  {
    sku: 'MC-IRN', store: 'C', category: 'Home & Living', name: 'Steam Iron', nameFr: 'Fer à repasser à vapeur',
    description: 'Steam iron with a non-stick soleplate and adjustable temperature.', descriptionFr: 'Fer à vapeur avec semelle antiadhésive et température réglable.',
    price: 21, stock: 24, state: 'live', pictures: 1, weightGrams: 1100, deliveryDays: 3, machineFr: true,
    look: 'A clothes iron (steam iron), no readable brand.',
  },
  {
    sku: 'MC-KTL', store: 'C', category: 'Home & Living', name: 'Electric Kettle 1.7 L', nameFr: 'Bouilloire électrique 1,7 L',
    description: 'Fast-boil kettle with automatic shut-off and a 1.7 litre capacity.', descriptionFr: 'Bouilloire à ébullition rapide avec arrêt automatique et capacité de 1,7 litre.',
    price: 18, stock: 29, state: 'live', pictures: 1, weightGrams: 900, deliveryDays: 3, machineFr: true,
    look: 'An electric kettle (steel or white), no readable brand.',
  },
  {
    sku: 'MC-CHG', store: 'C', category: 'Electronics', name: 'USB Fast Charger', nameFr: 'Chargeur USB rapide',
    description: 'Wall charger with two USB ports and fast charging.', descriptionFr: 'Chargeur mural à deux ports USB avec charge rapide.',
    price: 9, stock: 90, state: 'live', pictures: 1, weightGrams: 90, deliveryDays: 2, machineFr: true,
    look: 'A phone wall charger adapter with a USB cable, no readable brand.',
  },

  // ─────────────────────────── Store F: suspended ───────────────────────────
  {
    sku: 'MF-WCH', store: 'F', category: 'Electronics', name: 'Smart Watch', nameFr: 'Montre connectée',
    description: 'Smart watch with heart-rate sensor, step counter and phone notifications.', descriptionFr: 'Montre connectée avec capteur de fréquence cardiaque, compteur de pas et notifications du téléphone.',
    price: 39, stock: 20, state: 'live', pictures: 1, weightGrams: 120, deliveryDays: 3,
    look: 'A smart watch (generic, no readable brand).',
  },
  {
    sku: 'MF-CSE', store: 'F', category: 'Electronics', name: 'Phone Case Pack, 3 pieces', nameFr: 'Lot de 3 coques de téléphone',
    description: 'Three protective phone cases in different colours.', descriptionFr: 'Trois coques de protection de téléphone dans différentes couleurs.',
    price: 7, stock: 80, state: 'live', pictures: 1, weightGrams: 120, deliveryDays: 3, machineFr: true,
    look: 'Colourful phone cases.',
  },
  {
    sku: 'MF-RNG', store: 'F', category: 'Electronics', name: 'Selfie Ring Light', nameFr: 'Anneau lumineux pour selfie',
    description: 'LED ring light with a tripod stand and a phone holder.', descriptionFr: 'Anneau lumineux LED avec trépied et support de téléphone.',
    price: 15, stock: 35, state: 'live', pictures: 1, weightGrams: 800, deliveryDays: 3, machineFr: true,
    look: 'A ring light with tripod.',
  },

  // ─────────────────────────── Store G: vacation mode ───────────────────────────
  {
    sku: 'MG-BSK', store: 'G', category: 'Home & Living', name: 'Hand-woven Basket', nameFr: 'Panier tressé à la main',
    description: 'Colourful hand-woven basket from raffia and grass. Good for storage or shopping.', descriptionFr: 'Panier coloré tressé à la main en raphia et herbe. Pratique pour le rangement ou les courses.',
    price: 15, stock: 30, state: 'live', pictures: 2, weightGrams: 500, deliveryDays: 4,
    look: 'A hand-woven basket (African woven basket, raffia or grass).',
  },
  {
    sku: 'MG-FIG', store: 'G', category: 'Home & Living', name: 'Carved Wooden Figure', nameFr: 'Figurine en bois sculpté',
    description: 'Hand-carved wooden figure, about 30 cm tall. Each piece is slightly different.', descriptionFr: 'Figurine sculptée à la main en bois, environ 30 cm de haut. Chaque pièce est légèrement différente.',
    price: 29, stock: 12, state: 'live', pictures: 1, weightGrams: 900, deliveryDays: 5,
    look: 'A hand-carved wooden African sculpture/figure (statue), on a plain background.',
  },
  {
    sku: 'MG-BEA', store: 'G', category: 'Fashion', name: 'Beaded Necklace', nameFr: 'Collier de perles',
    description: 'Colourful hand-strung glass bead necklace.', descriptionFr: 'Collier de perles de verre colorées enfilées à la main.',
    price: 12, stock: 40, state: 'live', pictures: 1, weightGrams: 90, deliveryDays: 4, machineFr: true,
    look: 'A colourful beaded necklace or beaded jewelry.',
  },
  {
    sku: 'MG-DRM', store: 'G', category: 'Toys', name: 'Hand Drum', nameFr: 'Tambour à main',
    description: 'Hand-made wooden drum with a goat-skin head, about 40 cm tall.', descriptionFr: 'Tambour artisanal en bois avec peau de chèvre, environ 40 cm de haut.',
    price: 55, stock: 9, state: 'live', pictures: 1, weightGrams: 3500, deliveryDays: 5, machineFr: true,
    look: 'An African hand drum (djembe style).',
  },
];

export interface DemoStore {
  key: DemoStoreKey | 'D' | 'E' | 'H';
  email: string;
  ownerName: string;
  phone: string;
  storeName: string;
  storeNameFr?: string;
  /** Where it stands. `D` is pending KYC, `E` rejected, `F` suspended, `H` approved without a pickup pin. */
  status: 'approved' | 'pending' | 'rejected' | 'suspended';
  plan: 'free' | 'pro';
  twofa: boolean;
  /** Commune code of the pickup address, and the pin. Null for a store that has none (H). */
  pickup: { areaCode: string; address: string; lat: number; lng: number } | null;
  description: string;
  descriptionFr: string;
  scenario: string;
}

/** Pins and addresses (real positions in Kinshasa; the street names are made up). */
export const PINS = {
  gombeSeller: { lat: -4.3152, lng: 15.3098 },
  limeteSeller: { lat: -4.3561, lng: 15.3492 },
  ndoloSeller: { lat: -4.3372, lng: 15.3098 },
  kasaVuboSeller: { lat: -4.3417, lng: 15.3048 },
  gombeCustomer: { lat: -4.3086, lng: 15.3171 },
  masinaCustomer: { lat: -4.3702, lng: 15.3951 },
  malukuCustomer: { lat: -4.4627, lng: 16.0802 },
  ngaliemaCustomer: { lat: -4.3755, lng: 15.2474 },
};

export const DEMO_STORES: DemoStore[] = [
  {
    key: 'A', email: 'seller.a@demo.sombateka.test', ownerName: 'Odette Kalala', phone: '+243 900 000 201', storeName: 'Maison Kinshasa', storeNameFr: 'Maison Kinshasa',
    status: 'approved', plan: 'pro', twofa: true, pickup: { areaCode: 'CD-KN-GOM', address: '14 Avenue du Commerce, Gombe, Kinshasa', ...PINS.gombeSeller },
    description: 'Everyday fashion, food and home goods from Gombe. Orders packed within a day, with a Pro plan: promotions, coupons, flash sales and a full team.',
    descriptionFr: 'Mode, alimentation et articles pour la maison de Gombe. Commandes préparées sous un jour, avec un plan Pro : promotions, coupons, ventes flash et équipe complète.',
    scenario: 'Approved, Pro plan, two-factor on. Full catalogue in every product state, orders in every state, team of every role.',
  },
  {
    key: 'B', email: 'seller.b@demo.sombateka.test', ownerName: 'Jacques Mwamba', phone: '+243 900 000 202', storeName: 'Limete Grossiste',
    status: 'approved', plan: 'free', twofa: true, pickup: { areaCode: 'CD-KN-LMT', address: '8 Boulevard Lumumba, Limete, Kinshasa', ...PINS.limeteSeller },
    description: 'Wholesale groceries and household goods from Limete. Second store for a two-seller basket, on the Free plan.',
    descriptionFr: 'Épicerie en gros et articles ménagers de Limete. Deuxième boutique pour un panier à deux vendeurs, plan gratuit.',
    scenario: 'Approved, Free plan, other commune. The second seller in a two-seller basket. Plan perks (coupons, flash sales, bulk import, team seats) are refused.',
  },
  {
    key: 'C', email: 'seller.c@demo.sombateka.test', ownerName: 'Prisca Lunda', phone: '+243 900 000 203', storeName: 'Ndolo Électro',
    status: 'approved', plan: 'free', twofa: false, pickup: { areaCode: 'CD-KN-KSV', address: '3 Avenue Kasa-Vubu, Kinshasa', ...PINS.ndoloSeller },
    description: 'Small electrical goods and kitchen appliances.', descriptionFr: 'Petit électroménager et appareils de cuisine.',
    scenario: 'Approved but two-factor is not set up. With the platform rule "seller two-factor required" on, sign-in forces enrolment.',
  },
  {
    key: 'D', email: 'seller.d@demo.sombateka.test', ownerName: 'Fiston Mbala', phone: '+243 900 000 204', storeName: 'Bandal Textiles',
    status: 'pending', plan: 'free', twofa: true, pickup: null, description: '', descriptionFr: '',
    scenario: 'KYC submitted and waiting. An admin (moderation, operations or super admin) approves or rejects it.',
  },
  {
    key: 'E', email: 'seller.e@demo.sombateka.test', ownerName: 'Sylvie Nsimba', phone: '+243 900 000 205', storeName: 'Kintambo Cosmétiques',
    status: 'rejected', plan: 'free', twofa: true, pickup: null, description: '', descriptionFr: '',
    scenario: 'Application rejected with a reason. The owner corrects the KYC and resubmits.',
  },
  {
    key: 'F', email: 'seller.f@demo.sombateka.test', ownerName: 'Pascal Ngoy', phone: '+243 900 000 206', storeName: 'Gombe Gadgets',
    status: 'suspended', plan: 'free', twofa: true, pickup: { areaCode: 'CD-KN-GOM', address: '27 Avenue de la Gombe, Kinshasa', ...PINS.gombeSeller },
    description: 'Phone accessories and small gadgets.', descriptionFr: 'Accessoires pour téléphone et petits gadgets.',
    scenario: 'Suspended. The portal is read only: orders and earnings can be read, nothing else can be changed. Listings are off the shop.',
  },
  {
    key: 'G', email: 'seller.g@demo.sombateka.test', ownerName: 'Aimé Kabeya', phone: '+243 900 000 207', storeName: 'Kasa-Vubu Artisanat',
    status: 'approved', plan: 'free', twofa: true, pickup: { areaCode: 'CD-KN-KSV', address: '12 Rue de l’Artisanat, Kasa-Vubu, Kinshasa', ...PINS.kasaVuboSeller },
    description: 'Hand-made baskets, carvings, jewellery and drums.', descriptionFr: 'Paniers, sculptures, bijoux et tambours faits à la main.',
    scenario: 'Vacation mode on until the date set. Listings show but cannot be ordered, and the shop says when the store is back.',
  },
  {
    key: 'H', email: 'seller.h@demo.sombateka.test', ownerName: 'Noël Tshimanga', phone: '+243 900 000 208', storeName: 'Ngaliema Fournitures',
    status: 'approved', plan: 'free', twofa: true, pickup: null, description: 'School and office supplies.', descriptionFr: 'Fournitures scolaires et de bureau.',
    scenario: 'Approved but no pickup pin. Listing a product is refused until the pickup location is pinned on the map.',
  },
];

/**
 * Pictures that belong to no listing: store banners, customer photos on reviews, chat messages, returns and support,
 * Store logos are drawn by `deploy/demo/images/make-logos.py`
 * (monogram on a colour), so they need no source photo.
 */
export interface DemoExtraImage {
  file: string;
  kind: 'banner' | 'review' | 'chat' | 'issue' | 'support' | 'logo';
  /** Pixels: banners and CMS pictures are wide, the rest are square (800 x 800). */
  width: number;
  height: number;
  look: string;
}
export const DEMO_EXTRA_IMAGES: DemoExtraImage[] = [
  { file: 'logo-A.jpg', kind: 'logo', width: 800, height: 800, look: 'drawn' },
  { file: 'logo-B.jpg', kind: 'logo', width: 800, height: 800, look: 'drawn' },
  { file: 'logo-C.jpg', kind: 'logo', width: 800, height: 800, look: 'drawn' },
  { file: 'logo-F.jpg', kind: 'logo', width: 800, height: 800, look: 'drawn' },
  { file: 'logo-G.jpg', kind: 'logo', width: 800, height: 800, look: 'drawn' },
  { file: 'logo-H.jpg', kind: 'logo', width: 800, height: 800, look: 'drawn' },
  { file: 'banner-A.jpg', kind: 'banner', width: 1600, height: 600, look: 'Colourful African wax print fabrics and clothing in a shop or market stall (wide photo).' },
  { file: 'banner-B.jpg', kind: 'banner', width: 1600, height: 600, look: 'Shelves or sacks of groceries and staples in a wholesale shop or market (wide photo).' },
  { file: 'banner-C.jpg', kind: 'banner', width: 1600, height: 600, look: 'Small kitchen appliances / electrical goods on shelves or a table (wide photo).' },
  { file: 'banner-G.jpg', kind: 'banner', width: 1600, height: 600, look: 'African handicrafts: baskets, wooden carvings, beads, at a craft market (wide photo).' },
  { file: 'banner-F.jpg', kind: 'banner', width: 1600, height: 600, look: 'Phone accessories and gadgets on a table (wide photo).' },
  { file: 'review-1.jpg', kind: 'review', width: 800, height: 800, look: 'Customer photo: a woman or a flat lay showing a colourful African print dress received at home.' },
  { file: 'review-2.jpg', kind: 'review', width: 800, height: 800, look: 'Customer photo: plain canvas sneakers on feet or on a floor.' },
  { file: 'review-3.jpg', kind: 'review', width: 800, height: 800, look: 'Customer photo: a smartphone in a hand.' },
  { file: 'review-4.jpg', kind: 'review', width: 800, height: 800, look: 'Customer photo: a jar of honey on a kitchen counter.' },
  { file: 'review-5.jpg', kind: 'review', width: 800, height: 800, look: 'Customer photo: a handbag on a table or a chair.' },
  { file: 'review-6.jpg', kind: 'review', width: 800, height: 800, look: 'Customer photo: a lit lantern at night.' },
  { file: 'review-7.jpg', kind: 'review', width: 800, height: 800, look: 'Customer photo: a bottle of palm oil or a pot being cooked with red oil.' },
  { file: 'review-8.jpg', kind: 'review', width: 800, height: 800, look: 'Customer photo: wireless earbuds with their case.' },
  { file: 'chat-1.jpg', kind: 'chat', width: 800, height: 800, look: 'A customer sends the seller a picture of a dress she likes in another colour (a wax print dress on a hanger).' },
  { file: 'chat-2.jpg', kind: 'chat', width: 800, height: 800, look: 'Seller sends back a photo of a folded dress and a tape measure showing the size.' },
  { file: 'chat-3.jpg', kind: 'chat', width: 800, height: 800, look: 'A parcel / cardboard box at a doorstep.' },
  { file: 'issue-1.jpg', kind: 'issue', width: 800, height: 800, look: 'A damaged item: a smartphone with a cracked screen.' },
  { file: 'issue-2.jpg', kind: 'issue', width: 800, height: 800, look: 'A damaged item: a dress or fabric with a visible tear or stain.' },
  { file: 'issue-3.jpg', kind: 'issue', width: 800, height: 800, look: 'A crushed / dented cardboard box.' },
  { file: 'support-1.jpg', kind: 'support', width: 800, height: 800, look: 'A parcel, receipt or packing slip on a table (no readable personal data).' },
];
