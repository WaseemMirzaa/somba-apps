import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'auth_service.dart';
import 'models.dart';
import 'socket_service.dart';

enum ConnStatus { disconnected, connecting, connected, error }

/// App-wide realtime state. A [ChangeNotifier] singleton so any screen can
/// `AnimatedBuilder(animation: RealtimeStore.instance, ...)` and rebuild on
/// live pushes — no third-party state library required.
class RealtimeStore extends ChangeNotifier {
  RealtimeStore._();
  static final RealtimeStore instance = RealtimeStore._();

  final _auth = AuthService();
  final _socket = SocketService();

  ConnStatus status = ConnStatus.disconnected;
  BackendUser? user;
  String? error;

  final List<ProductDto> products = [];
  final List<OrderDto> orders = [];
  final List<NotificationDto> notifications = [];
  final Map<String, RiderLocationDto> riderLocations = {};
  double walletBalance = 0;
  final List<WalletTransactionDto> walletTransactions = [];
  final List<PaymentDto> payments = [];

  bool get isConnected => status == ConnStatus.connected;
  int get unreadCount => notifications.where((n) => !n.read).length;

  // ---- session lifecycle ----
  Future<void> login(String email, String password) async {
    error = null;
    status = ConnStatus.connecting;
    notifyListeners();
    try {
      final result = await _auth.login(email, password);
      await _auth.saveTokens(result);
      await _connect(result);
    } catch (e) {
      error = e.toString();
      status = ConnStatus.error;
      notifyListeners();
      rethrow;
    }
  }

  Future<void> register({
    required String email,
    required String password,
    required String name,
    String role = 'customer',
    String? phone,
  }) async {
    error = null;
    status = ConnStatus.connecting;
    notifyListeners();
    final result = await _auth.register(
      email: email,
      password: password,
      name: name,
      role: role,
      phone: phone,
    );
    await _auth.saveTokens(result);
    await _connect(result);
  }

  /// Try to silently restore a session at app start.
  Future<void> tryRestore() async {
    final refresh = await _auth.getRefresh();
    if (refresh == null) return;
    try {
      final result = await _auth.refresh(refresh);
      await _auth.saveTokens(result);
      await _connect(result);
    } catch (_) {
      await _auth.clear();
    }
  }

  Future<void> logout() async {
    await _auth.clear();
    _socket.disconnect();
    user = null;
    status = ConnStatus.disconnected;
    products.clear();
    orders.clear();
    notifications.clear();
    riderLocations.clear();
    walletBalance = 0;
    walletTransactions.clear();
    payments.clear();
    notifyListeners();
  }

  Future<void> _connect(AuthResult result) async {
    user = result.user;
    status = ConnStatus.connecting;
    notifyListeners();

    final socket = _socket.connect(result.accessToken);
    socket.onConnect((_) {
      status = ConnStatus.connected;
      notifyListeners();
    });
    socket.onDisconnect((_) {
      status = ConnStatus.connecting;
      notifyListeners();
    });
    socket.on('unauthorized', (_) => logout());

    // Server pushes — no polling.
    _socket.on('order:created', (d) => _upsertOrder(d));
    _socket.on('order:updated', (d) => _upsertOrder(d));
    _socket.on('notification:new', (d) {
      notifications.insert(0, NotificationDto.fromJson(_map(d)));
      notifyListeners();
    });
    _socket.on('delivery:location', (d) {
      final loc = RiderLocationDto.fromJson(_map(d));
      riderLocations[loc.orderId] = loc;
      notifyListeners();
    });
    _socket.on('wallet:updated', (d) {
      walletBalance = (_map(d)['balance'] as num?)?.toDouble() ?? walletBalance;
      notifyListeners();
    });
    _socket.on('wallet:transaction', (d) {
      walletTransactions.insert(0, WalletTransactionDto.fromJson(_map(d)));
      notifyListeners();
    });
    _socket.on('payment:created', (d) => _upsertPayment(d));
    _socket.on('payment:updated', (d) => _upsertPayment(d));

    await _hydrate();
  }

