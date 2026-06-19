import 'package:google_maps_flutter/google_maps_flutter.dart';

import '../models/models.dart';

/// Seeded demo data. Everything the UI shows comes from here until the
/// Node.js backend (Milestone 2+) replaces this layer.
class MockData {
  MockData._();

  static const fxRateCdfPerUsd = 2850.0;

  static const warehouseKinshasa = LatLng(-4.3179, 15.3136); // Gombe

  static const communesKinshasa = [
    'Gombe',
    'Limete',
    'Masina',
    'Lemba',
    'Ngaliema',
    'Kintambo',
    'Kalamu',
  ];

  static const communePositions = <String, LatLng>{
    'Gombe': LatLng(-4.3030, 15.2980),
    'Limete': LatLng(-4.3450, 15.3500),
    'Masina': LatLng(-4.3850, 15.4050),
    'Lemba': LatLng(-4.3880, 15.3300),
    'Ngaliema': LatLng(-4.3520, 15.2520),
    'Kintambo': LatLng(-4.3280, 15.2730),
    'Kalamu': LatLng(-4.3420, 15.3130),
  };

  static const deliveryFees = <String, double>{
    'Gombe': 3,
    'Limete': 5,
    'Masina': 6,
    'Lemba': 5,
    'Ngaliema': 4,
    'Kintambo': 4,
    'Kalamu': 4,
  };

  static const coupons = [
    Coupon(code: 'SOMBA10', percentOff: 10, minOrder: 50),
    Coupon(code: 'SAVE20', fixedOff: 20, minOrder: 100),
  ];

  static const categories = [
    Category(
      id: 'electronics',
      nameEn: 'Electronics',
      nameFr: 'Électronique',
      iconCodePoint: 0xe1bc, // devices
      subcategoriesEn: ['Phones', 'Laptops', 'Audio', 'TV & Video', 'Accessories'],
      subcategoriesFr: ['Téléphones', 'Ordinateurs', 'Audio', 'TV & Vidéo', 'Accessoires'],
    ),
    Category(
      id: 'fashion',
      nameEn: 'Fashion',
      nameFr: 'Mode',
      iconCodePoint: 0xef6b, // checkroom
      subcategoriesEn: ['Men', 'Women', 'Kids', 'Shoes', 'Bags'],
      subcategoriesFr: ['Hommes', 'Femmes', 'Enfants', 'Chaussures', 'Sacs'],
    ),
    Category(
      id: 'home',
      nameEn: 'Home & Living',
      nameFr: 'Maison & Déco',
      iconCodePoint: 0xe88a, // home
      subcategoriesEn: ['Furniture', 'Kitchen', 'Décor', 'Appliances'],
      subcategoriesFr: ['Meubles', 'Cuisine', 'Décoration', 'Électroménager'],
    ),
    Category(
      id: 'beauty',
      nameEn: 'Beauty & Care',
      nameFr: 'Beauté & Soins',
      iconCodePoint: 0xe87c, // face
      returnable: false,
      subcategoriesEn: ['Skincare', 'Hair', 'Fragrance'],
      subcategoriesFr: ['Soins de la peau', 'Cheveux', 'Parfums'],
    ),
    Category(
      id: 'grocery',
      nameEn: 'Food & Beverages',
      nameFr: 'Alimentation & Boissons',
      iconCodePoint: 0xe8cc, // shopping_basket
      returnable: false,
      subcategoriesEn: ['Drinks', 'Snacks', 'Staples'],
      subcategoriesFr: ['Boissons', 'Snacks', 'Produits de base'],
    ),
    Category(
      id: 'sports',
      nameEn: 'Sports & Outdoors',
      nameFr: 'Sport & Plein air',
      iconCodePoint: 0xe566, // sports_soccer
      subcategoriesEn: ['Fitness', 'Football', 'Cycling'],
      subcategoriesFr: ['Fitness', 'Football', 'Cyclisme'],
    ),
    Category(
      id: 'kids',
      nameEn: 'Baby & Kids',
      nameFr: 'Bébé & Enfants',
      iconCodePoint: 0xe59c, // child_care icon approx
      subcategoriesEn: ['Toys', 'Clothing', 'Care'],
      subcategoriesFr: ['Jouets', 'Vêtements', 'Soins'],
    ),
    Category(
      id: 'auto',
      nameEn: 'Automotive',
      nameFr: 'Automobile',
      iconCodePoint: 0xe531, // directions_car
      subcategoriesEn: ['Parts', 'Care', 'Accessories'],
      subcategoriesFr: ['Pièces', 'Entretien', 'Accessoires'],
    ),
  ];

