import 'dart:async';

import 'package:get/get.dart';

import '../../data/mock/mock_data.dart';
import '../../data/models/models.dart';

/// In-memory marketplace state: cart, wishlist, orders, wallet, addresses,
/// notifications and returns. Backed entirely by mock data for now; a REST
/// implementation will replace the bodies of these methods later.
class ShopService extends GetxService {
  // ---- Catalog ----
  List<Product> get products => MockData.products;
  List<Category> get categories => MockData.categories;
  List<Store> get stores => MockData.stores;

  // ---- Cart ----
  final cart = <CartItem>[].obs;
  final coupon = Rxn<Coupon>();

  int get cartCount => cart.fold(0, (sum, i) => sum + i.quantity);
  double get cartSubtotal => cart.fold(0, (sum, i) => sum + i.total);
  double get couponDiscount => coupon.value?.discountFor(cartSubtotal) ?? 0;

  /// Distinct stores in the cart — the order is split per store at checkout.
  List<Store> get cartStores =>
      cart.map((i) => i.product.storeId).toSet().map(MockData.storeById).toList();

  void addToCart(Product product,
      {Map<String, String> variants = const {}, int qty = 1}) {
    final existing = cart.firstWhereOrNull((i) =>
        i.product.id == product.id &&
        _sameVariants(i.selectedVariants, variants));
    if (existing != null) {
      existing.quantity += qty;
      cart.refresh();
    } else {
      cart.add(CartItem(product: product, selectedVariants: variants, quantity: qty));
    }
  }

  bool _sameVariants(Map<String, String> a, Map<String, String> b) =>
      a.length == b.length && a.entries.every((e) => b[e.key] == e.value);

  void removeFromCart(CartItem item) => cart.remove(item);

  void changeQty(CartItem item, int delta) {
    item.quantity = (item.quantity + delta).clamp(1, 99);
    cart.refresh();
  }

  bool applyCoupon(String code) {
    final found = MockData.coupons
        .firstWhereOrNull((c) => c.code == code.trim().toUpperCase());
    if (found == null || found.discountFor(cartSubtotal) == 0) return false;
    coupon.value = found;
    return true;
  }

  void clearCoupon() => coupon.value = null;

  // ---- Wishlist / browsing history ----
  final wishlist = <String>{}.obs;
  final recentlyViewed = <String>[].obs;
  final recentSearches = <String>[].obs;

  bool isWishlisted(Product p) => wishlist.contains(p.id);

  void toggleWishlist(Product p) {
    if (!wishlist.remove(p.id)) wishlist.add(p.id);
  }

  void markViewed(Product p) {
    recentlyViewed.remove(p.id);
    recentlyViewed.insert(0, p.id);
    if (recentlyViewed.length > 10) recentlyViewed.removeLast();
  }

  void rememberSearch(String query) {
    final q = query.trim();
    if (q.isEmpty) return;
    recentSearches.remove(q);
    recentSearches.insert(0, q);
    if (recentSearches.length > 6) recentSearches.removeLast();
  }

  // ---- Orders ----
  final orders = <Order>[].obs;
  Timer? _progressTimer;

  @override
  void onInit() {
    super.onInit();
    orders.assignAll(MockData.initialOrders());
    walletEntries.assignAll(MockData.initialWalletEntries());
    notifications.assignAll(MockData.initialNotifications());
    // Slowly walk live orders through the lifecycle so tracking feels real.
    _progressTimer =
        Timer.periodic(const Duration(seconds: 40), (_) => _advanceOrders());
  }

  @override
  void onClose() {
    _progressTimer?.cancel();
    super.onClose();
  }

  void _advanceOrders() {
    var changed = false;
    for (final order in orders) {
      if (order.status.isException ||
          order.status == OrderStatus.delivered ||
          order.status == OrderStatus.completed) {
        continue;
      }
      final next = OrderStatus.values[order.status.index + 1];
      order.status = next;
      final idx = order.timeline.indexWhere((t) => t.status == next);
      if (idx >= 0) {
        order.timeline[idx] = TimelineEntry(status: next, at: DateTime.now());
      }
      changed = true;
    }
    if (changed) orders.refresh();
  }

