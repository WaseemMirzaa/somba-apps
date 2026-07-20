import '../services/models.dart';
import '../services/realtime_store.dart';
import 'mock_data.dart';

/// Maps a live backend product (streamed over the socket) onto the app's
/// [Product] view-model. The int `id` is derived deterministically from the
/// backend uuid so cart de-duplication and wishlist keys stay stable across
/// rebuilds. Orders are placed with name/price snapshots (see checkout), so the
/// synthetic id never needs to round-trip to the backend.
Product productFromDto(ProductDto d) => Product(
      id: d.id.hashCode & 0x7fffffff,
      name: d.name,
      nameFr: d.nameFr.isNotEmpty ? d.nameFr : d.name,
      price: d.price,
      originalPrice: d.originalPrice > 0 ? d.originalPrice : d.price,
      discount: d.discount,
      rating: d.rating,
      reviews: d.reviews,
      image: d.image,
      category: d.category,
    );

/// The live catalog from the realtime store, falling back to the bundled sample
/// products until the socket hydrates (e.g. first frame / offline).
List<Product> liveCatalog() {
  final live = RealtimeStore.instance.products;
  if (live.isEmpty) return products;
  return live.map(productFromDto).toList();
}

/// Count of live products in a category (mirrors mock `categoryCount`).
int liveCategoryCount(String name) =>
    liveCatalog().where((p) => p.category == name).length;