  static const stores = [
    Store(
      id: 'st-kin-electro',
      name: 'Kin Électro Plus',
      tagline: 'Téléphones et accessoires originaux',
      city: 'Kinshasa',
      commune: 'Gombe',
      rating: 4.7,
      reviewCount: 1284,
      bannerSeed: 'store-electro-banner',
      logoSeed: 'store-electro-logo',
    ),
    Store(
      id: 'st-mama-ngozi',
      name: 'Mama Ngozi Fashion',
      tagline: 'La mode congolaise au meilleur prix',
      city: 'Kinshasa',
      commune: 'Kalamu',
      rating: 4.5,
      reviewCount: 893,
      bannerSeed: 'store-fashion-banner',
      logoSeed: 'store-fashion-logo',
    ),
    Store(
      id: 'st-maison-belle',
      name: 'Maison Belle',
      tagline: 'Tout pour votre maison',
      city: 'Kinshasa',
      commune: 'Limete',
      rating: 4.3,
      reviewCount: 456,
      bannerSeed: 'store-home-banner',
      logoSeed: 'store-home-logo',
    ),
    Store(
      id: 'st-lubum-tech',
      name: 'Lubum Tech',
      tagline: 'Informatique et gaming à Lubumbashi',
      city: 'Lubumbashi',
      commune: 'Centre',
      rating: 4.6,
      reviewCount: 671,
      bannerSeed: 'store-tech-banner',
      logoSeed: 'store-tech-logo',
    ),
  ];

  static const _demoReviews = [
    Review(
      author: 'Jean K.',
      rating: 5,
      text: 'Produit conforme, livraison rapide à Gombe. Je recommande.',
      date: '02/06/2026',
    ),
    Review(
      author: 'Aline M.',
      rating: 4,
      text: 'Bonne qualité pour le prix. Le vendeur répond vite.',
      date: '28/05/2026',
    ),
    Review(
      author: 'Patrick T.',
      rating: 4.5,
      text: 'Très satisfait, emballage soigné.',
      date: '19/05/2026',
    ),
  ];

