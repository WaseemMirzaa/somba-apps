/// View-models for the storefront. They are built from the live API payloads
/// (see catalog_live.dart) — there is no bundled sample catalogue.
class Product {
  /// Stable numeric key derived from [uuid]: used for widget keys / de-duplication.
  final int id;

  /// The backend id. Orders and the wishlist reference listings by this.
  final String uuid;
  final String name;
  final String nameFr;
  final double price;
  final double originalPrice;
  final int discount;
  final double rating;
  final int reviews;
  final String image;
  final String category;
  final int stock;
  final String? sellerId;
  final String? sellerName;
  final String? description;
  final DateTime? createdAt;

  const Product({
    required this.id,
    required this.uuid,
    required this.name,
    required this.nameFr,
    required this.price,
    required this.originalPrice,
    required this.discount,
    required this.rating,
    required this.reviews,
    required this.image,
    required this.category,
    this.stock = 0,
    this.sellerId,
    this.sellerName,
    this.description,
    this.createdAt,
  });

  String displayName(String lang) => lang == 'fr' ? nameFr : name;
  bool get inStock => stock > 0;
}

class Category {
  final String id;
  final String name;
  final String nameFr;
  final String image;

  const Category({required this.id, required this.name, required this.nameFr, required this.image});

  String displayName(String lang) => lang == 'fr' ? nameFr : name;
}
