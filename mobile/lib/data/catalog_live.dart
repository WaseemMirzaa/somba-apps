import '../services/models.dart';
import '../services/realtime_store.dart';
import 'catalog_models.dart';

/// Maps a live backend product onto the storefront [Product] view-model.
Product productFromDto(ProductDto d) => Product(
      // Deterministic numeric key from the backend uuid (stable across rebuilds).
      id: d.id.hashCode & 0x7fffffff,
      uuid: d.id,
      name: d.name,
      nameFr: d.nameFr.isNotEmpty ? d.nameFr : d.name,
      price: d.price,
      originalPrice: d.originalPrice > 0 ? d.originalPrice : d.price,
      discount: d.discount,
      rating: d.rating,
      reviews: d.reviews,
      image: d.image,
      category: d.category,
      stock: d.stock,
      sellerId: d.sellerId,
      sellerName: d.sellerName,
      description: d.description,
      createdAt: d.createdAt,
    );

Category categoryFromDto(CategoryDto d) =>
    Category(id: d.id, name: d.name, nameFr: d.nameFr, image: d.image);

/// The live catalogue, as pushed by the server (empty until the first download).
List<Product> liveCatalog() => RealtimeStore.instance.products.map(productFromDto).toList();

/// The live categories.
List<Category> liveCategories() => RealtimeStore.instance.categories.map(categoryFromDto).toList();

/// Count of live products in a category.
int liveCategoryCount(String name) => RealtimeStore.instance.products.where((p) => p.category == name).length;

/// A live product by backend id, if still listed.
Product? productByUuid(String uuid) {
  for (final p in RealtimeStore.instance.products) {
    if (p.id == uuid) return productFromDto(p);
  }
  return null;
}

/// A store, derived from the sellers of the live listings.
class Seller {
  final String id;
  final String name;
  final int productCount;
  const Seller({required this.id, required this.name, required this.productCount});
}

/// Stores that currently have live products.
List<Seller> liveSellers() {
  final byId = <String, ({String name, int n})>{};
  for (final p in RealtimeStore.instance.products) {
    final id = p.sellerId;
    if (id == null || id.isEmpty) continue;
    final cur = byId[id];
    byId[id] = (name: p.sellerName ?? 'Store', n: (cur?.n ?? 0) + 1);
  }
  final list = byId.entries.map((e) => Seller(id: e.key, name: e.value.name, productCount: e.value.n)).toList();
  list.sort((a, b) => b.productCount.compareTo(a.productCount));
  return list;
}

/// Highest live price (for the price-filter slider), rounded up to a clean step.
double liveMaxPrice() {
  var m = 0.0;
  for (final p in RealtimeStore.instance.products) {
    if (p.price > m) m = p.price;
  }
  if (m <= 0) return 100;
  final step = m > 1000 ? 100.0 : 50.0;
  return (m / step).ceil() * step;
}
