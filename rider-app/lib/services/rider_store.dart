import 'dart:async';
import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'auth_service.dart';
import 'location_reporter.dart';
import 'models.dart';
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
  final location = LocationReporter();

  ConnStatus status = ConnStatus.disconnected;
  BackendUser? user;
  bool loaded = false;

  /// Deliveries assigned to this rider (any state) and the open pool.
  final List<DeliveryTaskDto> myTasks = [];
  final List<DeliveryTaskDto> pool = [];
  final List<NotificationDto> notifications = [];
  EarningsDto earnings = const EarningsDto();

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
        throw ApiException('This app is for Somba&Teka riders. Use the customer app instead.', 403);
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
    await location.stop();
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
    if (refresh == null) throw ApiException('Signed out.', 401);
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
    _socket.on('delivery:updated', (_) => unawaited(refresh()));
    _socket.on('order:created', (_) => unawaited(refresh())); // a new paid order = a new pool item
    _socket.on('order:updated', (_) => unawaited(refresh()));
    _socket.on('notification:new', (d) {
      notifications.insert(0, NotificationDto.fromJson(_map(d)));
      notifyListeners();
    });
  }

  /// Re-read the rider's queue (own + open pool), earnings and notifications.
  Future<void> refresh() async {
    try {
      final rows = ((await _socket.request('rider:tasks')) as List).map((e) => DeliveryTaskDto.fromJson(_map(e))).toList();
      myTasks
        ..clear()
        ..addAll(rows.where((t) => !t.isOpen));
      pool
        ..clear()
        ..addAll(rows.where((t) => t.isOpen));
      earnings = EarningsDto.fromJson(_map(await _socket.request('rider:earnings')));
      notifications
        ..clear()
        ..addAll(((await _socket.request('notifications:list')) as List).map((e) => NotificationDto.fromJson(_map(e))));
      loaded = true;
      status = ConnStatus.connected;
      notifyListeners();
      _syncLocation();
    } catch (e) {
      if (kDebugMode) debugPrint('refresh failed: $e');
    }
  }

  Future<void> accept(String taskId) async {
    await _socket.request('delivery:accept', {'taskId': taskId});
    await refresh();
  }

  Future<void> advance(String taskId, String status) async {
    await _socket.request('delivery:updateStatus', {'taskId': taskId, 'status': status});
    await refresh();
  }

  Future<void> sendLocation(String taskId, double lat, double lng) async {
    await _socket.request('delivery:location', {'taskId': taskId, 'lat': lat, 'lng': lng});
  }

  /// GPS follows the delivery that is on the road: start when the rider picks the
  /// parcel up, stop when the delivery ends.
  LocationAccess? lastLocationAccess;
  void _syncLocation() {
    final onRoad = myTasks.where((t) => t.status == 'picked_up' || t.status == 'in_transit').toList();
    if (onRoad.isEmpty) {
      if (location.running) unawaited(location.stop());
      return;
    }
    final t = onRoad.first;
    if (location.taskId == t.id && location.running) return;
    unawaited(location.start(t.id, (lat, lng) => sendLocation(t.id, lat, lng)).then((a) {
      lastLocationAccess = a;
      notifyListeners();
    }));
  }

  Future<void> markRead(String id) async {
    await _socket.request('notifications:markRead', {'id': id});
    final i = notifications.indexWhere((n) => n.id == id);
    if (i != -1) {
      final n = notifications[i];
      notifications[i] = NotificationDto(id: n.id, title: n.title, body: n.body, type: n.type, read: true);
      notifyListeners();
    }
  }

  Future<String?> forgotPassword(String email) => _auth.forgotPassword(email);
  Future<void> resetPassword(String token, String password) => _auth.resetPassword(token, password);

  Map<String, dynamic> _map(dynamic d) => (d as Map).map((k, v) => MapEntry(k.toString(), v));
}