  static const products = [
    Product(
      id: 'p-phone-a15',
      nameEn: 'Samsung Galaxy A15 128GB',
      nameFr: 'Samsung Galaxy A15 128 Go',
      descriptionEn:
          'Original Samsung Galaxy A15 with 128GB storage, 6GB RAM, 50MP triple camera and 5000mAh battery. 12 months seller warranty.',
      descriptionFr:
          'Samsung Galaxy A15 original avec 128 Go de stockage, 6 Go de RAM, triple caméra 50 MP et batterie 5000 mAh. Garantie vendeur 12 mois.',
      price: 165,
      originalPrice: 199,
      rating: 4.6,
      reviewCount: 312,
      stock: 24,
      deliveryDays: 1,
      categoryId: 'electronics',
      storeId: 'st-kin-electro',
      brand: 'Samsung',
      imageSeeds: ['phone-a15-1', 'phone-a15-2', 'phone-a15-3'],
      variants: [
        ProductVariant(
          nameEn: 'Color',
          nameFr: 'Couleur',
          options: ['Blue', 'Black', 'Yellow'],
        ),
      ],
      reviews: _demoReviews,
      isFlashDeal: true,
    ),
    Product(
      id: 'p-earbuds',
      nameEn: 'Oraimo FreePods 4 Wireless Earbuds',
      nameFr: 'Écouteurs sans fil Oraimo FreePods 4',
      descriptionEn:
          'True wireless earbuds with active noise cancellation, 35h total battery and fast charging.',
      descriptionFr:
          'Écouteurs sans fil avec réduction active du bruit, 35 h d’autonomie totale et charge rapide.',
      price: 29,
      originalPrice: 45,
      rating: 4.4,
      reviewCount: 528,
      stock: 67,
      deliveryDays: 1,
      categoryId: 'electronics',
      storeId: 'st-kin-electro',
      brand: 'Oraimo',
      imageSeeds: ['earbuds-1', 'earbuds-2'],
      reviews: _demoReviews,
      isFlashDeal: true,
    ),
    Product(
      id: 'p-laptop',
      nameEn: 'HP Pavilion 15 — i5 / 16GB / 512GB SSD',
      nameFr: 'HP Pavilion 15 — i5 / 16 Go / 512 Go SSD',
      descriptionEn:
          'Powerful everyday laptop with Intel Core i5, 16GB RAM and 512GB SSD. French AZERTY keyboard.',
      descriptionFr:
          'Ordinateur portable performant avec Intel Core i5, 16 Go de RAM et SSD 512 Go. Clavier AZERTY.',
      price: 620,
      originalPrice: 720,
      rating: 4.7,
      reviewCount: 145,
      stock: 8,
      deliveryDays: 2,
      categoryId: 'electronics',
      storeId: 'st-lubum-tech',
      brand: 'HP',
      imageSeeds: ['laptop-1', 'laptop-2', 'laptop-3'],
      reviews: _demoReviews,
    ),
    Product(
      id: 'p-tv43',
      nameEn: 'Hisense 43" Smart TV Full HD',
      nameFr: 'Téléviseur Hisense 43" Smart TV Full HD',
      descriptionEn:
          '43-inch smart TV with Netflix, YouTube and DStv Now built in. 2 years warranty.',
      descriptionFr:
          'Téléviseur intelligent 43 pouces avec Netflix, YouTube et DStv Now intégrés. Garantie 2 ans.',
      price: 285,
      rating: 4.5,
      reviewCount: 89,
      stock: 12,
      deliveryDays: 2,
      categoryId: 'electronics',
      storeId: 'st-kin-electro',
      brand: 'Hisense',
      imageSeeds: ['tv-1', 'tv-2'],
      isNew: true,
      reviews: _demoReviews,
    ),
    Product(
      id: 'p-wax-dress',
      nameEn: 'Wax Print Maxi Dress',
      nameFr: 'Robe longue en pagne wax',
      descriptionEn:
          'Handmade maxi dress in premium Congolese wax fabric. Tailored fit, vibrant patterns.',
      descriptionFr:
          'Robe longue cousue main en tissu wax congolais premium. Coupe ajustée, motifs éclatants.',
      price: 38,
      originalPrice: 52,
      rating: 4.8,
      reviewCount: 234,
      stock: 31,
      deliveryDays: 2,
      categoryId: 'fashion',
      storeId: 'st-mama-ngozi',
      brand: 'Mama Ngozi',
      imageSeeds: ['dress-1', 'dress-2', 'dress-3'],
      variants: [
        ProductVariant(
          nameEn: 'Size',
          nameFr: 'Taille',
          options: ['S', 'M', 'L', 'XL'],
        ),
        ProductVariant(
          nameEn: 'Pattern',
          nameFr: 'Motif',
          options: ['Kinshasa Bleu', 'Soleil Rouge', 'Fleur Verte'],
        ),
      ],
      reviews: _demoReviews,
      isFlashDeal: true,
    ),
    Product(
      id: 'p-sneakers',
      nameEn: 'Urban Classic Sneakers',
      nameFr: 'Baskets Urban Classic',
      descriptionEn:
          'Comfortable everyday sneakers with cushioned sole and breathable upper.',
      descriptionFr:
          'Baskets confortables pour tous les jours avec semelle amortie et tige respirante.',
      price: 45,
      rating: 4.2,
      reviewCount: 167,
      stock: 0,
      deliveryDays: 2,
      categoryId: 'fashion',
      storeId: 'st-mama-ngozi',
      brand: 'Urban',
      imageSeeds: ['sneakers-1', 'sneakers-2'],
      variants: [
        ProductVariant(
          nameEn: 'Size',
          nameFr: 'Pointure',
          options: ['40', '41', '42', '43', '44'],
        ),
      ],
      reviews: _demoReviews,
    ),
    Product(
      id: 'p-handbag',
      nameEn: 'Leather Tote Handbag',
      nameFr: 'Sac à main cabas en cuir',
      descriptionEn: 'Genuine leather tote with inner zip pocket and magnetic clasp.',
      descriptionFr:
          'Cabas en cuir véritable avec poche zippée intérieure et fermoir magnétique.',
      price: 59,
      originalPrice: 75,
      rating: 4.6,
      reviewCount: 98,
      stock: 14,
      deliveryDays: 2,
      categoryId: 'fashion',
      storeId: 'st-mama-ngozi',
      brand: 'Belle Cuir',
      imageSeeds: ['handbag-1', 'handbag-2'],
      isNew: true,
      reviews: _demoReviews,
    ),
    Product(
      id: 'p-blender',
      nameEn: 'Multifunction Blender 1.5L',
      nameFr: 'Mixeur multifonction 1,5 L',
      descriptionEn:
          '600W blender with 1.5L glass jar, 3 speeds and pulse mode. Perfect for juices and sauces.',
      descriptionFr:
          'Mixeur 600 W avec bol en verre 1,5 L, 3 vitesses et mode pulse. Idéal pour jus et sauces.',
      price: 32,
      originalPrice: 40,
      rating: 4.3,
      reviewCount: 211,
      stock: 42,
      deliveryDays: 1,
      categoryId: 'home',
      storeId: 'st-maison-belle',
      brand: 'Sokany',
      imageSeeds: ['blender-1', 'blender-2'],
      reviews: _demoReviews,
      isFlashDeal: true,
    ),
    Product(
      id: 'p-sofa',
      nameEn: '3-Seater Fabric Sofa',
      nameFr: 'Canapé 3 places en tissu',
      descriptionEn:
          'Modern 3-seater sofa with solid wood frame and washable cushion covers.',
      descriptionFr:
          'Canapé moderne 3 places avec structure en bois massif et housses lavables.',
      price: 390,
      rating: 4.4,
      reviewCount: 36,
      stock: 5,
      deliveryDays: 4,
      categoryId: 'home',
      storeId: 'st-maison-belle',
      brand: 'Maison Belle',
      imageSeeds: ['sofa-1', 'sofa-2'],
      variants: [
        ProductVariant(
          nameEn: 'Color',
          nameFr: 'Couleur',
          options: ['Gris', 'Bleu nuit', 'Beige'],
        ),
      ],
      reviews: _demoReviews,
      isNew: true,
    ),
    Product(
      id: 'p-shea-cream',
      nameEn: 'Shea Butter Body Cream 250ml',
      nameFr: 'Crème corporelle au karité 250 ml',
      descriptionEn:
          '100% natural shea butter cream, deeply moisturizing. Non-returnable category.',
      descriptionFr:
          'Crème au beurre de karité 100 % naturelle, hydratation intense. Catégorie non retournable.',
      price: 12,
      rating: 4.7,
      reviewCount: 402,
      stock: 88,
      deliveryDays: 1,
      categoryId: 'beauty',
      storeId: 'st-mama-ngozi',
      brand: 'Karité Pur',
      imageSeeds: ['cream-1'],
      reviews: _demoReviews,
    ),
    Product(
      id: 'p-coffee',
      nameEn: 'Kivu Arabica Coffee 500g',
      nameFr: 'Café Arabica du Kivu 500 g',
      descriptionEn:
          'Single-origin arabica beans from the Kivu highlands, medium roast. Non-returnable category.',
      descriptionFr:
          'Grains d’arabica d’origine unique des hauts plateaux du Kivu, torréfaction moyenne. Catégorie non retournable.',
      price: 9,
      originalPrice: 12,
      rating: 4.9,
      reviewCount: 521,
      stock: 120,
      deliveryDays: 1,
      categoryId: 'grocery',
      storeId: 'st-maison-belle',
      brand: 'Kivu Café',
      imageSeeds: ['coffee-1', 'coffee-2'],
      reviews: _demoReviews,
      isFlashDeal: true,
    ),
    Product(
      id: 'p-football',
      nameEn: 'Pro Match Football Size 5',
      nameFr: 'Ballon de football Pro Match taille 5',
      descriptionEn: 'FIFA-quality match ball, hand-stitched, size 5.',
      descriptionFr: 'Ballon de match qualité FIFA, cousu main, taille 5.',
      price: 22,
      rating: 4.5,
      reviewCount: 76,
      stock: 53,
      deliveryDays: 2,
      categoryId: 'sports',
      storeId: 'st-lubum-tech',
      brand: 'ProPlay',
      imageSeeds: ['football-1'],
      reviews: _demoReviews,
    ),
    Product(
      id: 'p-toy-blocks',
      nameEn: 'Creative Building Blocks 250 pcs',
      nameFr: 'Blocs de construction créatifs 250 pcs',
      descriptionEn: '250-piece building block set, compatible with major brands. Ages 4+.',
      descriptionFr:
          'Ensemble de 250 blocs de construction, compatible avec les grandes marques. Dès 4 ans.',
      price: 18,
      originalPrice: 25,
      rating: 4.6,
      reviewCount: 143,
      stock: 39,
      deliveryDays: 2,
      categoryId: 'kids',
      storeId: 'st-maison-belle',
      brand: 'BlocFun',
      imageSeeds: ['blocks-1', 'blocks-2'],
      reviews: _demoReviews,
      isNew: true,
    ),
    Product(
      id: 'p-car-charger',
      nameEn: 'Fast Car Charger Dual USB-C',
      nameFr: 'Chargeur voiture rapide double USB-C',
      descriptionEn: '45W dual-port car charger with LED display.',
      descriptionFr: 'Chargeur voiture 45 W à deux ports avec écran LED.',
      price: 14,
      rating: 4.1,
      reviewCount: 64,
      stock: 71,
      deliveryDays: 1,
      categoryId: 'auto',
      storeId: 'st-kin-electro',
      brand: 'Oraimo',
      imageSeeds: ['charger-1'],
      reviews: _demoReviews,
    ),
  ];

