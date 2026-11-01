import 'dart:async';
import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';
import '../l10n/strings.dart';
import '../services/models.dart' show AddressDto;
import '../services/realtime_store.dart';
import '../util/variants.dart' show defaultVariant;
import 'catalog_live.dart';
import 'catalog_models.dart';
import 'promos.dart';

class CartItem {
  /// Latest known listing (refreshed from the live catalogue, so prices shown
  /// here follow the server). The server re-prices everything at checkout.
  Product product;
  final String variant;
  int qty;

  /// The price when the shopper added the line: a later change is pointed out in the cart.
  double? priceWhenAdded;

  CartItem({required this.product, this.variant = 'Default', this.qty = 1, double? priceWhenAdded})
      : priceWhenAdded = priceWhenAdded ?? product.price;

  /// The choice worded in the shopper's language. Display only: [variant] stays the canonical purchase key.
  String variantText(Strings s) => variant == defaultVariant ? s.variant(variant) : product.displayVariant(variant, s.lang);

  /// Price now minus price when added (0 when unchanged or unknown).
  double get priceChange {
    final was = priceWhenAdded;
    if (was == null) return 0;
    final d = product.price - was;
    return d.abs() < 0.005 ? 0 : d;
  }

  Map<String, dynamic> toJson() => {'u': product.uuid, 'v': variant, 'q': qty, if (priceWhenAdded != null) 'p': priceWhenAdded};
}

/// Device-local shopping state: the cart, recently viewed items and the chosen
/// delivery address. Everything that belongs to the ACCOUNT (wishlist,
/// addresses, orders, wallet) lives in [RealtimeStore], pushed by the server.
class ShopState {
  static final ShopState instance = ShopState._();
  ShopState._();

  final List<CartItem> cart = [];

  /// Lines moved out of the cart to buy later (persisted on the device, like the cart).
  final List<CartItem> savedForLater = [];

  /// Backend ids of recently viewed listings, newest first (persisted).
  final List<String> recentlyViewed = [];

  /// A promo code the server accepted for the current subtotal (null when none).
  AppliedPromo? appliedPromo;


  /// The saved address (backend id) used for delivery; null → default / first.
  String? selectedAddressId;

  /// The address the order would be delivered to: the chosen one, else the default, else the first (null: none saved).
  AddressDto? get deliveryAddress {
    final list = RealtimeStore.instance.addresses;
    if (list.isEmpty) return null;
    return list.firstWhere((a) => a.id == selectedAddressId, orElse: () => list.firstWhere((a) => a.isDefault, orElse: () => list.first));
  }

  /// What [syncWithCatalog] changed because stock ran out or dropped (shown
  /// once on the cart / checkout, then cleared with [takeStockNotices]).
  final List<String> stockNotices = [];

  /// Hands over the pending stock notices and forgets them.
  List<String> takeStockNotices() {
    final out = List<String>.of(stockNotices);
    stockNotices.clear();
    return out;
  }

  SharedPreferences? _prefs;

  // ---- account cart sync (cart:get / cart:set / cart:updated) ----
  /// The customer whose server cart was merged in; pushes start only after that first merge.
  String? _syncedUser;
  /// Last cart content exchanged with the server, to skip echoes and no-op pushes.
  String _lastSig = '';
  Timer? _pushTimer;
  bool _listening = false;

  static List<Map<String, dynamic>> _fromServer(Object? l) => (l is List ? l : const [])
      .whereType<Map>()
      .map((e) => {'u': '${e['productId']}', 'v': '${e['variant'] ?? 'Default'}', 'q': (e['qty'] as num?)?.toInt() ?? 1, 'p': e['priceWhenAdded']})
      .toList();

  static List<Map<String, dynamic>> _toServer(List<CartItem> l) =>
      l.map((c) => {'productId': c.product.uuid, 'variant': c.variant, 'qty': c.qty, 'priceWhenAdded': c.priceWhenAdded}).toList();

  /// Union by product + variant, keeping the larger quantity (a line added on either side survives).
  static List<Map<String, dynamic>> _merge(List<Map<String, dynamic>> a, List<Map<String, dynamic>> b) {
    final out = <String, Map<String, dynamic>>{};
    for (final l in [...a, ...b]) {
      final k = '${l['u']}|${l['v']}';
      final prev = out[k];
      if (prev == null || ((l['q'] as num?) ?? 0) > ((prev['q'] as num?) ?? 0)) out[k] = {...?prev, ...l, if (prev?['p'] != null) 'p': prev!['p']};
    }
    return out.values.toList();
  }

  void _replaceFromJson(List<Map<String, dynamic>> lines, List<Map<String, dynamic>> saved) {
    cart.clear();
    savedForLater.clear();
    _pendingRestore = lines;
    _pendingSaved = saved;
    syncWithCatalog();
  }

