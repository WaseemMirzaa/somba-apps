import 'api/api_client.dart';
import 'mock_data.dart';
import 'catalog_meta.dart';
import 'promos.dart';
import 'shop_state.dart';

/// Central data layer: hydrates the catalogue from the live API at startup and
/// brokers all customer mutations (auth, favorites, addresses, orders,
/// reviews). Every path fails soft — when the backend is unreachable the app
/// keeps the bundled fallback data so a demo build still works fully offline.
class Repo {
  Repo._();
  static final Repo instance = Repo._();

  final ApiClient _api = ApiClient.instance;

  /// True when the last bootstrap successfully reached the API.
  bool live = false;
  bool get isAuthed => _api.isAuthed;

  /// Load the token + catalogue. Called once at startup (before the UI needs
  /// data). Safe to call again to refresh.
  Future<void> bootstrap() async {
    await _api.load();
    await _loadCatalog();
    if (_api.isAuthed) {
      await hydrateSession();
    }
  }

  Future<void> _loadCatalog() async {
    try {
      final results = await Future.wait([
        _api.get('/catalog/categories'),
        _api.get('/catalog/products?limit=60'),
        _api.get('/catalog/stores'),
        _api.get('/customer/coupons'),
      ]);

      final cats = (results[0] as List?) ?? const [];
      final prods = ((results[1] as Map?)?['items'] as List?) ?? const [];
      final stores = (results[2] as List?) ?? const [];
      final coupons = (results[3] as List?) ?? const [];

      if (cats.isNotEmpty) {
        categories
          ..clear()
          ..addAll(cats.whereType<Map>().map((c) => Category.fromJson(c.cast<String, dynamic>())));
      }
      if (prods.isNotEmpty) {
        products
          ..clear()
          ..addAll(prods.whereType<Map>().map((p) => Product.fromJson(p.cast<String, dynamic>())));
      }
      if (stores.isNotEmpty) {
        allSellersList = stores
            .whereType<Map>()
            .map((s) => Seller.fromJson(s.cast<String, dynamic>()))
            .toList();
      }
      if (coupons.isNotEmpty) {
        promos
          ..clear()
          ..addAll(coupons.whereType<Map>().map((c) => Promo.fromJson(c.cast<String, dynamic>())));
      }
      live = true;
    } catch (_) {
      // Keep the bundled fallback catalogue.
      live = false;
    }
  }

  // ---- Auth ----------------------------------------------------------------

  Future<bool> login(String email, String password) async {
    try {
      final res = await _api.post('/auth/login', {'email': email, 'password': password});
      final token = res is Map ? res['accessToken'] as String? : null;
      if (token == null) return false;
      await _api.setToken(token);
      await hydrateSession();
      return true;
    } catch (_) {
      return false;
    }
  }

  Future<bool> register(String email, String password, String name, {String? phone}) async {
    try {
      final res = await _api.post('/auth/register/customer', {
        'email': email,
        'password': password,
        'name': name,
        if (phone != null && phone.isNotEmpty) 'phone': phone,
      });
      final token = res is Map ? res['accessToken'] as String? : null;
      if (token == null) return false;
      await _api.setToken(token);
      await hydrateSession();
      return true;
    } catch (_) {
      return false;
    }
  }

  Future<void> logout() async {
    await _api.setToken(null);
    ShopState.instance.clearSession();
  }

  // ---- Session hydration ---------------------------------------------------

  /// Pull the signed-in customer's favorites + addresses into ShopState.
  Future<void> hydrateSession() async {
    final shop = ShopState.instance;
    try {
      final favs = await _api.get('/customer/favorites');
      if (favs is List) {
        shop.wishlist
          ..clear()
          ..addAll(favs.whereType<Map>().map((p) => (p['id'] ?? '').toString()));
      }
    } catch (_) {/* keep local */}
    try {
      final addrs = await _api.get('/customer/addresses');
      if (addrs is List) {
        shop.setAddressesFromApi(addrs.whereType<Map>().map((a) => a.cast<String, dynamic>()).toList());
      }
    } catch (_) {/* keep local */}
  }