  static const demoUser = AppUser(
    id: 'u-1',
    name: 'Grâce Ilunga',
    phone: '+243 991 234 567',
    email: 'grace.ilunga@example.cd',
    city: 'Kinshasa',
  );

  static const initialAddresses = [
    Address(
      id: 'addr-1',
      label: 'Maison',
      detail: 'Av. de la Paix 24, près de l’école Saint-Joseph',
      commune: 'Limete',
      city: 'Kinshasa',
      phone: '+243 991 234 567',
      position: LatLng(-4.3450, 15.3500),
      isDefault: true,
    ),
    Address(
      id: 'addr-2',
      label: 'Bureau',
      detail: 'Blvd du 30 Juin, Immeuble Modern Office, 3e étage',
      commune: 'Gombe',
      city: 'Kinshasa',
      phone: '+243 991 234 567',
      position: LatLng(-4.3030, 15.2980),
    ),
  ];

  static List<WalletEntry> initialWalletEntries() {
    final now = DateTime.now();
    return [
      WalletEntry(
        id: 'w-1',
        type: WalletEntryType.refund,
        amount: 38,
        descriptionEn: 'Refund — order ORD-2026-0098',
        descriptionFr: 'Remboursement — commande ORD-2026-0098',
        at: now.subtract(const Duration(days: 6)),
      ),
      WalletEntry(
        id: 'w-2',
        type: WalletEntryType.cashback,
        amount: 2.5,
        descriptionEn: 'Cashback — flash deals week',
        descriptionFr: 'Cashback — semaine des ventes flash',
        at: now.subtract(const Duration(days: 12)),
      ),
      WalletEntry(
        id: 'w-3',
        type: WalletEntryType.topUp,
        amount: 20,
        descriptionEn: 'Top-up via Airtel Money',
        descriptionFr: 'Recharge via Airtel Money',
        at: now.subtract(const Duration(days: 20)),
      ),
    ];
  }

