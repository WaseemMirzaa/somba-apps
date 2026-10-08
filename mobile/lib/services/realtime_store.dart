import 'dart:async';
import 'dart:convert';
import 'package:flutter/foundation.dart';
import '../data/market_profiles.dart';
import 'auth_service.dart';
import 'models.dart';
import 'socket_service.dart';

enum ConnStatus { disconnected, connecting, connected, error }

/// App-wide realtime state. A [ChangeNotifier] singleton so any screen can
/// `AnimatedBuilder(animation: RealtimeStore.instance, ...)` and rebuild on
/// live pushes — no third-party state library, and no polling: the server
/// pushes every change over the socket.
class RealtimeStore extends ChangeNotifier {
  RealtimeStore._();
  static final RealtimeStore instance = RealtimeStore._();

  final _auth = AuthService();
  final _socket = SocketService();

  ConnStatus status = ConnStatus.disconnected;
  BackendUser? user;
  String? error;

  final List<ProductDto> products = [];
  final List<CategoryDto> categories = [];
  final List<OrderDto> orders = [];
  final List<NotificationDto> notifications = [];
  final Map<String, RiderLocationDto> riderLocations = {};
  double walletBalance = 0;
  final List<WalletTransactionDto> walletTransactions = [];
  final List<PaymentDto> payments = [];
  final List<AddressDto> addresses = [];

  /// Home-page banners published by the admin (CMS blocks of type `banner`).
  final List<BannerDto> banners = [];

  /// Delivery zones + USD→CDF rate from the server's public settings.
  List<Zone> zones = [];
  double? fxRate;

  /// Account preferences (`me:prefs`): push / email / sms / personalize / market.
  Map<String, dynamic> prefs = {'push': true, 'email': true, 'sms': false, 'personalize': true, 'market': 'DRC'};
  final Set<String> wishlistIds = {};

  /// True once the first full download after sign-in finished (UI shows a
  /// loader instead of an empty catalogue until then).
  bool hydrated = false;

  /// Called when the server ends the session (revoked, suspended, deleted).
  VoidCallback? onSessionEnded;

  String? _access;
  String? _refresh;

  bool get isConnected => status == ConnStatus.connected;
  bool get isSignedIn => user != null;
  int get unreadCount => notifications.where((n) => !n.read).length;

  // ---- session lifecycle ----
  Future<void> login(String email, String password) async {
    error = null;
    status = ConnStatus.connecting;
    notifyListeners();
    try {
      await _begin(await _auth.login(email, password));
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
    String? phone,
    String locale = 'en',
  }) async {
    error = null;
    status = ConnStatus.connecting;
    notifyListeners();
    try {
      await _begin(await _auth.register(
        email: email,
        password: password,
        name: name,
        phone: phone,
        locale: locale,
      ));
    } catch (e) {
      error = e.toString();
      status = ConnStatus.error;
      notifyListeners();
      rethrow;
    }
  }

  /// Silently restore a session from the stored refresh token. Returns whether
  /// the user is signed in afterwards. A network failure keeps the stored token
  /// (so a flaky start doesn't sign the user out); only a rejection clears it.
  Future<bool> tryRestore() async {
    try {
      final stored = await _auth.getRefresh();
      if (stored == null) return false;
      await _begin(await _auth.refresh(stored));
      return true;
    } on ApiException catch (e) {
      if (e.status == 401 || e.status == 403) await _auth.clear();
      return false;
    } catch (_) {
      return false; // storage / network trouble: show the sign-in screen
    }
  }

  Future<void> logout() async {
    final access = _access;
    if (access != null && _socket.isConnected) {
      // Stop pushes to this device before the token disappears.
      unawaited(_socket.request('devices:unregister', {'token': _deviceToken ?? ''}).catchError((_) {}));
    }
    await _auth.clear();
    _socket.disconnect();
    _access = null;
    _refresh = null;
    user = null;
    status = ConnStatus.disconnected;
    hydrated = false;
    banners.clear();
    zones = [];
    for (final l in [products, categories, orders, notifications, walletTransactions, payments, addresses]) {
      l.clear();
    }
    wishlistIds.clear();
    riderLocations.clear();
    walletBalance = 0;
    notifyListeners();
  }

