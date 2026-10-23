import 'dart:async';
import 'dart:convert';
import 'package:flutter/foundation.dart';
import '../l10n/strings.dart';
import 'auth_service.dart';
import 'location_reporter.dart';
import 'models.dart';
import 'push_service.dart';
import 'rider_focus.dart';
import 'socket_service.dart';

enum ConnStatus { disconnected, connecting, connected, error }

/// Realtime state of the rider app. One authenticated Socket.IO connection:
/// the rider claims deliveries, advances their status and streams GPS — all of
/// which reach the customer app and the dashboards live. Nothing is polled.
class RiderStore extends ChangeNotifier {
  RiderStore._();
  static final RiderStore instance = RiderStore._();

  final _auth = AuthService();
  final _socket = SocketService();
  /// Reports the GPS position while a delivery is `in_transit` (tests swap in a fake).
  LocationReporter location = LocationReporter();

  ConnStatus status = ConnStatus.disconnected;
  BackendUser? user;
  bool loaded = false;

  /// Deliveries assigned to this rider (any state) and the open pool.
  final List<DeliveryTaskDto> myTasks = [];
  final List<DeliveryTaskDto> pool = [];
  final List<NotificationDto> notifications = [];
  EarningsDto earnings = const EarningsDto();

  /// Public setting: when true the customer's 4-digit code is needed to deliver.
  bool requireDeliveryCode = false;

  /// Home warehouse and zones (null until loaded, or for an older server).
  RiderAssignment? assignment;

  /// A tapped notification asks the app to show a tab and task; the shell and Deliveries follow it, then clear it.
  final ValueNotifier<RiderFocus?> focus = ValueNotifier(null);

  VoidCallback? onSessionEnded;
  String? _access;
  String? _refresh;

  bool get isConnected => status == ConnStatus.connected;
  bool get isSignedIn => user != null;
  int get unreadCount => notifications.where((n) => !n.read).length;
  List<DeliveryTaskDto> get active => myTasks.where((t) => t.isActive).toList();
  List<DeliveryTaskDto> get finished => myTasks.where((t) => t.isFinished).toList();

  // ---- session ----
  Future<void> login(String email, String password) async {
    status = ConnStatus.connecting;
    notifyListeners();
    try {
      final r = await _auth.login(email, password);
      if (r.user.role != 'rider') {
        // A customer/admin account must not open the rider app.
        throw ApiException.local('err_not_rider', status: 403);
      }
      await _begin(r);
    } catch (e) {
      status = ConnStatus.error;
      notifyListeners();
      rethrow;
    }
  }

  Future<bool> tryRestore() async {
    try {
      final stored = await _auth.getRefresh();
      if (stored == null) return false;
      final r = await _auth.refresh(stored);
      if (r.user.role != 'rider') {
        await _auth.clear();
        return false;
      }
      await _begin(r);
      return true;
    } on ApiException catch (e) {
      if (e.status == 401 || e.status == 403) await _auth.clear();
      return false;
    } catch (_) {
      return false;
    }
  }

  Future<void> logout() async {
    _poolTimer?.cancel();
    _poolTimer = null;
    _pushTimer?.cancel();
    _pushTimer = null;
    await location.stop();
    // Stop pushes to this device before the token disappears.
    if (_socket.isConnected && _deviceToken != null) {
      unawaited(_socket.request('devices:unregister', {'token': _deviceToken}).catchError((_) {}));
    }
    _deviceToken = null;
    await PushService.instance.stop();
    await _auth.clear();
    _socket.disconnect();
    _access = null;
    _refresh = null;
    user = null;
    status = ConnStatus.disconnected;
    loaded = false;
    myTasks.clear();
    pool.clear();
    notifications.clear();
    earnings = const EarningsDto();
    requireDeliveryCode = false;
    assignment = null;
    focus.value = null;
    notifyListeners();
  }

  Future<void> _begin(AuthResult r) async {
    await _auth.saveTokens(r);
    _access = r.accessToken;
    _refresh = r.refreshToken;
    user = r.user;
    status = ConnStatus.connecting;
    loaded = false;
    notifyListeners();
    _connect();
  }

  Future<String> freshAccessToken() async {
    final token = _access;
    if (token != null && !_expiresWithin(token, const Duration(seconds: 45))) return token;
    final refresh = _refresh ?? await _auth.getRefresh();
    if (refresh == null) throw ApiException.local('err_signed_out', status: 401);
    try {
      final r = await _auth.refresh(refresh);
      await _auth.saveTokens(r);
      _access = r.accessToken;
      _refresh = r.refreshToken;
      return r.accessToken;
    } on ApiException catch (e) {
      if (e.status == 401 || e.status == 403) unawaited(_endSession());
      rethrow;
    }
  }