  static List<AppNotification> initialNotifications() {
    final now = DateTime.now();
    return [
      AppNotification(
        id: 'n-1',
        type: NotificationType.order,
        titleEn: 'Out for delivery',
        titleFr: 'En cours de livraison',
        bodyEn: 'Order ORD-2026-0112 is out for delivery today.',
        bodyFr: 'La commande ORD-2026-0112 est en cours de livraison aujourd’hui.',
        at: now.subtract(const Duration(hours: 2)),
      ),
      AppNotification(
        id: 'n-2',
        type: NotificationType.promo,
        titleEn: 'Flash deals — up to 40% off',
        titleFr: 'Ventes flash — jusqu’à -40 %',
        bodyEn: 'Electronics deals end tonight at midnight.',
        bodyFr: 'Les offres électronique se terminent ce soir à minuit.',
        at: now.subtract(const Duration(hours: 9)),
      ),
      AppNotification(
        id: 'n-3',
        type: NotificationType.order,
        titleEn: 'Order delivered',
        titleFr: 'Commande livrée',
        bodyEn: 'Order ORD-2026-0104 was delivered. Tell us what you think!',
        bodyFr: 'La commande ORD-2026-0104 a été livrée. Donnez-nous votre avis !',
        at: now.subtract(const Duration(days: 2)),
        read: true,
      ),
      AppNotification(
        id: 'n-4',
        type: NotificationType.system,
        titleEn: 'Welcome to Somba&Teka',
        titleFr: 'Bienvenue chez Somba&Teka',
        bodyEn: 'Buy from every store in Kinshasa, delivered to your door.',
        bodyFr: 'Achetez dans toutes les boutiques de Kinshasa, livré à votre porte.',
        at: now.subtract(const Duration(days: 8)),
        read: true,
      ),
    ];
  }

