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

class Seller {
  final String id;
  final String name;
  final SellerBadge badge;
  final double rating;
  final int followers;
  final int health; // 0..100 health score
  const Seller({
    required this.id,
    required this.name,
    required this.badge,
    required this.rating,
    required this.followers,
    required this.health,
  });
}

const _sellers = [
  Seller(id: 'slr-01', name: 'Kinshasa Tech Hub', badge: SellerBadge.sombaAssured, rating: 4.8, followers: 12400, health: 97),
  Seller(id: 'slr-02', name: 'Gombe Fashion House', badge: SellerBadge.gold, rating: 4.6, followers: 8600, health: 92),
  Seller(id: 'slr-03', name: 'Élégance Bijoux', badge: SellerBadge.silver, rating: 4.4, followers: 3100, health: 88),
];

/// Deterministic seller for a product (by category), so the catalogue reads
/// consistently without a backend.
Seller sellerFor(Product p) {
  switch (p.category) {
    case 'Electronics':
      return _sellers[0];
    case 'Fashion':
      return _sellers[1];
    default:
      return _sellers[2];
  }
}

/// Spec sheet for a product, keyed off its category.
List<(String, String)> specsFor(Product p) {
  switch (p.category) {
    case 'Electronics':
      return const [
        ('Warranty', '12 months'),
        ('Condition', 'Brand new · sealed'),
        ('In the box', 'Device, cable, manual'),
        ('Ships from', 'Kinshasa warehouse'),
      ];
    case 'Fashion':
      return const [
        ('Material', 'Premium cotton blend'),
        ('Care', 'Machine wash cold'),
        ('Fit', 'True to size'),
        ('Origin', 'Ethically sourced'),
      ];
    default:
      return const [
        ('Material', '18k gold / sterling silver'),
        ('Certificate', 'Authenticity included'),
        ('Warranty', '24 months'),
        ('Packaging', 'Gift box included'),
      ];
  }
}

/// Up to 6 related products from the same category (excluding the product).
List<Product> relatedTo(Product p) =>
    products.where((x) => x.category == p.category && x.id != p.id).take(6).toList();