  Future<void> _begin(AuthResult result) async {
    await _auth.saveTokens(result);
    _access = result.accessToken;
    _refresh = result.refreshToken;
    user = result.user;
    walletBalance = result.user.walletBalance;
    status = ConnStatus.connecting;
    hydrated = false;
    notifyListeners();
    _connect();
  }

  /// A currently valid access token, refreshing it when it is about to expire.
  Future<String> freshAccessToken() async {
    final token = _access;
    if (token != null && !_expiresWithin(token, const Duration(seconds: 45))) return token;
    final refresh = _refresh ?? await _auth.getRefresh();
    if (refresh == null) throw ApiException('Signed out.', 401);
    try {
      final r = await _auth.refresh(refresh);
      await _auth.saveTokens(r);
      _access = r.accessToken;
      _refresh = r.refreshToken;
      return r.accessToken;
    } on ApiException catch (e) {
      if (e.status == 401 || e.status == 403) {
        // Revoked / suspended / deleted: end the session instead of retrying forever.
        unawaited(_endSession());
      }
      rethrow;
    }
  }

  DateTime _lastVerify = DateTime.fromMillisecondsSinceEpoch(0);

  /// After a refused connection: is the session still valid? A rejected refresh
  /// token (revoked, suspended, deleted) ends the session; a network error doesn't.
  Future<void> _verifySession({bool force = false}) async {
    final now = DateTime.now();
    if ((!force && now.difference(_lastVerify) < const Duration(seconds: 3)) || user == null) return;
    _lastVerify = now;
    final refresh = _refresh ?? await _auth.getRefresh();
    if (refresh == null) return;
    try {
      final r = await _auth.refresh(refresh);
      await _auth.saveTokens(r);
      _access = r.accessToken;
      _refresh = r.refreshToken;
    } on ApiException catch (e) {
      if (e.status == 401 || e.status == 403) await _endSession();
    } catch (_) {/* offline: keep retrying */}
  }

  Future<void> _endSession() async {
    if (user == null) return;
    await logout();
    onSessionEnded?.call();
  }

  static bool _expiresWithin(String jwt, Duration d) {
    try {
      final payload = jwt.split('.')[1];
      final json = jsonDecode(utf8.decode(base64Url.decode(base64Url.normalize(payload)))) as Map;
      final exp = (json['exp'] as num).toInt() * 1000;
      return DateTime.now().millisecondsSinceEpoch + d.inMilliseconds >= exp;
    } catch (_) {
      return true;
    }
  }

  void _connect() {
    final socket = _socket.connect(freshAccessToken);
    // The server announces `ready` once it has verified the token and joined the
    // user's rooms; requests sent before that are refused. Every (re)connect
    // re-downloads state, so anything missed while offline (a mobile-money
    // approval, a status change) shows up immediately.
    socket.on('ready', (_) {
      status = ConnStatus.connected;
      notifyListeners();
      unawaited(_hydrate());
    });
    socket.on('disconnect', (reason) {
      if (user == null) return;
      status = ConnStatus.connecting;
      notifyListeners();
      // When the SERVER drops us (suspension, password change elsewhere, role
      // change) socket.io does not reconnect on its own. Check whether the
      // session is still valid; if so, come back.
      if (reason == 'io server disconnect') {
        unawaited(() async {
          await _verifySession(force: true);
          if (user != null) _socket.socket?.connect();
        }());
      }
    });
    socket.on('connect_error', (_) {
      if (user == null) return;
      status = ConnStatus.connecting;
      notifyListeners();
      // The server may be refusing us on purpose (suspended / revoked): ask it.
      unawaited(_verifySession());
    });

    // Server pushes — no polling.
    _socket.on('order:created', _upsertOrder);
    _socket.on('order:updated', _upsertOrder);
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
    _socket.on('payment:created', _upsertPayment);
    _socket.on('payment:updated', _upsertPayment);
    _socket.on('product:created', (d) => _upsertProduct(d));
    _socket.on('product:updated', (d) => _upsertProduct(d));
    _socket.on('wishlist:updated', (d) {
      wishlistIds
        ..clear()
        ..addAll((d as List).map((e) => e.toString()));
      notifyListeners();
    });
    _socket.on('addresses:updated', (_) => unawaited(_loadAddresses()));
    _socket.on('settings:updated', (d) {
      final m = _map(d);
      fxRate = double.tryParse('${m['fxRate'] ?? fxRate ?? ''}');
      try {
        if (m['deliveryZones'] != null) {
          zones = (jsonDecode(m['deliveryZones'] as String) as List).map((z) => Zone.fromJson(_map(z))).toList();
        }
      } catch (_) {}
      notifyListeners();
    });
    _socket.on('me:updated', (d) {
      user = BackendUser.fromJson(_map(d));
      notifyListeners();
    });
  }

