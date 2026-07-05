import 'mock_data.dart';

/// Seller tier, mirroring the admin `SellerBadge` union
/// (gold · silver · bronze · somba_assured).
enum SellerBadge { gold, silver, bronze, sombaAssured }

extension SellerBadgeMeta on SellerBadge {
  String get label => switch (this) {
        SellerBadge.gold => 'Gold seller',
        SellerBadge.silver => 'Silver seller',
        SellerBadge.bronze => 'Bronze seller',
        SellerBadge.sombaAssured => 'Somba Assured',
      };
}

SellerBadge _badgeFrom(String? s) {
  switch (s) {
    case 'gold':
      return SellerBadge.gold;
    case 'bronze':
      return SellerBadge.bronze;
    case 'somba_assured':
      return SellerBadge.sombaAssured;
    default:
      return SellerBadge.silver;
  }
}

class Seller {
  final String id;
  final String name;
  final String slug;
  final SellerBadge badge;
  final double rating;
  final int followers;
  final int health; // 0..100 health score
  const Seller({
    required this.id,
    required this.name,
    this.slug = '',
    required this.badge,
    required this.rating,
    required this.followers,
    required this.health,
  });

  factory Seller.fromJson(Map<String, dynamic> j) {
    double d(dynamic v) => v is num ? v.toDouble() : double.tryParse('$v') ?? 0;
    int i(dynamic v) => v is num ? v.toInt() : int.tryParse('$v') ?? 0;
    // Derive a stable-ish follower count from the product count for display.
    final products = i(j['productCount']);
    return Seller(
      id: (j['id'] ?? '').toString(),
      name: (j['storeName'] ?? j['name'] ?? 'Store').toString(),
      slug: (j['slug'] ?? '').toString(),
      badge: _badgeFrom(j['badge']?.toString()),
      rating: d(j['rating']),
      followers: 800 + products * 350,
      health: i(j['healthScore']),
    );
  }
}

const _fallbackSellers = [
  Seller(id: 'slr-01', name: 'Kinshasa Tech Hub', slug: 'kinshasa-tech-hub', badge: SellerBadge.sombaAssured, rating: 4.8, followers: 12400, health: 97),
  Seller(id: 'slr-02', name: 'Gombe Fashion House', slug: 'gombe-fashion-house', badge: SellerBadge.gold, rating: 4.6, followers: 8600, health: 92),
  Seller(id: 'slr-03', name: 'Élégance Bijoux', slug: 'elegance-bijoux', badge: SellerBadge.silver, rating: 4.4, followers: 3100, health: 88),
  Seller(id: 'slr-04', name: 'Kivu Electronics', slug: 'kivu-electronics', badge: SellerBadge.gold, rating: 4.7, followers: 6200, health: 95),
  Seller(id: 'slr-05', name: 'Matonge Style', slug: 'matonge-style', badge: SellerBadge.bronze, rating: 4.2, followers: 1800, health: 84),
  Seller(id: 'slr-06', name: 'Congo Gadget Store', slug: 'congo-gadget-store', badge: SellerBadge.silver, rating: 4.5, followers: 4400, health: 90),
];

/// The full seller directory (browsable / searchable). Hydrated from the API at
/// startup; falls back to the bundled list offline.
List<Seller> allSellersList = List.of(_fallbackSellers);
List<Seller> get allSellers => allSellersList;

/// The category a seller primarily trades in (offline heuristic only).
String sellerCategory(Seller s) {
  switch (s.id) {
    case 'slr-02':
    case 'slr-05':
      return 'Fashion';
    case 'slr-03':
      return 'Jewelery';
    default:
      return 'Electronics';
  }
}

/// The seller for a product. Prefers the real seller carried on the product
/// (live data); otherwise falls back to a category-deterministic mock so the
/// catalogue still groups consistently offline.
Seller sellerFor(Product p) {
  if (p.sellerId != null && p.sellerId!.isNotEmpty) {
    for (final s in allSellersList) {
      if (s.id == p.sellerId) return s;
    }
    return Seller(
      id: p.sellerId!,
      name: p.sellerName ?? 'Store',
      slug: p.sellerSlug ?? '',
      badge: _badgeFrom(p.sellerBadge),
      rating: 4.5,
      followers: 2000,
      health: 92,
    );
  }
  switch (p.category) {
    case 'Electronics':
      return allSellersList.isNotEmpty ? allSellersList[0] : _fallbackSellers[0];
    case 'Fashion':
      return allSellersList.length > 1 ? allSellersList[1] : _fallbackSellers[1];
    default:
      return allSellersList.length > 2 ? allSellersList[2] : _fallbackSellers[2];
  }
}

/// Spec sheet for a product, localized. Uses the product's live specs when
/// available; otherwise a category-keyed fallback.
List<(String, String)> specsFor(Product p, [String lang = 'en']) {
  final live = p.specs;
  if (live != null && live.isNotEmpty) {
    return live.map((s) => s.localized(lang)).toList();
  }
  final fr = lang == 'fr';
  switch (p.category) {
    case 'Electronics':
      return [
        (fr ? 'Garantie' : 'Warranty', fr ? '12 mois' : '12 months'),
        (fr ? 'État' : 'Condition', fr ? 'Neuf · scellé' : 'Brand new · sealed'),
        (fr ? 'Dans la boîte' : 'In the box', fr ? 'Appareil, câble, manuel' : 'Device, cable, manual'),
        (fr ? 'Expédié de' : 'Ships from', fr ? 'Entrepôt de Kinshasa' : 'Kinshasa warehouse'),
      ];
    case 'Fashion':
      return [
        (fr ? 'Matière' : 'Material', fr ? 'Coton mélangé premium' : 'Premium cotton blend'),
        (fr ? 'Entretien' : 'Care', fr ? 'Lavage machine à froid' : 'Machine wash cold'),
        (fr ? 'Coupe' : 'Fit', fr ? 'Taille normale' : 'True to size'),
        (fr ? 'Origine' : 'Origin', fr ? 'Sourcé éthiquement' : 'Ethically sourced'),
      ];
    default:
      return [
        (fr ? 'Matière' : 'Material', fr ? 'Or 18 carats / argent' : '18k gold / sterling silver'),
        (fr ? 'Certificat' : 'Certificate', fr ? "Certificat d'authenticité inclus" : 'Authenticity included'),
        (fr ? 'Garantie' : 'Warranty', fr ? '24 mois' : '24 months'),
        (fr ? 'Emballage' : 'Packaging', fr ? 'Coffret cadeau inclus' : 'Gift box included'),
      ];
  }
}

/// Up to 6 related products from the same category (excluding the product).
List<Product> relatedTo(Product p) =>
    products.where((x) => x.category == p.category && x.id != p.id).take(6).toList();
