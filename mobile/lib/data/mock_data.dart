// Catalogue models. These are populated from the live API at startup (see
// `data/repository.dart`); the lists below are the offline fallback so the app
// still renders when the backend is unreachable (e.g. a demo APK).

double _d(dynamic v) => v is num ? v.toDouble() : double.tryParse('$v') ?? 0;
int _i(dynamic v) => v is num ? v.toInt() : int.tryParse('$v') ?? 0;

/// A single bilingual product specification row.
class ProductSpec {
  final String label;
  final String labelFr;
  final String value;
  final String valueFr;
  const ProductSpec(this.label, this.value, {String? labelFr, String? valueFr})
      : labelFr = labelFr ?? label,
        valueFr = valueFr ?? value;

  factory ProductSpec.fromJson(Map<String, dynamic> j) => ProductSpec(
        (j['label'] ?? '').toString(),
        (j['value'] ?? '').toString(),
        labelFr: (j['labelFr'] ?? j['label'] ?? '').toString(),
        valueFr: (j['valueFr'] ?? j['value'] ?? '').toString(),
      );

  (String, String) localized(String lang) =>
      lang == 'fr' ? (labelFr, valueFr) : (label, value);
}

class Product {
  final String id;
  final String name;
  final String nameFr;
  final double price;
  final double originalPrice;
  final int discount;
  final double rating;
  final int reviews;
  final String image;
  final String category;

  // Extra fields available when hydrated from the API (null on offline mock).
  final String? description;
  final String? descriptionFr;
  final String? sellerId;
  final String? sellerName;
  final String? sellerSlug;
  final String? sellerBadge;
  final List<ProductSpec>? specs;

  const Product({
    required this.id,
    required this.name,
    required this.nameFr,
    required this.price,
    required this.originalPrice,
    required this.discount,
    required this.rating,
    required this.reviews,
    required this.image,
    required this.category,
    this.description,
    this.descriptionFr,
    this.sellerId,
    this.sellerName,
    this.sellerSlug,
    this.sellerBadge,
    this.specs,
  });

  String displayName(String lang) => lang == 'fr' ? nameFr : name;
  String? describe(String lang) => lang == 'fr' ? (descriptionFr ?? description) : description;

  factory Product.fromJson(Map<String, dynamic> j) {
    final cat = j['category'];
    final catName = cat is Map ? (cat['name'] ?? '').toString() : '';
    final imgs = (j['images'] as List?) ?? const [];
    final img = imgs.isNotEmpty && imgs.first is Map
        ? (imgs.first['url'] ?? '').toString()
        : '';
    final price = _d(j['discountPrice'] ?? j['price']);
    final orig = _d(j['mrp'] ?? j['price']);
    final disc = orig > price ? ((1 - price / orig) * 100).round() : 0;
    final seller = j['seller'];
    final specsJson = j['specs'] as List?;
    return Product(
      id: (j['id'] ?? '').toString(),
      name: (j['name'] ?? '').toString(),
      nameFr: (j['nameFr'] ?? j['name'] ?? '').toString(),
      price: price,
      originalPrice: orig,
      discount: disc,
      rating: _d(j['rating']),
      reviews: _i(j['reviewCount']),
      image: img,
      category: catName,
      description: j['description']?.toString(),
      descriptionFr: j['descriptionFr']?.toString(),
      sellerId: seller is Map ? seller['id']?.toString() : null,
      sellerName: seller is Map ? seller['storeName']?.toString() : null,
      sellerSlug: seller is Map ? seller['slug']?.toString() : null,
      sellerBadge: seller is Map ? seller['badge']?.toString() : null,
      specs: specsJson
          ?.whereType<Map>()
          .map((s) => ProductSpec.fromJson(s.cast<String, dynamic>()))
          .toList(),
    );
  }
}

class Category {
  final String id;
  final String name;
  final String nameFr;
  final String image;
  final int productCount;

  const Category({
    required this.id,
    required this.name,
    required this.nameFr,
    this.image = '',
    this.productCount = 0,
  });

  String displayName(String lang) => lang == 'fr' ? nameFr : name;

  factory Category.fromJson(Map<String, dynamic> j) => Category(
        id: (j['id'] ?? '').toString(),
        name: (j['name'] ?? '').toString(),
        nameFr: (j['nameFr'] ?? j['name'] ?? '').toString(),
        image: (j['imageUrl'] ?? '').toString(),
        productCount: _i(j['productCount']),
      );
}

/// Offline-fallback categories (overwritten by the API at startup).
final List<Category> categories = [
  const Category(id: '1', name: 'Electronics', nameFr: 'Électronique'),
  const Category(id: '2', name: 'Fashion', nameFr: 'Mode'),
  const Category(id: '3', name: 'Jewelery', nameFr: 'Bijoux'),
];

