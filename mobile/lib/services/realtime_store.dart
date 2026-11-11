import 'dart:async';
import 'dart:convert';
import 'dart:math' show Random;
import 'package:flutter/foundation.dart';
import '../data/market_profiles.dart';
import '../l10n/strings.dart';
import '../util/format.dart' show marketNotifier;
import 'account_deletion.dart';
import 'auth_service.dart';
import 'feature_hooks.dart';
import 'models.dart';
import 'push_service.dart';
import 'socket_service.dart';

enum ConnStatus { disconnected, connecting, connected, error }

/// App-wide realtime state. A [ChangeNotifier] singleton so any screen can
/// `AnimatedBuilder(animation: RealtimeStore.instance, ...)` and rebuild on
/// live pushes — no third-party state library, and no polling: the server
/// pushes every change over the socket.
class RealtimeStore extends ChangeNotifier {
  RealtimeStore._();
  static final RealtimeStore instance = RealtimeStore._();

  AuthService _auth = AuthService();

  /// Tests: the sign-in calls (refresh, token storage) answered by a fake.
  @visibleForTesting
  set debugAuth(AuthService auth) => _auth = auth;
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

  /// Bumped when the server pushes a support-ticket / return change, so open
  /// list screens reload themselves (their data is fetched on demand).
  final ValueNotifier<int> supportRevision = ValueNotifier(0);

  /// The ticket carried by the latest `support:updated` push (open conversations follow it).
  Map<String, dynamic>? lastSupportTicket;

  /// Wallet top-ups that failed while the app was live, kept until the customer
  /// dismisses them on the wallet screen (instead of silently vanishing).
  final List<PaymentDto> failedTopups = [];

  void dismissTopupFailure(String paymentId) {
    failedTopups.removeWhere((p) => p.id == paymentId);
    notifyListeners();
  }
  final List<AddressDto> addresses = [];

  /// Home-page banners published by the admin (CMS blocks of type `banner`).
  final List<BannerDto> banners = [];

  /// USD→CDF rate from the server's public settings.

  /// The account cart as the server last sent it ({lines, saved}); ShopState merges / applies it.
  final ValueNotifier<Map<String, dynamic>?> serverCart = ValueNotifier(null);
  double? fxRate;

  /// Public setting: with it on, an account needs a verified phone OR email to
  /// place an order or top up the wallet.
  bool requireVerifiedForCheckout = false;

  /// Public setting: with it on, an order needs a delivery address pinned on the map (the app asks for the pin
  /// before checkout instead of letting the server refuse).
  bool requirePinnedAddress = false;

  /// Public setting `codEnabled`: the checkout offers cash on delivery only while the platform allows it.
  /// (`codCapUsd` is not read: the server only raises a fraud alert above the cap, it never refuses the order.)
  bool codEnabled = false;

  /// Public settings `supportPhone`, `supportEmail`, `supportWhatsapp`: how Help offers to reach KOMORIKO. Blank = not offered.
  String supportPhone = '';
  String supportEmail = '';
  String supportWhatsapp = '';

  /// Public setting `cardPayments`: `"stripe"` when the server has bank-card payments configured, else `"off"`
  /// (computed server-side from its keys, not a stored setting). The checkout offers the card tile only on `"stripe"`.
  String cardPayments = 'off';
  bool get cardPaymentsEnabled => cardPayments == 'stripe';

  /// Public settings `translation`, `smsVerification`, `emailVerification` ('on' | 'off', computed by the server from its
  /// environment). A server that does not send them (an older one) is taken to have everything on. With translation off
  /// the "See translation" links are hidden; with SMS or e-mail off the verification screens say so up front.
  bool translationAvailable = true;
  bool smsAvailable = true;
  bool emailAvailable = true;

  /// True when the app should send the user to verification instead of the server refusing the order/top-up.
  bool get needsVerification {
    final u = user;
    return requireVerifiedForCheckout && u != null && !(u.phoneVerified || u.emailVerified);
  }