  static bool _expiresWithin(String jwt, Duration d) {
    try {
      final payload = jwt.split('.')[1];
      final json = jsonDecode(utf8.decode(base64Url.decode(base64Url.normalize(payload)))) as Map;
      return DateTime.now().millisecondsSinceEpoch + d.inMilliseconds >= (json['exp'] as num).toInt() * 1000;
    } catch (_) {
      return true;
    }
  }

  Timer? _poolTimer;
  DateTime _lastVerify = DateTime.fromMillisecondsSinceEpoch(0);

  /// After a refused connection: is the account still allowed? (revoked, suspended, role changed)
  Future<void> _verifySession({bool force = false}) async {
    final now = DateTime.now();
    if ((!force && now.difference(_lastVerify) < const Duration(seconds: 3)) || user == null) return;
    _lastVerify = now;
    final refresh = _refresh ?? await _auth.getRefresh();
    if (refresh == null) return;
    try {
      final r = await _auth.refresh(refresh);
      if (r.user.role != 'rider') return unawaited(_endSession());
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

  void _connect() {
    final socket = _socket.connect(freshAccessToken);
    // `ready` = the server verified us and joined our rooms; only then can we ask for data.
    socket.on('ready', (_) {
      status = ConnStatus.connected;
      notifyListeners();
      unawaited(refresh());
      // Push: asks for the permission and registers this device (no-op without Firebase).
      unawaited(PushService.instance.start(
        register: registerDevice,
        onMessage: (_) => unawaited(refreshNotifications()),
      ));
      // New deliveries arrive as `delivery:updated` pushes to the rider's warehouse
      // room; this slow re-read is only a safety net for a push missed while the
      // connection was flaky.
      _poolTimer?.cancel();
      _poolTimer = Timer.periodic(const Duration(seconds: 120), (_) {
        if (user != null && isConnected) unawaited(refresh());
      });
    });
    socket.on('disconnect', (reason) {
      if (user == null) return;
      status = ConnStatus.connecting;
      notifyListeners();
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
      unawaited(_verifySession());
    });

    // Server pushes (a change event triggers one targeted re-read — no timers).
    _socket.on('delivery:updated', (_) => _pushRefresh());
    _socket.on('order:created', (_) => _pushRefresh()); // a new paid order = a new pool item
    _socket.on('order:updated', (_) => _pushRefresh());
    _socket.on('notification:new', (d) {
      notifications.insert(0, NotificationDto.fromJson(_map(d)));
      notifyListeners();
    });
  }

  Timer? _pushTimer;

  /// Pushes often arrive in bursts: re-read once, shortly after the last one.
  void _pushRefresh() {
    _pushTimer?.cancel();
    _pushTimer = Timer(const Duration(milliseconds: 300), () => unawaited(refresh(light: true)));
  }

  /// Re-read the rider's queue (own + open pool), earnings and notifications.
  Future<void> refresh({bool light = false}) async {
    // Coalesce bursts of pushes: one read in flight, one more queued at most.
    if (_refreshing) {
      _refreshAgain = true;
      if (!light) _refreshFull = true;
      return _refreshDone?.future;
    }
    _refreshFull = !light;
    _refreshing = true;
    final done = _refreshDone = Completer<void>();
    try {
      do {
        _refreshAgain = false;
        final full = _refreshFull;
        _refreshFull = false;
        await _refreshOnce(full: full);
        // Space repeated reads out: the server limits requests per second.
        if (_refreshAgain) await Future.delayed(const Duration(milliseconds: 600));
      } while (_refreshAgain);
    } finally {
      _refreshing = false;
      done.complete();
    }
  }

  bool _refreshing = false;
  bool _refreshAgain = false;
  bool _refreshFull = false;
  Completer<void>? _refreshDone;

  /// [full] also re-reads notifications and the public settings; a light read
  /// (after an action or a push) only needs the queue and the earnings.
  Future<void> _refreshOnce({required bool full}) async {
    try {
      final rows = ((await _socket.request('rider:tasks')) as List).map((e) => DeliveryTaskDto.fromJson(_map(e))).toList();
      myTasks
        ..clear()
        ..addAll(rows.where((t) => !t.isOpen));
      pool
        ..clear()
        ..addAll(rows.where((t) => t.isOpen));
      earnings = EarningsDto.fromJson(_map(await _socket.request('rider:earnings')));
      if (full) {
        notifications
          ..clear()
          ..addAll(((await _socket.request('notifications:list')) as List).map((e) => NotificationDto.fromJson(_map(e))));
        await _readSettings();
        await _readAssignment();
      }
      loaded = true;
      status = ConnStatus.connected;
      notifyListeners();
      _syncLocation();
    } catch (e) {
      if (kDebugMode) debugPrint('refresh failed: $e');
    }
  }

  Future<void> _readAssignment() async {
    try {
      assignment = RiderAssignment.fromJson(_map(await _socket.request('rider:assignment')));
    } catch (_) {/* older server: no warehouse info */}
  }

  /// Open what a notification is about (a push tap or the in-app list) and mark it read.
  void openNotice({required String type, String? entityId, String? view, String? notificationId}) {
    if (notificationId != null && notifications.any((n) => n.id == notificationId && !n.read)) {
      markRead(notificationId).catchError((_) {});
    }
    focus.value = riderFocusFor(type, entityId: entityId, view: view, isMine: (id) => myTasks.any((t) => t.id == id));
  }

  Future<void> _readSettings() async {
    try {
      final m = _map(await _socket.request('settings:get'));
      requireDeliveryCode = '${m['requireDeliveryCode']}' == 'true';
    } catch (_) {/* keep the last known value */}
  }

  Future<void> accept(String taskId) async {
    await _socket.request('delivery:accept', {'taskId': taskId});
    await refresh(light: true);
  }

  /// [reason] is required for `failed`; [code] is the customer's 4-digit code for `delivered`.
  Future<void> advance(String taskId, String status, {String? reason, String? code}) async {
    await _socket.request('delivery:updateStatus', {
      'taskId': taskId,
      'status': status,
      if (reason != null && reason.trim().isNotEmpty) 'reason': reason.trim(),
      if (code != null && code.trim().isNotEmpty) 'code': code.trim(),
    });
    await refresh(light: true);
  }

  Future<void> sendLocation(String taskId, double lat, double lng) async {
    await _socket.request('delivery:location', {'taskId': taskId, 'lat': lat, 'lng': lng});
  }

  /// GPS (also in the background: Android foreground service / iOS background
  /// location) follows the delivery that is `in_transit` and nothing else: it
  /// starts when the rider sets off, and stops when the delivery is delivered or
  /// failed (it leaves `in_transit`), or on sign-out.
  LocationAccess? lastLocationAccess;

  @visibleForTesting
  void syncLocationNow() => _syncLocation();

  void _syncLocation() {
    final onRoad = myTasks.where((t) => t.status == 'in_transit').toList();
    if (onRoad.isEmpty) {
      if (location.running) unawaited(location.stop());
      return;
    }
    final t = onRoad.first;
    if (location.taskId == t.id && location.running) return;
    final s = Strings.current;
    final notice = TrackingNotice(title: s.bgTitle, text: s.bgText, channel: s.bgChannel);
    unawaited(location.start(t.id, (lat, lng) => sendLocation(t.id, lat, lng), notice: notice).then((a) {
      lastLocationAccess = a;
      notifyListeners();
    }));
  }

  // ---- push notifications (FCM) ----
  String? _deviceToken;

  /// Register this device's FCM token so the server can push to it (also on every
  /// token rotation). Firebase is optional: without it the live socket still works.
  Future<void> registerDevice(String token, String platform) async {
    _deviceToken = token;
    if (!_socket.isConnected) return;
    await _socket.request('devices:register', {'token': token, 'platform': platform, 'app': 'rider'});
  }

  /// Re-read the notification list (a push arrived while the app is open).
  Future<void> refreshNotifications() async {
    try {
      final rows = ((await _socket.request('notifications:list')) as List).map((e) => NotificationDto.fromJson(_map(e))).toList();
      notifications
        ..clear()
        ..addAll(rows);
      notifyListeners();
    } catch (_) {/* the socket's own `notification:new` still delivers it */}
    unawaited(refresh(light: true));
  }

  Future<void> markRead(String id) async {
    await _socket.request('notifications:markRead', {'id': id});
    final i = notifications.indexWhere((n) => n.id == id);
    if (i != -1) {
      notifications[i] = notifications[i].asRead();
      notifyListeners();
    }
  }

  Future<String?> forgotPassword(String email) => _auth.forgotPassword(email);
  Future<void> resetPassword(String token, String password) => _auth.resetPassword(token, password);

  Map<String, dynamic> _map(dynamic d) => (d as Map).map((k, v) => MapEntry(k.toString(), v));
}