  void _onServerCart() {
    final store = RealtimeStore.instance;
    final v = store.serverCart.value;
    final u = store.user;
    if (v == null || u == null || u.role != 'customer') return;
    final sLines = _fromServer(v['lines']);
    final sSaved = _fromServer(v['saved']);
    if (_syncedUser != u.id) {
      // First view after sign-in: keep what was put in the cart before signing in, add the account's lines.
      _syncedUser = u.id;
      final local = [...cart.map((c) => c.toJson()), ...?_pendingRestore];
      final localSaved = [...savedForLater.map((c) => c.toJson()), ...?_pendingSaved];
      _replaceFromJson(_merge(local, sLines), _merge(localSaved, sSaved));
      save();
      return;
    }
    final sig = jsonEncode([v['lines'], v['saved']]);
    if (sig == _lastSig) return; // our own push coming back
    _lastSig = sig;
    _replaceFromJson(sLines, sSaved);
    _saveLocal();
  }

  void _schedulePush() {
    final u = RealtimeStore.instance.user;
    if (u == null || u.role != 'customer' || _syncedUser != u.id) return;
    // Lines still waiting for the catalogue would be sent as an empty cart: push once they are resolved.
    if (_pendingRestore != null || _pendingSaved != null) return;
    _pushTimer?.cancel();
    _pushTimer = Timer(const Duration(milliseconds: 500), () async {
      final body = {'lines': _toServer(cart), 'saved': _toServer(savedForLater)};
      try {
        final res = await RealtimeStore.instance.call('cart:set', body);
        if (res is Map) _lastSig = jsonEncode([res['lines'], res['saved']]);
      } catch (_) {
        // Offline: the device copy is kept and pushed with the next change.
      }
    });
  }

  /// Discount previewed for [subtotalUsd]; 0 unless the server validated the
  /// code for exactly this subtotal (cart changes re-validate via [applyPromo]).
  double promoDiscount(double subtotalUsd) {
    final p = appliedPromo;
    if (p == null || (p.forSubtotal - subtotalUsd).abs() > 0.005) return 0;
    return p.discountUsd;
  }

  /// Ask the server whether [code] works for the current subtotal.
  /// Returns an error message, or null on success.
  ///
  /// [lines] are the lines being bought (the whole cart when null): the server needs them to preview a STORE coupon,
  /// which only discounts that store's lines.
  Future<String?> applyPromo(String code, {double? subtotalUsd, List<CartItem>? lines}) async {
    final sub = subtotalUsd ?? subtotal;
    try {
      final res = await RealtimeStore.instance.validatePromo(code.trim(), sub, items: _promoItems(lines ?? cart));
      if (res['ok'] == true) {
        appliedPromo = AppliedPromo(
          code: (res['code'] ?? code).toString(),
          discountUsd: (res['discount'] as num).toDouble(),
          forSubtotal: sub,
        );
        return null;
      }
      appliedPromo = null;
      final reason = res['reason']?.toString();
      return reason == null ? Strings.current.promoInvalid : Strings.current.serverError(reason);
    } catch (e) {
      return Strings.current.errorText(e);
    }
  }