  Future<void> _hydrate() async {
    // Independent loads: one failing must not blank the others.
    await Future.wait([
      _load('products:list', (d) => _replace(products, d, ProductDto.fromJson)),
      _load('categories:list', (d) => _replace(categories, d, CategoryDto.fromJson)),
      _load('orders:list', (d) => _replace(orders, d, OrderDto.fromJson)),
      _load('notifications:list', (d) => _replace(notifications, d, NotificationDto.fromJson)),
      _load('wallet:get', (d) => walletBalance = (_map(d)['balance'] as num?)?.toDouble() ?? 0),
      _load('wallet:transactions', (d) => _replace(walletTransactions, d, WalletTransactionDto.fromJson)),
      _load('payments:list', (d) => _replace(payments, d, PaymentDto.fromJson)),
      _load('addresses:list', (d) => _replace(addresses, d, AddressDto.fromJson)),
      _load('wishlist:list', (d) => wishlistIds
        ..clear()
        ..addAll((d as List).map((e) => e.toString()))),
      _load('me:get', (d) => user = BackendUser.fromJson(_map(d))),
      _load('settings:get', (d) {
        final m = _map(d);
        fxRate = double.tryParse('${m['fxRate'] ?? ''}');
        try {
          zones = (jsonDecode((m['deliveryZones'] ?? '[]') as String) as List).map((z) => Zone.fromJson(_map(z))).toList();
        } catch (_) {
          zones = [];
        }
      }),
      _load('me:prefs', (d) => prefs = {...prefs, ..._map(d)}),
      _load('cms:list', (d) {
        banners
          ..clear()
          ..addAll((d as List)
              .map(_map)
              .where((b) => b['type'] == 'banner' && b['active'] != false)
              .map((b) => BannerDto(title: (b['title'] ?? '').toString(), body: (b['body'] ?? '').toString())));
      }),
    ]);
    hydrated = true;
    status = ConnStatus.connected;
    notifyListeners();
  }

  Future<void> _load(String event, void Function(dynamic data) apply) async {
    try {
      apply(await _socket.request(event));
    } catch (e) {
      if (kDebugMode) debugPrint('hydrate $event failed: $e');
    }
  }

  void _replace<T>(List<T> into, dynamic data, T Function(Map<String, dynamic>) parse) {
    into
      ..clear()
      ..addAll((data as List).map((e) => parse(_map(e))));
  }

  Future<void> _loadAddresses() => _load('addresses:list', (d) {
        _replace(addresses, d, AddressDto.fromJson);
        notifyListeners();
      });

  // ---- actions (writes over the socket) ----

  /// Place an order. Lines reference real listings by id; the SERVER prices
  /// them (the app only displays prices). For mobile-money methods the order is
  /// created `pending` and confirmed later by the network — watch [orders] /
  /// [payments] (pushed live) or call [awaitOrderSettled].
  Future<OrderDto> placeOrder({
    required List<Map<String, dynamic>> items,
    required String paymentMethod,
    String? paymentPhone,
    double deliveryFeeUsd = 0,
    Map<String, dynamic>? address,
    String? zoneId,
    String? promoCode,
  }) async {
    final res = await _socket.request('orders:create', {
      'items': items,
      'paymentMethod': paymentMethod,
      'deliveryFeeUsd': deliveryFeeUsd,
      if (promoCode != null && promoCode.isNotEmpty) 'promoCode': promoCode,
      if (paymentPhone != null && paymentPhone.isNotEmpty) 'paymentPhone': paymentPhone,
      if (zoneId != null) 'zoneId': zoneId,
      if (address != null) 'shippingAddress': jsonEncode(address),
    });
    final order = OrderDto.fromJson(_map(res));
    _upsertOrder(res);
    return order;
  }