  static Product productById(String id) =>
      products.firstWhere((p) => p.id == id);

  static Store storeById(String id) => stores.firstWhere((s) => s.id == id);

  /// Pre-seeded orders so the Orders tab is alive on first launch.
  static List<Order> initialOrders() {
    final now = DateTime.now();
    final home = initialAddresses.first;

    Order build({
      required String id,
      required String productId,
      required int qty,
      required DateTime placedAt,
      required OrderStatus status,
      required PaymentMethod method,
    }) {
      final product = productById(productId);
      final store = storeById(product.storeId);
      final mainStatuses = OrderStatus.values
          .where((s) => !s.isException)
          .toList();
      final reachedIndex = status.isException
          ? OrderStatus.values.indexOf(OrderStatus.confirmed)
          : mainStatuses.indexOf(status);
      var cursor = placedAt;
      final timeline = <TimelineEntry>[];
      for (var i = 0; i < mainStatuses.length; i++) {
        if (!status.isException && i <= reachedIndex) {
          timeline.add(TimelineEntry(status: mainStatuses[i], at: cursor));
          cursor = cursor.add(const Duration(hours: 5));
        } else {
          timeline.add(TimelineEntry(status: mainStatuses[i]));
        }
      }
      final sellerPos =
          communePositions[store.commune] ?? warehouseKinshasa;
      return Order(
        id: id,
        store: store,
        items: [
          OrderItem(
            product: product,
            selectedVariants: const {},
            quantity: qty,
            price: product.price,
          ),
        ],
        address: home,
        paymentMethod: method,
        subtotal: product.price * qty,
        deliveryFee: deliveryFees[home.commune] ?? 5,
        discount: 0,
        placedAt: placedAt,
        status: status,
        timeline: timeline,
        route: [sellerPos, warehouseKinshasa, home.position],
      );
    }

    return [
      build(
        id: 'ORD-2026-0112',
        productId: 'p-earbuds',
        qty: 1,
        placedAt: now.subtract(const Duration(days: 2)),
        status: OrderStatus.outForDelivery,
        method: PaymentMethod.airtelMoney,
      ),
      build(
        id: 'ORD-2026-0104',
        productId: 'p-wax-dress',
        qty: 2,
        placedAt: now.subtract(const Duration(days: 5)),
        status: OrderStatus.delivered,
        method: PaymentMethod.card,
      ),
      build(
        id: 'ORD-2026-0089',
        productId: 'p-blender',
        qty: 1,
        placedAt: now.subtract(const Duration(days: 16)),
        status: OrderStatus.completed,
        method: PaymentMethod.mpesa,
      ),
    ];
  }
}
