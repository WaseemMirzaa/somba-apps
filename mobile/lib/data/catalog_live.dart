import '../l10n/strings.dart';
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
      image: d.image.isNotEmpty ? d.image : (d.images.isNotEmpty ? d.images.first : ''),
      category: d.category,
      categoryFr: d.categoryFr,
      stock: d.stock,
      sellerId: d.sellerId,
      sellerName: d.sellerName,
      description: d.description,
      descriptionFr: d.descriptionFr,
      createdAt: d.createdAt,
      categoryId: d.categoryId,
      variantLabels: d.variantLabels,
      sourceLang: d.sourceLang,
      machineTranslated: d.machineTranslated,
      translationStatus: d.translationStatus,
      priceSource: d.priceSource,
      campaignPct: d.campaignPct,
      variants: d.variants,
      deliveryDays: d.deliveryDays,
      images: d.images,
      sku: d.sku,
      brand: d.brand,
      campaignId: d.campaignId,
      sellerOnVacation: d.sellerOnVacation,
      sellerVacationUntil: d.sellerVacationUntil,
      sellerVacationNotice: d.sellerVacationNotice,
      sellerHandlingDays: d.sellerHandlingDays,
      totalDeliveryDays: d.totalDeliveryDays,
      stamp: d.stamp,
    );

Category categoryFromDto(CategoryDto d) =>
    Category(id: d.id, name: d.name, nameFr: d.nameFr, image: d.image, productCount: d.productCount);

/// The live catalogue, as pushed by the server (empty until the first download).
List<Product> liveCatalog() => RealtimeStore.instance.products.map(productFromDto).toList();

/// The live categories.
List<Category> liveCategories() => RealtimeStore.instance.categories.map(categoryFromDto).toList();

/// True when a listing belongs to the category: by id when both sides carry one (a rename keeps the products),
/// else by the English name (older servers).
bool inCategory(ProductDto p, {String? id, String? name}) {
  final pid = p.categoryId;
  if (id != null && id.isNotEmpty && pid != null && pid.isNotEmpty) return pid == id;
  return name != null && p.category == name;
}

/// Count of live products in a category. Counts the downloaded catalogue (it follows live pushes); before the
/// first download it falls back to the count the server sent with the category.
int liveCategoryCount(String name, {String? id, int? serverCount}) {
  final store = RealtimeStore.instance;
  if (!store.hydrated && store.products.isEmpty && serverCount != null) return serverCount;
  return store.products.where((p) => inCategory(p, id: id, name: name)).length;
}

/// Count for a [Category] row.
int liveCategoryCountOf(Category c) => liveCategoryCount(c.name, id: c.id, serverCount: c.productCount);

/// The live category a name or id points at, if any (a name is the English key older screens pass around).
Category? findLiveCategory({String? id, String? name}) {
  for (final c in RealtimeStore.instance.categories) {
    if ((id != null && id.isNotEmpty && c.id == id) || (name != null && name.isNotEmpty && c.name == name)) return categoryFromDto(c);
  }
  return null;
}

/// A category's title in [lang]: the localized name of the live category the id/name points at (L16), else the
/// product's own localized category, else the raw key.
String categoryTitle({String? id, String? name, required String lang}) {
  final c = findLiveCategory(id: id, name: name);
  if (c != null) return c.displayName(lang);
  return name ?? '';
}

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
    byId[id] = (name: p.sellerName ?? Strings.current.storeFallback, n: (cur?.n ?? 0) + 1);
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
