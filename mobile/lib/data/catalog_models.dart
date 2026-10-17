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
  final String categoryFr;
  final int stock;
  final String? sellerId;
  final String? sellerName;
  final String? description;
  final DateTime? createdAt;

  /// `base` | `flash` | `campaign`: what set [price] (the charged price).
  final String priceSource;
  final int campaignPct;

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
    this.categoryFr = '',
    this.stock = 0,
    this.sellerId,
    this.sellerName,
    this.description,
    this.createdAt,
    this.priceSource = 'base',
    this.campaignPct = 0,
  });

  String displayName(String lang) => lang == 'fr' ? nameFr : name;
  /// Category name in the app language (falls back to the English name).
  String displayCategory(String lang) => lang == 'fr' && categoryFr.isNotEmpty ? categoryFr : category;
  bool get inStock => stock > 0;

  /// The old price struck through next to [price]; null when not discounted.
  double? get strikePrice => originalPrice > price ? originalPrice : null;
}

class Category {
  final String id;
  final String name;
  final String nameFr;
  final String image;

  const Category({required this.id, required this.name, required this.nameFr, required this.image});

  String displayName(String lang) => lang == 'fr' ? nameFr : name;
}