  // ---- Favorites -----------------------------------------------------------

  Future<void> addFavorite(String productId) async {
    if (!isAuthed) return;
    try {
      await _api.post('/customer/favorites/$productId');
    } catch (_) {/* optimistic; local list already updated */}
  }

  Future<void> removeFavorite(String productId) async {
    if (!isAuthed) return;
    try {
      await _api.delete('/customer/favorites/$productId');
    } catch (_) {/* optimistic */}
  }

  // ---- Addresses -----------------------------------------------------------

  Future<Map<String, dynamic>?> createAddress(Map<String, dynamic> body) async {
    if (!isAuthed) return null;
    try {
      final res = await _api.post('/customer/addresses', body);
      return res is Map ? res.cast<String, dynamic>() : null;
    } catch (_) {
      return null;
    }
  }

  // ---- Reviews -------------------------------------------------------------

  Future<List<Map<String, dynamic>>> productReviews(String productId) async {
    try {
      final res = await _api.get('/catalog/products/$productId/reviews');
      if (res is List) {
        return res.whereType<Map>().map((r) => r.cast<String, dynamic>()).toList();
      }
    } catch (_) {/* fall through */}
    return const [];
  }

  Future<bool> submitReview(String productId, int stars, String text, int photos) async {
    if (!isAuthed) return false;
    try {
      await _api.post('/customer/products/$productId/reviews', {
        'stars': stars,
        'text': text,
        'photos': photos,
      });
      return true;
    } catch (_) {
      return false;
    }
  }

  // ---- Coupons -------------------------------------------------------------

  /// Validate a coupon against a subtotal. Returns the USD discount, or null if
  /// invalid / minimum not met. Falls back to the local list when offline.
  Future<double?> validateCoupon(String code, double subtotal) async {
    try {
      final res = await _api.post('/customer/coupons/validate', {'code': code, 'subtotal': subtotal});
      if (res is Map && res['valid'] == true) {
        final d = res['discount'];
        return d is num ? d.toDouble() : double.tryParse('$d');
      }
      return null;
    } catch (_) {
      final p = findPromo(code);
      if (p == null) return null;
      final d = p.discountFor(subtotal);
      return d > 0 ? d : null;
    }
  }

  // ---- Orders --------------------------------------------------------------

  Future<List<Map<String, dynamic>>> myOrders() async {
    if (!isAuthed) return const [];
    try {
      final res = await _api.get('/customer/orders');
      if (res is List) {
        return res.whereType<Map>().map((o) => o.cast<String, dynamic>()).toList();
      }
    } catch (_) {/* fall through */}
    return const [];
  }

  /// Place an order from the current cart. Returns the created order code, or
  /// null if the API is unavailable (caller falls back to a local confirmation).
  Future<String?> placeOrder({
    String? addressId,
    String? name,
    String? phone,
    String? line,
    String? city,
    String? zone,
    String paymentMethod = 'cod',
    String? couponCode,
    double deliveryFeeUsd = 3,
  }) async {
    if (!isAuthed) return null;
    final items = ShopState.instance.cart
        .map((c) => {'productId': c.product.id, 'qty': c.qty, 'variant': c.variant})
        .toList();
    if (items.isEmpty) return null;
    try {
      final res = await _api.post('/customer/orders', {
        'items': items,
        if (addressId != null) 'addressId': addressId,
        if (name != null) 'name': name,
        if (phone != null) 'phone': phone,
        if (line != null) 'line': line,
        if (city != null) 'city': city,
        if (zone != null) 'zone': zone,
        'paymentMethod': paymentMethod,
        if (couponCode != null && couponCode.isNotEmpty) 'couponCode': couponCode,
        'deliveryFeeUsd': deliveryFeeUsd,
      });
      return res is Map ? res['code']?.toString() : null;
    } catch (_) {
      return null;
    }
  }
}