  static List<Map<String, dynamic>> _promoItems(List<CartItem> lines) =>
      [for (final c in lines) {'productId': c.product.uuid, 'qty': c.qty}];

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
      selectedAddressId = _prefs!.getString('selectedAddressId');
      recentlyViewed
        ..clear()
        ..addAll(_prefs!.getStringList('recentlyViewed') ?? const []);
      restoreCart();
      if (!_listening) {
        _listening = true;
        RealtimeStore.instance.serverCart.addListener(_onServerCart);
      }
    } catch (_) {
      // Persistence is best-effort.
    }
  }

  void save() {
    _saveLocal();
    _schedulePush();
  }

  void _saveLocal() {
    final p = _prefs;
    if (p == null) return;
    if (selectedAddressId != null) p.setString('selectedAddressId', selectedAddressId!);
    p.setStringList('recentlyViewed', recentlyViewed);
    p.setString('cart', jsonEncode(cart.map((c) => c.toJson()).toList()));
    p.setString('savedForLater', jsonEncode(savedForLater.map((c) => c.toJson()).toList()));
  }

  /// Rebuild the cart from the persisted lines once the catalogue is known, and
  /// refresh prices/stock of the current lines. Lines whose listing vanished
  /// (removed by the seller) or whose stock is 0 are dropped, and quantities
  /// above the stock left are reduced; both leave a notice in [stockNotices].
  void syncWithCatalog() {
    // Until the first download finished we don't know the catalogue: never drop lines then.
    if (!RealtimeStore.instance.hydrated) return;
    CartItem? line(Map<String, dynamic> l) {
      final p = productByUuid(l['u'] as String);
      if (p == null) return null;
      return CartItem(product: p, variant: l['v'] as String? ?? 'Default', qty: (l['q'] as num?)?.toInt() ?? 1, priceWhenAdded: (l['p'] as num?)?.toDouble());
    }

    var resolved = false;
    final stored = _pendingRestore;
    if (stored != null && cart.isEmpty) {
      cart.addAll(stored.map(line).whereType<CartItem>());
      _pendingRestore = null;
      resolved = true;
    }
    final saved = _pendingSaved;
    if (saved != null && savedForLater.isEmpty) {
      savedForLater.addAll(saved.map(line).whereType<CartItem>());
      _pendingSaved = null;
      resolved = true;
    }
    cart.removeWhere((c) => productByUuid(c.product.uuid) == null);
    savedForLater.removeWhere((c) => productByUuid(c.product.uuid) == null);
    for (final c in savedForLater) {
      c.product = productByUuid(c.product.uuid)!;
    }
    final s = Strings.current;
    var changed = false;
    for (final c in List<CartItem>.of(cart)) {
      final fresh = productByUuid(c.product.uuid);
      if (fresh != null) c.product = fresh;
      final name = c.product.displayName(s.lang);
      if (c.product.stock <= 0) {
        cart.remove(c);
        stockNotices.add(s.cartSoldOutRemoved(name));
        changed = true;
      } else if (c.qty > c.product.stock) {
        c.qty = c.product.stock;
        stockNotices.add(s.cartQtyReduced(c.product.stock, name));
        changed = true;
      }
    }
    if (changed || resolved) save();
  }

  List<Map<String, dynamic>>? _pendingRestore;
  List<Map<String, dynamic>>? _pendingSaved;

  /// Read the persisted cart lines (resolved to products by [syncWithCatalog]).
  void restoreCart() {
    try {
      final raw = _prefs?.getString('cart');
      if (raw == null) return;
      _pendingRestore = (jsonDecode(raw) as List).map((e) => Map<String, dynamic>.from(e as Map)).toList();
    } catch (_) {
      _pendingRestore = null;
    }
    try {
      final raw = _prefs?.getString('savedForLater');
      if (raw != null) _pendingSaved = (jsonDecode(raw) as List).map((e) => Map<String, dynamic>.from(e as Map)).toList();
    } catch (_) {
      _pendingSaved = null;
    }
  }

  /// Sign-out: nothing of the previous account's session may leak to the next.
  void clearSession() {
    cart.clear();
    savedForLater.clear();
    appliedPromo = null;
    recentlyViewed.clear();
    selectedAddressId = null;
    _pendingRestore = null;
    _pendingSaved = null;
    _syncedUser = null;
    _lastSig = '';
    _pushTimer?.cancel();
    RealtimeStore.instance.serverCart.value = null;
    final p = _prefs;
    if (p != null) {
      p.remove('cart');
      p.remove('savedForLater');
      p.remove('recentlyViewed');
      p.remove('selectedAddressId');
    }
  }

  /// Adds [qty] of [p], never beyond the stock left (counting what the cart
  /// already holds). Returns how many units were actually added: less than
  /// [qty] means the stock cap was hit.
  int addToCart(Product p, {String variant = 'Default', int qty = 1}) {
    CartItem? existing;
    for (final c in cart) {
      if (c.product.uuid == p.uuid && c.variant == variant) {
        existing = c;
        break;
      }
    }
    final inCart = cart.where((c) => c.product.uuid == p.uuid).fold(0, (n, c) => n + c.qty);
    final added = qty.clamp(0, (p.stock - inCart).clamp(0, p.stock));
    if (added == 0) return 0;
    if (existing != null) {
      existing.qty += added;
    } else {
      cart.add(CartItem(product: p, variant: variant, qty: added));
    }
    save();
    return added;
  }

  /// Removes line [i] and returns it (so the cart can offer Undo).
  CartItem removeAt(int i) {
    final removed = cart.removeAt(i);
    save();
    return removed;
  }

  /// Undo a removal: put the line back where it was.
  void restoreLine(int i, CartItem item) {
    cart.insert(i.clamp(0, cart.length), item);
    save();
  }

  /// Move cart line [i] to "Saved for later".
  void saveForLater(int i) {
    final item = cart.removeAt(i);
    savedForLater.removeWhere((c) => c.product.uuid == item.product.uuid && c.variant == item.variant);
    savedForLater.insert(0, item);
    save();
  }

  /// Move a saved line back into the cart (capped at the stock left). Returns the units added.
  int moveToCart(int i) {
    final item = savedForLater[i];
    final added = addToCart(item.product, variant: item.variant, qty: item.qty);
    // Nothing fitted (sold out, or the cart already holds all the stock): the line stays saved.
    if (added > 0) savedForLater.removeAt(i);
    save();
    return added;
  }

  void removeSaved(int i) {
    savedForLater.removeAt(i);
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