// Real professional catalogue photos are bundled in assets/products/<n>.jpg.
const _img = 'https://raw.githubusercontent.com/keikaavousi/fake-store-api/master/public/img';

/// Offline-fallback products (overwritten by the API at startup).
final List<Product> products = [
  const Product(id: '1', name: 'Fjällräven Foldsack No.1 Backpack', nameFr: 'Sac à dos Fjällräven Foldsack N°1', price: 110, originalPrice: 140, discount: 21, rating: 3.9, reviews: 120, image: '$_img/81fPKd-2AYL._AC_SL1500_.jpg', category: 'Fashion'),
  const Product(id: '2', name: 'Mens Casual Premium Slim Fit T-Shirt', nameFr: 'T-shirt slim premium homme', price: 22, originalPrice: 30, discount: 26, rating: 4.1, reviews: 259, image: '$_img/71-3HjGNDUL._AC_SY879._SX._UX._SY._UY_.jpg', category: 'Fashion'),
  const Product(id: '3', name: 'Mens Cotton Jacket', nameFr: 'Veste en coton homme', price: 56, originalPrice: 70, discount: 20, rating: 4.7, reviews: 500, image: '$_img/71li-ujtlUL._AC_UX679_.jpg', category: 'Fashion'),
  const Product(id: '4', name: 'Mens Casual Slim Fit Shirt', nameFr: 'Chemise slim casual homme', price: 16, originalPrice: 25, discount: 36, rating: 4.0, reviews: 430, image: '$_img/71YXzeOuslL._AC_UY879_.jpg', category: 'Fashion'),
  const Product(id: '5', name: 'John Hardy Gold & Silver Dragon Bracelet', nameFr: 'Bracelet Dragon or & argent John Hardy', price: 695, originalPrice: 780, discount: 11, rating: 4.6, reviews: 400, image: '$_img/71pWzhdJNwL._AC_UL640_QL65_ML3_.jpg', category: 'Jewelery'),
  const Product(id: '6', name: 'Solid Gold Petite Micropavé Ring', nameFr: 'Bague micropavé en or', price: 168, originalPrice: 199, discount: 16, rating: 3.9, reviews: 70, image: '$_img/61sbMiUnoGL._AC_UL640_QL65_ML3_.jpg', category: 'Jewelery'),
  const Product(id: '7', name: 'White Gold Plated Princess Earrings', nameFr: 'Boucles d\'oreilles plaqué or blanc', price: 10, originalPrice: 15, discount: 33, rating: 3.5, reviews: 400, image: '$_img/71YAIFU48IL._AC_UL640_QL65_ML3_.jpg', category: 'Jewelery'),
  const Product(id: '8', name: 'Pierced Owl Rose Gold Earrings', nameFr: 'Boucles d\'oreilles hibou or rose', price: 11, originalPrice: 18, discount: 39, rating: 4.2, reviews: 100, image: '$_img/51UDEzMJVpL._AC_UL640_QL65_ML3_.jpg', category: 'Jewelery'),
  const Product(id: '9', name: 'WD 2TB Elements Portable Hard Drive', nameFr: 'Disque dur portable WD 2 To', price: 64, originalPrice: 79, discount: 19, rating: 3.3, reviews: 203, image: '$_img/61IBBVJvSDL._AC_SY879_.jpg', category: 'Electronics'),
  const Product(id: '10', name: 'SanDisk SSD PLUS 1TB Internal SSD', nameFr: 'SSD interne SanDisk PLUS 1 To', price: 109, originalPrice: 139, discount: 22, rating: 4.5, reviews: 470, image: '$_img/61U7T1koQqL._AC_SX679_.jpg', category: 'Electronics'),
  const Product(id: '11', name: 'Silicon Power 256GB SSD 3D NAND', nameFr: 'SSD Silicon Power 256 Go', price: 109, originalPrice: 129, discount: 16, rating: 4.8, reviews: 319, image: '$_img/71kWymZ+c+L._AC_SX679_.jpg', category: 'Electronics'),
  const Product(id: '12', name: 'Acer 21.5" Full HD IPS Monitor', nameFr: 'Écran Acer 21,5" Full HD IPS', price: 599, originalPrice: 699, discount: 14, rating: 4.3, reviews: 250, image: '$_img/81QpkIctqPL._AC_SX679_.jpg', category: 'Electronics'),
];

/// Number of catalogue products in a given category.
int categoryCount(String name) {
  // Prefer the API-provided count when available.
  for (final c in categories) {
    if (c.name == name && c.productCount > 0) return c.productCount;
  }
  return products.where((p) => p.category == name).length;
}