  /// Splits the cart into one order per store, per the marketplace model.
  List<Order> placeOrder(Address address, PaymentMethod method) {
    final created = <Order>[];
    final subtotal = cartSubtotal;
    final discount = couponDiscount;
    for (final store in cartStores) {
      final items = cart
          .where((i) => i.product.storeId == store.id)
          .map((i) => OrderItem(
                product: i.product,
                selectedVariants: i.selectedVariants,
                quantity: i.quantity,
                price: i.product.price,
              ))
          .toList();
      final orderSubtotal =
          items.fold<double>(0, (sum, i) => sum + i.price * i.quantity);
      final now = DateTime.now();
      final mainStatuses =
          OrderStatus.values.where((s) => !s.isException).toList();
      final sellerPos =
          MockData.communePositions[store.commune] ?? MockData.warehouseKinshasa;
      final order = Order(
        id: 'ORD-2026-${(120 + orders.length + created.length).toString().padLeft(4, '0')}',
        store: store,
        items: items,
        address: address,
        paymentMethod: method,
        subtotal: orderSubtotal,
        deliveryFee: MockData.deliveryFees[address.commune] ?? 5,
        discount: subtotal == 0 ? 0 : discount * orderSubtotal / subtotal,
        placedAt: now,
        status: OrderStatus.confirmed,
        timeline: [
          for (final s in mainStatuses)
            TimelineEntry(
                status: s, at: s == OrderStatus.confirmed ? now : null),
        ],
        route: [sellerPos, MockData.warehouseKinshasa, address.position],
      );
      created.add(order);
    }
    orders.insertAll(0, created);
    if (method == PaymentMethod.wallet) {
      _debitWallet(created.fold(0, (sum, o) => sum + o.total));
    }
    cart.clear();
    coupon.value = null;
    return created;
  }

  void cancelOrder(Order order) {
    order.status = OrderStatus.cancelled;
    orders.refresh();
    creditWallet(order.total, 'Refund — order ${order.id}',
        'Remboursement — commande ${order.id}', WalletEntryType.refund);
  }

  void reorder(Order order) {
    for (final item in order.items) {
      addToCart(item.product,
          variants: item.selectedVariants, qty: item.quantity);
    }
  }

  // ---- Returns ----
  final returns = <ReturnRequest>[].obs;

  bool isReturnable(Order order) {
    if (!order.canReturn) return false;
    return order.items.any((i) {
      final cat = MockData.categories
          .firstWhereOrNull((c) => c.id == i.product.categoryId);
      return cat?.returnable ?? true;
    });
  }

  ReturnRequest requestReturn(Order order,
      {required String reasonKey,
      required String note,
      required bool refundToWallet}) {
    final request = ReturnRequest(
      id: 'RET-${(40 + returns.length).toString().padLeft(4, '0')}',
      order: order,
      reasonKey: reasonKey,
      note: note,
      requestedAt: DateTime.now(),
      status: ReturnStatus.requested,
      refundToWallet: refundToWallet,
    );
    returns.insert(0, request);
    order.status = OrderStatus.returnRequested;
    orders.refresh();
    return request;
  }

  // ---- Wallet ----
  final walletEntries = <WalletEntry>[].obs;

  double get walletBalance =>
      walletEntries.fold(0, (sum, e) => sum + e.amount);

  void creditWallet(
      double usd, String descEn, String descFr, WalletEntryType type) {
    walletEntries.insert(
      0,
      WalletEntry(
        id: 'w-${DateTime.now().millisecondsSinceEpoch}',
        type: type,
        amount: usd,
        descriptionEn: descEn,
        descriptionFr: descFr,
        at: DateTime.now(),
      ),
    );
  }

  void _debitWallet(double usd) {
    walletEntries.insert(
      0,
      WalletEntry(
        id: 'w-${DateTime.now().millisecondsSinceEpoch}',
        type: WalletEntryType.purchase,
        amount: -usd,
        descriptionEn: 'Order payment',
        descriptionFr: 'Paiement de commande',
        at: DateTime.now(),
      ),
    );
  }

  // ---- Addresses ----
  final addresses = <Address>[].obs;

  Address? get defaultAddress =>
      addresses.firstWhereOrNull((a) => a.isDefault) ?? addresses.firstOrNull;

  void initAddresses() {
    if (addresses.isEmpty) addresses.assignAll(MockData.initialAddresses);
  }

  void saveAddress(Address address) {
    final idx = addresses.indexWhere((a) => a.id == address.id);
    if (idx >= 0) {
      addresses[idx] = address;
    } else {
      addresses.add(address);
    }
    if (address.isDefault) _ensureSingleDefault(address.id);
  }

  void setDefault(Address address) => _ensureSingleDefault(address.id);

  void _ensureSingleDefault(String id) {
    for (var i = 0; i < addresses.length; i++) {
      addresses[i] = addresses[i].copyWith(isDefault: addresses[i].id == id);
    }
  }

  void removeAddress(Address address) => addresses.remove(address);

  // ---- Notifications ----
  final notifications = <AppNotification>[].obs;

  int get unreadCount => notifications.where((n) => !n.read).length;

  void markAllRead() {
    for (final n in notifications) {
      n.read = true;
    }
    notifications.refresh();
  }
}