  /// Resolves with the order once it leaves `pending` (confirmed / cancelled…),
  /// driven by the live pushes — no polling. Times out after [timeout].
  Future<OrderDto> awaitOrderSettled(String orderId, {Duration timeout = const Duration(minutes: 16)}) {
    final completer = Completer<OrderDto>();
    OrderDto? current() {
      for (final o in orders) {
        if (o.id == orderId) return o;
      }
      return null;
    }

    void check() {
      final o = current();
      if (o != null && o.status != 'pending' && !completer.isCompleted) {
        removeListener(check);
        completer.complete(o);
      }
    }

    addListener(check);
    check();
    return completer.future.timeout(timeout, onTimeout: () {
      removeListener(check);
      final o = current();
      if (o != null) return o;
      throw TimeoutException('Order did not settle');
    });
  }

  Future<void> cancelOrder(String orderId) async {
    _upsertOrder(await _socket.request('orders:cancel', {'orderId': orderId}));
  }

  /// Start a wallet top-up through mobile money. The wallet is credited only
  /// when the network confirms; [wallet:updated] then pushes the new balance.
  Future<PaymentDto> topUpWallet(double amountUsd, {required String method, required String phone}) async {
    final res = await _socket.request('wallet:topup', {
      'amountUsd': amountUsd,
      'method': method,
      'phone': phone,
    });
    final p = PaymentDto.fromJson(_map(res));
    _upsertPayment(res);
    return p;
  }

  /// Re-read one payment from the server (used when the app returns to the
  /// foreground, in case a push was missed).
  Future<PaymentDto> refreshPayment(String reference) async {
    final res = await _socket.request('payments:status', {'reference': reference});
    _upsertPayment(res);
    return PaymentDto.fromJson(_map(res));
  }

  OrderDto? orderById(String id) {
    for (final o in orders) {
      if (o.id == id) return o;
    }
    return null;
  }

  PaymentDto? paymentForOrder(String orderId) {
    for (final p in payments) {
      if (p.orderId == orderId) return p;
    }
    return null;
  }

  /// Server-side promo check for a subtotal (preview only; the order re-validates).
  Future<Map<String, dynamic>> validatePromo(String code, double subtotalUsd) async =>
      _map(await _socket.request('promos:validate', {'code': code, 'subtotalUsd': subtotalUsd}));

  Future<List<Map<String, dynamic>>> listPromos() async =>
      ((await _socket.request('promos:list')) as List).map((e) => _map(e)).toList();

  Future<void> toggleWishlist(String productId) async {
    // Optimistic: flip locally, then let the server's pushed list win.
    wishlistIds.contains(productId) ? wishlistIds.remove(productId) : wishlistIds.add(productId);
    notifyListeners();
    try {
      final ids = await _socket.request('wishlist:toggle', {'productId': productId});
      wishlistIds
        ..clear()
        ..addAll((ids as List).map((e) => e.toString()));
    } catch (_) {
      await _load('wishlist:list', (d) => wishlistIds
        ..clear()
        ..addAll((d as List).map((e) => e.toString())));
    }
    notifyListeners();
  }

  Future<AddressDto> addAddress(Map<String, dynamic> body) async {
    final res = await _socket.request('addresses:create', body);
    await _loadAddresses();
    return AddressDto.fromJson(_map(res));
  }

  Future<void> removeAddress(String id) async {
    await _socket.request('addresses:remove', {'id': id});
    await _loadAddresses();
  }

  Future<void> updateProfile({String? name, String? phone, String? locale}) async {
    final res = await _socket.request('me:update', {
      if (name != null) 'name': name,
      if (phone != null) 'phone': phone,
      if (locale != null) 'locale': locale,
    });
    user = BackendUser.fromJson(_map(res));
    notifyListeners();
  }

  /// Other devices are signed out; this one continues with fresh tokens.
  Future<void> setPref(String key, Object value) async {
    prefs = {...prefs, key: value};
    notifyListeners();
    try {
      prefs = {...prefs, ..._map(await _socket.request('me:setPrefs', {key: value}))};
    } catch (_) {/* keep the optimistic value; the next hydrate will correct it */}
    notifyListeners();
  }

