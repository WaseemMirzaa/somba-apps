import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';
import '../services/realtime_store.dart';
import 'catalog_live.dart';
import 'catalog_models.dart';
import 'promos.dart';

class CartItem {
  /// Latest known listing (refreshed from the live catalogue, so prices shown
  /// here follow the server). The server re-prices everything at checkout.
  Product product;
  final String variant;
  int qty;

  CartItem({required this.product, this.variant = 'Default', this.qty = 1});
}

/// Device-local shopping state: the cart, recently viewed items and the chosen
/// delivery zone/address. Everything that belongs to the ACCOUNT (wishlist,
/// addresses, orders, wallet) lives in [RealtimeStore], pushed by the server.
class ShopState {
  static final ShopState instance = ShopState._();
  ShopState._();

  final List<CartItem> cart = [];

  /// Backend ids of recently viewed listings, newest first (persisted).
  final List<String> recentlyViewed = [];

  /// A promo code the server accepted for the current subtotal (null when none).
  AppliedPromo? appliedPromo;

  /// Selected delivery zone id (drives the delivery fee); null → first zone.
  String? selectedZoneId;

  /// The saved address (backend id) used for delivery; null → default / first.
  String? selectedAddressId;

  SharedPreferences? _prefs;

  /// Discount previewed for [subtotalUsd]; 0 unless the server validated the
  /// code for exactly this subtotal (cart changes re-validate via [applyPromo]).
  double promoDiscount(double subtotalUsd) {
    final p = appliedPromo;
    if (p == null || (p.forSubtotal - subtotalUsd).abs() > 0.005) return 0;
    return p.discountUsd;
  }

  /// Ask the server whether [code] works for the current subtotal.
  /// Returns an error message, or null on success.
  Future<String?> applyPromo(String code) async {
    final sub = subtotal;
    try {
      final res = await RealtimeStore.instance.validatePromo(code.trim(), sub);
      if (res['ok'] == true) {
        appliedPromo = AppliedPromo(
          code: (res['code'] ?? code).toString(),
          discountUsd: (res['discount'] as num).toDouble(),
          forSubtotal: sub,
        );
        return null;
      }
      appliedPromo = null;
      return (res['reason'] ?? 'Invalid code.').toString();
    } catch (e) {
      return e.toString();
    }
  }

  /// Re-check an applied code after the cart changed.
  Future<void> revalidatePromo() async {
    final p = appliedPromo;
    if (p == null) return;
    if ((p.forSubtotal - subtotal).abs() < 0.005) return;
    await applyPromo(p.code);
  }

  /// Load persisted device state. Call once at startup before runApp.
  Future<void> load() async {
    try {
      _prefs = await SharedPreferences.getInstance();
      selectedZoneId = _prefs!.getString('selectedZoneId');
      selectedAddressId = _prefs!.getString('selectedAddressId');
      recentlyViewed
        ..clear()
        ..addAll(_prefs!.getStringList('recentlyViewed') ?? const []);
      restoreCart();
    } catch (_) {
      // Persistence is best-effort.
    }
  }

  void save() {
    final p = _prefs;
    if (p == null) return;
    if (selectedZoneId != null) p.setString('selectedZoneId', selectedZoneId!);
    if (selectedAddressId != null) p.setString('selectedAddressId', selectedAddressId!);
    p.setStringList('recentlyViewed', recentlyViewed);
    p.setString(
      'cart',
      jsonEncode(cart.map((c) => {'u': c.product.uuid, 'v': c.variant, 'q': c.qty}).toList()),
    );
  }

  /// Rebuild the cart from the persisted lines once the catalogue is known, and
  /// refresh prices/stock of the current lines. Lines whose listing vanished
  /// (sold out / removed by the seller) are dropped.
  void syncWithCatalog() {
    // Until the first download finished we don't know the catalogue: never drop lines then.
    if (!RealtimeStore.instance.hydrated) return;
    final stored = _pendingRestore;
    if (stored != null && cart.isEmpty) {
      for (final l in stored) {
        final p = productByUuid(l['u'] as String);
        if (p != null) cart.add(CartItem(product: p, variant: l['v'] as String? ?? 'Default', qty: (l['q'] as num?)?.toInt() ?? 1));
      }
      _pendingRestore = null;
    }
    cart.removeWhere((c) => productByUuid(c.product.uuid) == null);
    for (final c in cart) {
      final fresh = productByUuid(c.product.uuid);
      if (fresh != null) c.product = fresh;
    }
  }

  List<Map<String, dynamic>>? _pendingRestore;

  /// Read the persisted cart lines (resolved to products by [syncWithCatalog]).
  void restoreCart() {
    try {
      final raw = _prefs?.getString('cart');
      if (raw == null) return;
      _pendingRestore = (jsonDecode(raw) as List).map((e) => Map<String, dynamic>.from(e as Map)).toList();
    } catch (_) {
      _pendingRestore = null;
    }
  }

  /// Sign-out: nothing of the previous account's session may leak to the next.
  void clearSession() {
    cart.clear();
    appliedPromo = null;
    recentlyViewed.clear();
    selectedAddressId = null;
    _pendingRestore = null;
    final p = _prefs;
    if (p != null) {
      p.remove('cart');
      p.remove('recentlyViewed');
      p.remove('selectedAddressId');
    }
  }

  void addToCart(Product p, {String variant = 'Default', int qty = 1}) {
    CartItem? existing;
    for (final c in cart) {
      if (c.product.uuid == p.uuid && c.variant == variant) {
        existing = c;
        break;
      }
    }
    if (existing != null) {
      existing.qty += qty;
    } else {
      cart.add(CartItem(product: p, variant: variant, qty: qty));
    }
    save();
  }

  void removeAt(int i) {
    cart.removeAt(i);
    save();
  }

  void clearCart() {
    cart.clear();
    appliedPromo = null;
    save();
  }

  double get subtotal => cart.fold(0.0, (s, i) => s + i.product.price * i.qty);
  int get cartCount => cart.fold(0, (s, i) => s + i.qty);

  void addRecentlyViewed(String uuid) {
    recentlyViewed.remove(uuid);
    recentlyViewed.insert(0, uuid);
    if (recentlyViewed.length > 12) recentlyViewed.removeLast();
    save();
  }
}
