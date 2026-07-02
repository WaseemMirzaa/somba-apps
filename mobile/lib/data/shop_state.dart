import 'package:shared_preferences/shared_preferences.dart';
import 'mock_data.dart';
import 'promos.dart';

class CartItem {
  final Product product;
  final String variant;
  int qty;

  CartItem({required this.product, this.variant = 'Default', this.qty = 1});
}

class CustomerReview {
  final String name;
  final int stars;
  final String text;
  final String date;
  final int photos;
  CustomerReview({required this.name, required this.stars, required this.text, required this.date, this.photos = 0});
}

class ShopState {
  static final ShopState instance = ShopState._();

  final List<CartItem> cart = [];
  final List<int> wishlist = [1, 3];
  final List<int> recentlyViewed = [1, 3, 5];

  /// Applied promo code (null when none). Set from the cart/checkout.
  Promo? appliedPromo;

  /// Stores the customer follows (seller ids).
  final Set<String> followedStores = {};

  /// Ids of notifications the customer has read.
  final Set<int> readNotifications = {};

  /// Selected delivery zone id (drives the delivery fee); null → first zone.
  String? selectedZoneId;

  /// Delivery address label shown in the home top bar; null → default.
  String? selectedAddressLabel;

  double promoDiscount(double subtotalUsd) => appliedPromo?.discountFor(subtotalUsd) ?? 0;

  /// Customer reviews (shared so the compose screen can add to the list).
  final List<CustomerReview> reviews = [
    CustomerReview(name: 'Aline K.', stars: 5, text: 'Exactly as described, fast delivery. Very happy!', date: '2 days ago', photos: 2),
    CustomerReview(name: 'Patrick M.', stars: 4, text: 'Good quality for the price. Packaging could be better.', date: '5 days ago', photos: 0),
    CustomerReview(name: 'Sarah L.', stars: 5, text: 'Second time ordering from this seller — always reliable.', date: '1 week ago', photos: 1),
    CustomerReview(name: 'Jean B.', stars: 3, text: 'It works but arrived a day late.', date: '2 weeks ago', photos: 0),
  ];

  void addReview(int stars, String text, int photos) {
    reviews.insert(0, CustomerReview(name: 'You', stars: stars, text: text.isEmpty ? 'Rated $stars stars.' : text, date: 'Just now', photos: photos));
  }

  SharedPreferences? _prefs;

  /// Load persisted state (followed stores, read notifications, delivery zone).
  /// Call once at startup before runApp.
  Future<void> load() async {
    try {
      _prefs = await SharedPreferences.getInstance();
      followedStores.addAll(_prefs!.getStringList('followedStores') ?? const []);
      readNotifications.addAll((_prefs!.getStringList('readNotifications') ?? const []).map(int.parse));
      selectedZoneId = _prefs!.getString('selectedZoneId');
    } catch (_) {
      // Persistence is best-effort; ignore load failures.
    }
  }

  /// Persist the small session-carryover state.
  void save() {
    final p = _prefs;
    if (p == null) return;
    p.setStringList('followedStores', followedStores.toList());
    p.setStringList('readNotifications', readNotifications.map((e) => e.toString()).toList());
    if (selectedZoneId != null) p.setString('selectedZoneId', selectedZoneId!);
  }

  void toggleFollow(String sellerId) {
    followedStores.contains(sellerId) ? followedStores.remove(sellerId) : followedStores.add(sellerId);
    save();
  }

  ShopState._() {
    if (products.isNotEmpty) {
      cart.add(CartItem(product: products[0], variant: '256GB Black'));
      cart.add(CartItem(product: products[2], variant: 'White', qty: 2));
    }
  }

  void addToCart(Product p, {String variant = 'Default', int qty = 1}) {
    CartItem? existing;
    for (final c in cart) {
      if (c.product.id == p.id && c.variant == variant) {
        existing = c;
        break;
      }
    }
    if (existing != null) {
      existing.qty += qty;
    } else {
      cart.add(CartItem(product: p, variant: variant, qty: qty));
    }
  }

  double get subtotal => cart.fold(0.0, (s, i) => s + i.product.price * i.qty);
  int get cartCount => cart.fold(0, (s, i) => s + i.qty);

  void addRecentlyViewed(int id) {
    recentlyViewed.remove(id);
    recentlyViewed.insert(0, id);
    if (recentlyViewed.length > 12) recentlyViewed.removeLast();
  }
}
