import 'package:shared_preferences/shared_preferences.dart';
import 'mock_data.dart';
import 'catalog_meta.dart';
import 'promos.dart';

class CartItem {
  final Product product;
  final String variant;
  int qty;

  CartItem({required this.product, this.variant = 'Default', this.qty = 1});
}

/// A saved payment card associated with the account.
class SavedCard {
  final String brand; // Visa · Mastercard
  final String last4;
  final String holder;
  final String expiry; // MM/YY
  const SavedCard({required this.brand, required this.last4, required this.holder, required this.expiry});
}

/// A saved mobile-money wallet associated with the account.
class MobileWallet {
  final String provider; // Airtel Money · Orange Money · M-Pesa
  final String number;
  const MobileWallet({required this.provider, required this.number});
}

/// A customer delivery address. The delivery zone is auto-derived from the
/// city/zone fields (no separate zone picker in checkout).
class CustomerAddress {
  final String id;
  String label;
  String name;
  String phone;
  String line;
  String city;
  String zone;
  bool isDefault;
  final double lat;
  final double lng;
  CustomerAddress({
    required this.id,
    required this.label,
    required this.name,
    required this.phone,
    required this.line,
    this.city = 'Kinshasa',
    this.zone = 'Gombe',
    this.isDefault = false,
    this.lat = -4.325,
    this.lng = 15.322,
  });
}

/// A group of cart items that ship from a single store (one order per store).
class StoreOrder {
  final Seller seller;
  final List<CartItem> items;
  StoreOrder(this.seller, this.items);
  double get subtotal => items.fold(0.0, (s, i) => s + i.product.price * i.qty);
  int get count => items.fold(0, (s, i) => s + i.qty);
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
  /// Wishlisted product ids. Hydrated from the API when signed in; seeded with a
  /// couple of demo items offline (see [seedDemoIfEmpty]).
  final List<String> wishlist = [];
  final List<String> recentlyViewed = [];

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

  /// Saved payment cards (associated with the account).
  final List<SavedCard> savedCards = [
    const SavedCard(brand: 'Visa', last4: '4242', holder: 'Marie Dubois', expiry: '08/27'),
  ];

  /// Saved mobile-money wallets.
  final List<MobileWallet> wallets = [
    const MobileWallet(provider: 'Airtel Money', number: '+243 970 000 000'),
  ];

  void addCard(SavedCard c) => savedCards.add(c);
  void addWallet(MobileWallet w) => wallets.add(w);

  /// Saved delivery addresses (associated with the account).
  final List<CustomerAddress> addresses = [
    CustomerAddress(id: 'addr-1', label: 'Home', name: 'Marie Dubois', phone: '+243 970 000 000', line: '12 Commerce Ave, Gombe', city: 'Kinshasa', zone: 'Gombe', isDefault: true),
    CustomerAddress(id: 'addr-2', label: 'Work', name: 'Marie Dubois', phone: '+243 971 111 222', line: 'Tower B, Limete Industrial', city: 'Kinshasa', zone: 'Limete'),
  ];

  /// The address selected for delivery (defaults to the default/first address).
  String? selectedDeliveryAddressId;
  CustomerAddress? get selectedAddress {
    if (addresses.isEmpty) return null;
    final id = selectedDeliveryAddressId;
    return addresses.firstWhere(
      (a) => a.id == id,
      orElse: () => addresses.firstWhere((a) => a.isDefault, orElse: () => addresses.first),
    );
  }

  void addAddress(CustomerAddress a) {
    if (a.isDefault) {
      for (final x in addresses) {
        x.isDefault = false;
      }
    }
    addresses.add(a);
    selectedDeliveryAddressId = a.id;
  }

  int _addrSeq = 3;
  String nextAddressId() => 'addr-${_addrSeq++}';

  /// Replace the local address book with the customer's server-side addresses.
  void setAddressesFromApi(List<Map<String, dynamic>> rows) {
    double d(dynamic v) => v is num ? v.toDouble() : double.tryParse('$v') ?? 0;
    addresses
      ..clear()
      ..addAll(rows.map((a) => CustomerAddress(
            id: (a['id'] ?? '').toString(),
            label: (a['label'] ?? 'Home').toString(),
            name: (a['name'] ?? '').toString(),
            phone: (a['phone'] ?? '').toString(),
            line: (a['line'] ?? '').toString(),
            city: (a['city'] ?? 'Kinshasa').toString(),
            zone: (a['zone'] ?? 'Gombe').toString(),
            isDefault: a['isDefault'] == true,
            lat: d(a['lat']),
            lng: d(a['lng']),
          )));
    final def = addresses.where((a) => a.isDefault);
    selectedDeliveryAddressId =
        def.isNotEmpty ? def.first.id : (addresses.isNotEmpty ? addresses.first.id : null);
  }

  /// Clear all account-scoped state on logout.
  void clearSession() {
    wishlist.clear();
    followedStores.clear();
    appliedPromo = null;
    selectedDeliveryAddressId = null;
  }

  /// Seed a couple of demo items so the cart/wishlist aren't empty for a first
  /// look. Uses the (already hydrated) live catalogue so ids are real.
  void seedDemoIfEmpty() {
    if (cart.isEmpty && products.isNotEmpty) {
      cart.add(CartItem(product: products[0], variant: '256GB Black'));
      if (products.length > 2) cart.add(CartItem(product: products[2], variant: 'White', qty: 2));
    }
    if (wishlist.isEmpty && products.isNotEmpty) {
      wishlist.add(products[0].id);
      if (products.length > 2) wishlist.add(products[2].id);
    }
  }

  /// Groups the cart into one [StoreOrder] per store (different stores =
  /// different orders at checkout).
  List<StoreOrder> get cartByStore {
    final map = <String, StoreOrder>{};
    for (final item in cart) {
      final s = sellerFor(item.product);
      map.putIfAbsent(s.id, () => StoreOrder(s, [])).items.add(item);
    }
    return map.values.toList();
  }

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

  ShopState._();

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

  void addRecentlyViewed(String id) {
    recentlyViewed.remove(id);
    recentlyViewed.insert(0, id);
    if (recentlyViewed.length > 12) recentlyViewed.removeLast();
  }
}