  Future<void> changePassword(String current, String next) async {
    final res = _map(await _socket.request('me:changePassword', {'current': current, 'next': next}));
    final r = AuthResult.fromJson(res);
    await _auth.saveTokens(r);
    _access = r.accessToken;
    _refresh = r.refreshToken;
  }

  /// Permanently deletes the account (server also closes this socket).
  Future<void> deleteAccount(String password) async {
    await _socket.request('me:delete', {'password': password});
    await logout();
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
        entityId: n.entityId,
        createdAt: n.createdAt,
      );
      notifyListeners();
    }
  }

  Future<void> markAllRead() async {
    await _socket.request('notifications:markAllRead');
    for (var i = 0; i < notifications.length; i++) {
      final n = notifications[i];
      notifications[i] = NotificationDto(
        id: n.id,
        title: n.title,
        body: n.body,
        type: n.type,
        read: true,
        entityId: n.entityId,
        createdAt: n.createdAt,
      );
    }
    notifyListeners();
  }

  /// Raw request→ack call for features that don't need cached state.
  Future<dynamic> call(String event, [Map<String, dynamic>? body]) => _socket.request(event, body);

  Future<List<ReviewDto>> reviewsFor(String productId) async =>
      ((await _socket.request('reviews:list', {'productId': productId})) as List)
          .map((e) => ReviewDto.fromJson(_map(e)))
          .toList();

  Future<ReviewDto> addReview(String productId, int rating, String text) async =>
      ReviewDto.fromJson(_map(await _socket.request('reviews:create', {'productId': productId, 'rating': rating, 'text': text})));

  Future<List<QuestionDto>> questionsFor(String productId) async =>
      ((await _socket.request('questions:list', {'productId': productId})) as List)
          .map((e) => QuestionDto.fromJson(_map(e)))
          .toList();

  Future<void> askQuestion(String productId, String question) =>
      _socket.request('questions:ask', {'productId': productId, 'question': question});

  // ---- push notifications (FCM) ----
  String? _deviceToken;

  /// Register this device's FCM token so the server can push to it. Safe to
  /// call repeatedly (on every launch and whenever FCM rotates the token).
  /// Firebase itself is optional: without it, in-app live updates still work.
  Future<void> registerDevice(String token, {required String platform}) async {
    _deviceToken = token;
    if (!_socket.isConnected) return;
    await _socket.request('devices:register', {'token': token, 'platform': platform, 'app': 'customer'});
  }

  // ---- account verification (REST, needs the access token) ----
  Future<String?> sendEmailVerification() async => _auth.sendEmailVerification(await freshAccessToken());
  Future<String?> sendPhoneOtp() async => _auth.sendPhoneOtp(await freshAccessToken());

  Future<void> verifyEmailToken(String token) async {
    await _auth.verifyEmail(token);
    await refreshEmailVerified();
  }

  Future<void> verifyPhoneOtp(String code) async {
    await _auth.verifyPhoneOtp(await freshAccessToken(), code);
    await _load('me:get', (d) => user = BackendUser.fromJson(_map(d)));
    notifyListeners();
  }

  /// Re-read the profile (e.g. after the user tapped the email link).
  Future<bool> refreshEmailVerified() async {
    await _load('me:get', (d) => user = BackendUser.fromJson(_map(d)));
    notifyListeners();
    return user?.emailVerified ?? false;
  }

  Future<String?> forgotPassword(String email) => _auth.forgotPassword(email);
  Future<void> resetPassword(String token, String password) => _auth.resetPassword(token, password);

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

  void _upsertProduct(dynamic data) {
    final p = ProductDto.fromJson(_map(data));
    final idx = products.indexWhere((x) => x.id == p.id);
    // Soft-removed / non-live listings disappear from the storefront live.
    final visible = (_map(data)['status'] ?? 'live') == 'live';
    if (!visible) {
      if (idx != -1) products.removeAt(idx);
    } else if (idx == -1) {
      products.insert(0, p);
    } else {
      products[idx] = p;
    }
    notifyListeners();
  }

  Map<String, dynamic> _map(dynamic d) => (d as Map).map((k, v) => MapEntry(k.toString(), v));
}