  /// Bumped when the server pushes a review change (a seller reply…), so open review lists reload.
  final ValueNotifier<int> reviewRevision = ValueNotifier(0);

  /// Account preferences (`me:prefs`): push / email / sms / personalize / market.
  Map<String, dynamic> prefs = {'push': true, 'email': true, 'sms': false, 'personalize': true, 'market': 'DRC'};
  final Set<String> wishlistIds = {};

  /// True once the first full download after sign-in finished (UI shows a
  /// loader instead of an empty catalogue until then).
  bool hydrated = false;

  /// Called each time the session finished loading (sign-in, and every reconnect): the profile is then authoritative.
  VoidCallback? onHydrated;

  /// Called when the server ends the session (revoked, suspended, deleted).
  /// Receives an optional strings key for a friendly message to show on the sign-in screen.
  void Function(String? messageKey)? onSessionEnded;

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
    } on TwoFactorRequired {
      status = ConnStatus.disconnected; // the password was right: the screen asks for the code, this is no failure
      notifyListeners();
      rethrow;
    } catch (e, st) {
      error = Strings.current.errorText(e, st);
      status = ConnStatus.error;
      notifyListeners();
      rethrow;
    }
  }

  /// Sign in with a one-time code texted to the account's verified phone number.
  Future<void> loginWithPhoneCode(String phone, String code) async {
    error = null;
    status = ConnStatus.connecting;
    notifyListeners();
    try {
      await _begin(await _auth.loginWithCode(phone, code));
    } on TwoFactorRequired {
      status = ConnStatus.disconnected; // the password was right: the screen asks for the code, this is no failure
      notifyListeners();
      rethrow;
    } catch (e, st) {
      error = Strings.current.errorText(e, st);
      status = ConnStatus.error;
      notifyListeners();
      rethrow;
    }
  }

  Future<SendResult> sendLoginCode(String phone) => _auth.sendLoginCode(phone);

  /// Second sign-in step for an account with two-factor authentication (after [TwoFactorRequired]).
  Future<void> loginWithTwoFactor(String challenge, String code) async {
    error = null;
    status = ConnStatus.connecting;
    notifyListeners();
    try {
      await _begin(await _auth.loginWithTwoFactor(challenge, code));
    } catch (e, st) {
      error = Strings.current.errorText(e, st);
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
    } catch (e, st) {
      error = Strings.current.errorText(e, st);
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
    } catch (e, st) {
      debugPrint('Could not restore the session (${e.runtimeType}): $e\n$st');
      return false; // storage / network trouble: show the sign-in screen
    }
  }

  Future<void> logout() async {
    final access = _access;
    if (access != null && _socket.isConnected && _deviceToken != null) {
      // Stop pushes to this device before the token disappears.
      unawaited(_socket.request('devices:unregister', {'token': _deviceToken}).catchError((_) {}));
    }
    _deviceToken = null;
    endTopUpAttempt();
    await PushService.instance.stop();
    await _auth.clear();
    _socket.disconnect();
    _access = null;
    _refresh = null;
    user = null;
    status = ConnStatus.disconnected;
    hydrated = false;
    banners.clear();
    for (final l in [products, categories, orders, notifications, walletTransactions, payments, addresses]) {
      l.clear();
    }
    failedTopups.clear();
    wishlistIds.clear();
    for (final h in buildFeatureHooks()) {
      h.reset?.call();
    }
    _translations.clear();
    riderLocations.clear();
    walletBalance = 0;
    notifyListeners();
  }

  /// Writes the tokens to the device. Never throws: see [_begin].
  Future<void> _saveTokens(AuthResult r) async {
    try {
      await _auth.saveTokens(r);
    } catch (e, st) {
      debugPrint('Could not store the session on this device (${e.runtimeType}): $e\n$st');
    }
  }

  Future<void> _begin(AuthResult result) async {
    // Keeping the session across launches is a convenience: a phone that cannot store it (a platform fault) still
    // gets the account the server just opened. Failing here used to leave a created account behind a generic error.
    await _saveTokens(result);
    _access = result.accessToken;
    _refresh = result.refreshToken;
    user = result.user;
    walletBalance = result.user.walletBalance;
    status = ConnStatus.connecting;
    hydrated = false;
    notifyListeners();
    _connect();
  }

  Future<AuthResult>? _rotating;

  /// Trades the refresh token for new tokens and keeps BOTH, on the device and in memory. The server rotates refresh
  /// tokens: the one just used stops working seconds later, and sending it again after that signs the account out
  /// everywhere. So callers that need a refresh at the same moment (the reconnect, `reauth`, the session check) share
  /// this one request instead of each sending the same token.
  Future<AuthResult> _rotateTokens() async {
    final pending = _rotating;
    if (pending != null) return pending;
    final run = () async {
      final refresh = _refresh ?? await _auth.getRefresh();
      if (refresh == null) throw ApiException.local('err_signed_out', status: 401);
      final r = await _auth.refresh(refresh);
      await _saveTokens(r);
      _access = r.accessToken;
      _refresh = r.refreshToken;
      return r;
    }();
    _rotating = run;
    try {
      return await run;
    } finally {
      if (identical(_rotating, run)) _rotating = null;
    }
  }

  /// A currently valid access token, refreshing it when it is about to expire (or always, with [force]).
  Future<String> freshAccessToken({bool force = false}) async {
    final token = _access;
    if (!force && token != null && !_expiresWithin(token, const Duration(seconds: 45))) return token;
    // No session stored on this device: say so, without ending anything (only a refusal from the server ends a session).
    if (_refresh == null && await _auth.getRefresh() == null) throw ApiException.local('err_signed_out', status: 401);
    try {
      return (await _rotateTokens()).accessToken;
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
    if (_refresh == null && await _auth.getRefresh() == null) return;
    try {
      await _rotateTokens();
    } on ApiException catch (e) {
      if (e.status == 401 || e.status == 403) await _endSession();
    } catch (_) {/* offline: keep retrying */}
  }

  /// The server asks for a fresh access token shortly before the socket's one runs out (`reauth`): rotate the tokens and
  /// hand the new access token to the SAME connection (`auth:reauth`), so nothing is re-downloaded. A refused refresh
  /// ends the session (see [freshAccessToken]); any other failure is left to the server, which closes the socket at its
  /// deadline, and the reconnect below then refreshes and connects again.
  Future<void> _renewSocket() async {
    if (user == null) return;
    try {
      final token = await freshAccessToken(force: true);
      await call('auth:reauth', {'token': token});
    } catch (e) {
      debugPrint('Socket re-authentication failed (${e.runtimeType}): $e');
    }
  }

  /// Tests: what the app does on the server's `reauth`.
  @visibleForTesting
  Future<void> debugReauth() => _renewSocket();

  /// Tests: the check that follows a refused connection (is the session still valid?).
  @visibleForTesting
  Future<void> debugVerifySession() => _verifySession(force: true);

  Future<void> _endSession({String? messageKey}) async {
    if (user == null) return;
    await logout();
    onSessionEnded?.call(messageKey);
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
      unawaited(_hydrate().then((_) => onHydrated?.call()));
      // Push: asks for the permission and registers this device (no-op without Firebase).
      unawaited(PushService.instance.start(
        register: (token, platform) => registerDevice(token, platform: platform),
        onMessage: (_) => unawaited(refreshNotifications()),
      ));
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
    // The access token behind this socket expires soon: renew it on the same connection.
    socket.on('reauth', (_) => unawaited(_renewSocket()));

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
    _socket.on('support:updated', (d) {
      lastSupportTicket = d is Map ? _map(d) : null;
      supportRevision.value++;
    });
    _socket.on('review:updated', (_) => reviewRevision.value++);
    _socket.on('payment:created', _upsertPayment);
    _socket.on('payment:updated', _upsertPayment);
    _socket.on('product:created', (d) => _upsertProduct(d));
    _socket.on('product:updated', (d) => _upsertProduct(d));
    // A rename or a finished translation re-sends the whole category list.
    _socket.on('categories:updated', (d) {
      if (d is! List) return;
      _replace(categories, d, CategoryDto.fromJson);
      notifyListeners();
    });
    _socket.on('cart:updated', (d) {
      serverCart.value = _map(d);
      notifyListeners();
    });
    _socket.on('wishlist:updated', (d) {
      wishlistIds
        ..clear()
        ..addAll((d as List).map((e) => e.toString()));
      notifyListeners();
    });
    _socket.on('addresses:updated', (_) => unawaited(_loadAddresses()));
    _socket.on('settings:updated', (d) {
      applySettings(_map(d));
      notifyListeners();
    });
    _socket.on('me:updated', (d) {
      user = BackendUser.fromJson(_map(d));
      notifyListeners();
    });
    // Feature modules (chat, support, after-sale…) bind their own pushes.
    for (final h in buildFeatureHooks()) {
      h.pushes.forEach(_socket.on);
    }
  }

  /// Tests: deliver a feature push (the socket is not connected in tests).
  @visibleForTesting
  void debugEmit(String event, dynamic data) {
    for (final h in buildFeatureHooks()) {
      h.pushes[event]?.call(data);
    }
  }

  /// Reads the public settings the app acts on: the answer of `settings:get` and the `settings:updated` push.
  /// A key the server did not send keeps its value.
  @visibleForTesting
  void applySettings(Map<String, dynamic> m) {
    fxRate = double.tryParse('${m['fxRate'] ?? fxRate ?? ''}');
    if (m.containsKey('requireVerifiedForCheckout')) requireVerifiedForCheckout = '${m['requireVerifiedForCheckout']}' == 'true';
    if (m.containsKey('requirePinnedAddress')) requirePinnedAddress = '${m['requirePinnedAddress']}' == 'true';
    if (m.containsKey('codEnabled')) codEnabled = '${m['codEnabled']}' == 'true';
    if (m.containsKey('supportPhone')) supportPhone = '${m['supportPhone'] ?? ''}'.trim();
    if (m.containsKey('supportEmail')) supportEmail = '${m['supportEmail'] ?? ''}'.trim();
    if (m.containsKey('supportWhatsapp')) supportWhatsapp = '${m['supportWhatsapp'] ?? ''}'.trim();
    if (m.containsKey('cardPayments')) cardPayments = '${m['cardPayments']}' == 'stripe' ? 'stripe' : 'off';
    if (m.containsKey('translation')) translationAvailable = '${m['translation']}' != 'off';
    if (m.containsKey('smsVerification')) smsAvailable = '${m['smsVerification']}' != 'off';
    if (m.containsKey('emailVerification')) emailAvailable = '${m['emailVerification']}' != 'off';
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
      _load('settings:get', (d) => applySettings(_map(d))),
      _load('me:prefs', (d) => prefs = {...prefs, ..._map(d)}),
      _load('cart:get', (d) => serverCart.value = _map(d)),
      _load('cms:list', (d) {
        banners
          ..clear()
          ..addAll((d as List)
              .map(_map)
              .where((b) => b['type'] == 'banner' && b['active'] != false)
              .map(BannerDto.fromJson));
      }),
    ]);
    await Future.wait([
      for (final h in buildFeatureHooks())
        if (h.hydrate != null)
          h.hydrate!(this).catchError((Object e) {
            if (kDebugMode) debugPrint('hydrate ${h.name} failed: $e');
          }),
    ]);
    // The saved "Prices shown in" choice is only known now (the first read at
    // sign-in happens before the preferences were downloaded).
    marketNotifier.value = prefs['market'] == 'FR' ? MarketProfileId.france : MarketProfileId.drc;
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

  /// Tests stand in for the server on [placeOrder] (event + body in, the ack's data out).
  @visibleForTesting
  Future<dynamic> Function(String event, [Map<String, dynamic>? body])? debugPlaceOrderRequest;

  /// How long `orders:create` may take. The server can wait up to 15 s (and a retry) on the payment provider inside
  /// that call, so the default 8 s made the app say "no response" while the order was still being placed (C-01).
  static const placeOrderTimeout = Duration(seconds: 45);

  /// The idempotency key of the checkout attempt in progress (C-01): made on the first "Place order" tap and sent
  /// unchanged on every retry until the server gives a definite answer, so a retry can never become a second order
  /// or a second charge. Kept here (not on the screen) so leaving checkout and coming back is still the same attempt.
  String? checkoutAttemptKey;

  /// The key of the current checkout attempt, made on first use (see [checkoutAttemptKey]).
  String checkoutKey() => checkoutAttemptKey ??= newCheckoutKey();

  /// The attempt got a definite answer (placed, or refused by the server): the next tap is a new attempt.
  void endCheckoutAttempt() => checkoutAttemptKey = null;

  /// A random (version 4) UUID.
  static String newCheckoutKey() {
    final rng = Random.secure();
    final b = List<int>.generate(16, (_) => rng.nextInt(256));
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    final h = b.map((x) => x.toRadixString(16).padLeft(2, '0')).join();
    return '${h.substring(0, 8)}-${h.substring(8, 12)}-${h.substring(12, 16)}-${h.substring(16, 20)}-${h.substring(20)}';
  }

  /// Whether a failed [placeOrder] leaves the result open (nothing definite from the server): the same attempt key
  /// must then be kept for the retry. A refusal the server sent is definite.
  static bool placeOrderOutcomeUnknown(Object e) =>
      e is ApiException &&
      (e.code == 'order_processing' || // the server: an earlier request with this key is still running
          const {'err_no_response', 'err_no_connection', 'err_order_processing', 'err_order_unknown', 'err_order_not_sent'}.contains(e.localKey));

  /// Place an order. Lines reference real listings by id; the SERVER prices
  /// them (the app only displays prices). For mobile-money methods the order is
  /// created `pending` and confirmed later by the network — watch [orders] /
  /// [payments] (pushed live) or call [awaitOrderSettled].
  ///
  /// [clientRequestId] is the checkout attempt's key ([checkoutKey]): the server returns the same order for the same
  /// key, never a second one. When the server does not answer in [placeOrderTimeout], the app asks it what became of
  /// that attempt (`orders:byRequest`) before saying anything: the order if it was placed, otherwise an
  /// [ApiException] that says plainly whether it failed, is still being processed, never arrived, or is unknown.
  Future<OrderDto> placeOrder({
    required List<Map<String, dynamic>> items,
    required String paymentMethod,
    String? paymentPhone,
    Map<String, dynamic>? address,
    String? promoCode,
    String? clientRequestId,
  }) async {
    final body = {
      'items': items,
      'paymentMethod': paymentMethod,
      if (promoCode != null && promoCode.isNotEmpty) 'promoCode': promoCode,
      if (paymentPhone != null && paymentPhone.isNotEmpty) 'paymentPhone': paymentPhone,
      if (address != null) 'shippingAddress': jsonEncode(address),
      if (clientRequestId != null) 'clientRequestId': clientRequestId,
    };
    dynamic res;
    try {
      final fake = debugPlaceOrderRequest;
      res = fake != null ? await fake('orders:create', body) : await _socket.requestWithin('orders:create', body, placeOrderTimeout);
    } on ApiException catch (e) {
      if (clientRequestId == null || e.localKey != 'err_no_response') rethrow;
      res = await _orderOfAttempt(clientRequestId);
    }
    final order = OrderDto.fromJson(_map(res));
    _upsertOrder(res);
    return order;
  }

  /// `orders:create` went unanswered: what became of the attempt? The order when it was placed, else a plain error.
  Future<dynamic> _orderOfAttempt(String clientRequestId) async {
    dynamic found;
    try {
      found = await (debugPlaceOrderRequest ?? _socket.request)('orders:byRequest', {'clientRequestId': clientRequestId});
    } catch (_) {
      throw ApiException.local('err_order_unknown');
    }
    final state = found is Map ? found['state'] : null;
    if (state == 'placed' && found['order'] is Map) return found['order'];
    if (state == 'failed') throw ApiException.local('err_order_failed');
    if (state == 'processing') throw ApiException.local('err_order_processing');
    if (state == 'none') throw ApiException.local('err_order_not_sent');
    throw ApiException.local('err_order_unknown');
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
      throw ApiException.local('err_settle_timeout');
    });
  }

  Future<void> cancelOrder(String orderId) async {
    _upsertOrder(await _socket.request('orders:cancel', {'orderId': orderId}));
  }

  /// The idempotency key of the top-up attempt in progress, and what that attempt is for (see [topUpKey]).
  String? _topUpAttemptKey;
  String? _topUpAttemptFor;

  /// The key of the top-up attempt in progress, if any (tests read it; nothing else should).
  @visibleForTesting
  String? get topUpAttemptKey => _topUpAttemptKey;

  /// The idempotency key for a top-up of [amountUsd] through [method] to [phone]: made on the first tap and returned
  /// unchanged for every retry of that same intent (a double tap, a retry after "failed to reach the network"), so the
  /// server answers with the first top-up instead of opening a second approval prompt. Asking for a different amount,
  /// network or phone is a new intent and gets a new key. Kept here (not on the sheet) so closing and reopening the
  /// sheet with the same values is still the same attempt, like [checkoutKey].
  String topUpKey(double amountUsd, {required String method, required String phone}) {
    final intent = '${user?.id}|$method|${amountUsd.toStringAsFixed(2)}|${phone.trim()}';
    if (_topUpAttemptFor != intent || _topUpAttemptKey == null) {
      _topUpAttemptFor = intent;
      _topUpAttemptKey = newCheckoutKey();
    }
    return _topUpAttemptKey!;
  }

  /// The attempt reached a final outcome (started, or refused): the next tap is a new top-up with a new key.
  void endTopUpAttempt() {
    _topUpAttemptKey = null;
    _topUpAttemptFor = null;
  }

  /// Whether a failed [topUpWallet] leaves the result open (the request may or may not have reached the server): the
  /// same key must then be kept for the retry. A refusal the server sent is final, and the server replays a failed
  /// attempt's reason for its key, so the next try needs a new key.
  static bool topUpOutcomeUnknown(Object e) =>
      e is! ApiException || const {'err_no_response', 'err_no_connection'}.contains(e.localKey);

  /// Start a wallet top-up through mobile money. The wallet is credited only
  /// when the network confirms; [wallet:updated] then pushes the new balance.
  ///
  /// Sends the attempt's [topUpKey] as `clientRequestId`, so a repeat of this same top-up returns the first one.
  Future<PaymentDto> topUpWallet(double amountUsd, {required String method, required String phone}) async {
    final key = topUpKey(amountUsd, method: method, phone: phone);
    final dynamic res;
    try {
      res = await call('wallet:topup', {
        'amountUsd': amountUsd,
        'method': method,
        'phone': phone,
        'clientRequestId': key,
      });
    } catch (e) {
      if (!topUpOutcomeUnknown(e)) endTopUpAttempt();
      rethrow;
    }
    endTopUpAttempt();
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

  /// Asks the server for the card sheet of the caller's own pending card payment (`payments:card-sheet`), by order
  /// id or by payment reference. The answer carries the PaymentIntent client secret and the publishable key: they go
  /// straight to the sheet and are never logged, stored or kept on the store.
  Future<CardSheetDto> cardSheet({String? orderId, String? reference}) async {
    assert(orderId != null || reference != null, 'cardSheet needs an order id or a payment reference');
    final res = await call('payments:card-sheet', {
      if (orderId != null) 'orderId': orderId,
      if (reference != null) 'reference': reference,
    });
    return CardSheetDto.fromJson(_map(res));
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
  /// [items] (the lines being bought) lets the server preview a STORE coupon, which only discounts that store's lines.
  Future<Map<String, dynamic>> validatePromo(String code, double subtotalUsd, {List<Map<String, dynamic>>? items}) async => _map(await call(
      'promos:validate', {'code': code, 'subtotalUsd': subtotalUsd, if (items != null && items.isNotEmpty) 'items': items}));

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

  /// Tests: answers `addresses:create` instead of the socket (the list is then updated locally).
  @visibleForTesting
  Future<dynamic> Function(String event, [Map<String, dynamic>? body])? debugAddressRequest;

  Future<AddressDto> addAddress(Map<String, dynamic> body) async {
    final hook = debugAddressRequest;
    if (hook != null) {
      final a = AddressDto.fromJson(_map(await hook('addresses:create', body)));
      addresses.add(a);
      notifyListeners();
      return a;
    }
    final res = await _socket.request('addresses:create', body);
    await _loadAddresses();
    return AddressDto.fromJson(_map(res));
  }

  /// Read the address book again (a warehouse gained or lost an area: each address's "served" may have changed).
  Future<void> refreshAddresses() => _loadAddresses();

  /// Edit an address (or make it the default with `{'isDefault': true}`); the server clears the other defaults.
  Future<AddressDto> updateAddress(String id, Map<String, dynamic> patch) async {
    final hook = debugAddressRequest;
    if (hook != null) {
      final a = AddressDto.fromJson(_map(await hook('addresses:update', {'id': id, 'patch': patch})));
      final i = addresses.indexWhere((x) => x.id == id);
      i == -1 ? addresses.add(a) : addresses[i] = a;
      notifyListeners();
      return a;
    }
    final res = await _socket.request('addresses:update', {'id': id, 'patch': patch});
    await _loadAddresses();
    return AddressDto.fromJson(_map(res));
  }

  Future<void> removeAddress(String id) async {
    await _socket.request('addresses:remove', {'id': id});
    await _loadAddresses();
  }

  Future<void> updateProfile({String? name, String? phone, String? locale}) async {
    final res = await call('me:update', {
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
    await _saveTokens(r);
    _access = r.accessToken;
    _refresh = r.refreshToken;
  }

  /// What stops the account from being deleted right now (empty = nothing). Asked before the customer confirms; the
  /// server enforces the same list again on `me:delete`.
  Future<List<DeletionBlocker>> deletionBlockers() async {
    final res = await call('me:deleteCheck');
    return DeletionBlocker.listFrom(res is Map ? res['blockers'] : null);
  }

  /// Permanently deletes the account (server also closes this socket).
  /// A refusal ([ApiException] with `code == 'account_blocked'`, see [DeletionBlocker.fromRefusal]) leaves the session
  /// untouched: the server erased nothing.
  Future<void> deleteAccount(String password) async {
    await call('me:delete', {'password': password});
    // Same path as a suspension: clears the session and returns the app to sign-in.
    await _endSession(messageKey: 'err_account_deleted');
  }

  Future<void> markRead(String id) async {
    await _socket.request('notifications:markRead', {'id': id});
    final idx = notifications.indexWhere((n) => n.id == id);
    if (idx != -1) {
      notifications[idx] = notifications[idx].asRead();
      notifyListeners();
    }
  }

  /// Re-read the notification list (a push arrived while the app is open).
  Future<void> refreshNotifications() async {
    await _load('notifications:list', (d) => _replace(notifications, d, NotificationDto.fromJson));
    notifyListeners();
  }

  Future<void> markAllRead() async {
    await _socket.request('notifications:markAllRead');
    for (var i = 0; i < notifications.length; i++) {
      notifications[i] = notifications[i].asRead();
    }
    notifyListeners();
  }

  /// Tests answer [call] (the store front, tickets…) instead of the socket.
  @visibleForTesting
  Future<dynamic> Function(String event, [Map<String, dynamic>? body])? debugCallRequest;

  /// Raw request→ack call for features that don't need cached state.
  Future<dynamic> call(String event, [Map<String, dynamic>? body]) => (debugCallRequest ?? _socket.request)(event, body);

  Future<List<ReviewDto>> reviewsFor(String productId) async =>
      ((await call('reviews:list', {'productId': productId})) as List)
          .map((e) => ReviewDto.fromJson(_map(e)))
          .toList();

  /// Sends a review (`reviews:create`) with up to 4 photos already uploaded through `POST /api/v1/uploads`.
  Future<ReviewDto> addReview(String productId, int rating, String text, {List<String> photos = const []}) async =>
      ReviewDto.fromJson(_map(await call('reviews:create', {'productId': productId, 'rating': rating, 'text': text, if (photos.isNotEmpty) 'photos': photos})));

  Future<List<QuestionDto>> questionsFor(String productId) async =>
      ((await call('questions:list', {'productId': productId})) as List)
          .map((e) => QuestionDto.fromJson(_map(e)))
          .toList();

  Future<void> askQuestion(String productId, String question) =>
      _socket.request('questions:ask', {'productId': productId, 'question': question});

  /// Tests stand in for the server on [translateText] (event + body in, the ack's data out).
  @visibleForTesting
  Future<dynamic> Function(String event, [Map<String, dynamic>? body])? debugTranslateRequest;

  final Map<String, TextTranslation> _translations = {};

  /// A review, a seller reply, a question or an answer in language [target] (`translate:text`). The server takes a
  /// stored id only (never free text) and caches what it translates; the phone keeps the answer for the session.
  /// [kind] is `review` | `review_reply` | `question` | `answer`; [text] only keys the cache (an edited text asks again).
  Future<TextTranslation> translateText(String kind, String id, String target, {String text = ''}) async {
    final key = '$kind|$id|$target|${text.hashCode}';
    final known = _translations[key];
    if (known != null) return known;
    final res = await (debugTranslateRequest ?? _socket.request)('translate:text', {'kind': kind, 'id': id, 'target': target});
    final t = TextTranslation.fromJson(_map(res));
    _translations[key] = t;
    return t;
  }

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
  /// Tests stand in for the server on the two "send a code / link" calls.
  @visibleForTesting
  Future<SendResult> Function()? debugSendEmail, debugSendPhone;

  Future<SendResult> sendEmailVerification() async => (debugSendEmail ?? () async => _auth.sendEmailVerification(await freshAccessToken()))();
  Future<SendResult> sendPhoneOtp() async => (debugSendPhone ?? () async => _auth.sendPhoneOtp(await freshAccessToken()))();

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

  Future<SendResult> forgotPassword(String email) => _auth.forgotPassword(email);
  Future<void> resetPassword(String token, String password) => _auth.resetPassword(token, password);

  // ---- helpers ----
  /// Applies one copy of an order (a push, or the reply to a create / cancel). The same order can reach
  /// the phone out of order — the sandbox payment settles and pushes `order:updated` (confirmed) BEFORE the
  /// `orders:create` reply (still pending) arrives — so a copy older than the stored one is ignored.
  /// Without an `updatedAt` on either side the newest arrival wins, as it always did.
  void _upsertOrder(dynamic data) {
    final o = OrderDto.fromJson(_map(data));
    final idx = orders.indexWhere((x) => x.id == o.id);
    if (idx == -1) {
      orders.insert(0, o);
    } else {
      final stored = orders[idx].updatedAt;
      final incoming = o.updatedAt;
      if (stored != null && incoming != null && incoming.isBefore(stored)) return;
      orders[idx] = o;
    }
    notifyListeners();
  }

  /// Tests: deliver an `order:updated` / `order:created` push (the socket is not connected in tests).
  @visibleForTesting
  void debugOrderPush(dynamic data) => _upsertOrder(data);

  void _upsertPayment(dynamic data) {
    final p = PaymentDto.fromJson(_map(data));
    final idx = payments.indexWhere((x) => x.id == p.id);
    if (p.purpose == 'topup' && p.status == 'failed' && !failedTopups.any((x) => x.id == p.id) && (idx == -1 || payments[idx].status != 'failed')) {
      failedTopups.insert(0, p);
    }
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