  Future<void> _hydrate() async {
    try {
      final prod = await _socket.request('products:list');
      products
        ..clear()
        ..addAll((prod as List).map((e) => ProductDto.fromJson(_map(e))));
      final ord = await _socket.request('orders:list');
      orders
        ..clear()
        ..addAll((ord as List).map((e) => OrderDto.fromJson(_map(e))));
      final notif = await _socket.request('notifications:list');
      notifications
        ..clear()
        ..addAll((notif as List).map((e) => NotificationDto.fromJson(_map(e))));
      final wallet = await _socket.request('wallet:get');
      walletBalance = (_map(wallet)['balance'] as num?)?.toDouble() ?? 0;
      final tx = await _socket.request('wallet:transactions');
      walletTransactions
        ..clear()
        ..addAll(
            (tx as List).map((e) => WalletTransactionDto.fromJson(_map(e))));
      final pays = await _socket.request('payments:list');
      payments
        ..clear()
        ..addAll((pays as List).map((e) => PaymentDto.fromJson(_map(e))));
      status = ConnStatus.connected;
      notifyListeners();
    } catch (_) {
      // Hydration is best-effort; live events keep flowing.
    }
  }

  Future<WalletTransactionDto> topUpWallet(double amountUsd,
      {String method = 'airtel_money'}) async {
    final res = await _socket.request('wallet:topup', {
      'amountUsd': amountUsd,
      'method': method,
    });
    return WalletTransactionDto.fromJson(_map(res));
  }

  void _upsertPayment(dynamic data) {
    final p = PaymentDto.fromJson(_map(data));
    final idx = payments.indexWhere((x) => x.id == p.id);
    if (idx == -1) {
      payments.insert(0, p);
    } else {
      payments[idx] = p;
    }
    notifyListeners();
  }

  // ---- actions (writes over the socket) ----
  Future<OrderDto> placeOrder({
    required String productId,
    int qty = 1,
    String paymentMethod = 'cod',
    double deliveryFeeUsd = 3,
    Map<String, dynamic>? address,
  }) async {
    final res = await _socket.request('orders:create', {
      'items': [
        {'productId': productId, 'qty': qty},
      ],
      'paymentMethod': paymentMethod,
      'deliveryFeeUsd': deliveryFeeUsd,
      if (address != null) 'shippingAddress': jsonEncode(address),
    });
    return OrderDto.fromJson(_map(res));
  }

  /// Place an order from arbitrary cart lines (name + priceUsd snapshots), so
  /// the storefront's own catalogue can check out for real.
  Future<OrderDto> placeOrderLines({
    required List<Map<String, dynamic>> items,
    String paymentMethod = 'cod',
    double deliveryFeeUsd = 3,
    Map<String, dynamic>? address,
  }) async {
    final res = await _socket.request('orders:create', {
      'items': items,
      'paymentMethod': paymentMethod,
      'deliveryFeeUsd': deliveryFeeUsd,
      if (address != null) 'shippingAddress': jsonEncode(address),
    });
    return OrderDto.fromJson(_map(res));
  }

  Future<void> markRead(String id) async {
    await _socket.request('notifications:markRead', {'id': id});
    final idx = notifications.indexWhere((n) => n.id == id);
    if (idx != -1) {
      final n = notifications[idx];
      notifications[idx] = NotificationDto(
        id: n.id,
        title: n.title,
        body: n.body,
        type: n.type,
        read: true,
      );
      notifyListeners();
    }
  }

  // ---- helpers ----
  void _upsertOrder(dynamic data) {
    final o = OrderDto.fromJson(_map(data));
    final idx = orders.indexWhere((x) => x.id == o.id);
    if (idx == -1) {
      orders.insert(0, o);
    } else {
      orders[idx] = o;
    }
    notifyListeners();
  }

  Map<String, dynamic> _map(dynamic d) =>
      (d as Map).map((k, v) => MapEntry(k.toString(), v));
}
