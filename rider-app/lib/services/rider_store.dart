import 'package:flutter/foundation.dart';
import 'auth_service.dart';
import 'models.dart';
import 'socket_service.dart';

enum ConnStatus { disconnected, connecting, connected, error }

/// Realtime state for the Rider app. Single Socket.IO connection to the shared
/// Somba&Teka backend: the rider accepts tasks, advances delivery status, and
/// streams GPS — all of which push live to the customer app and the web
/// dashboards. A [ChangeNotifier] singleton (no extra state library).
class RiderStore extends ChangeNotifier {
  RiderStore._();
  static final RiderStore instance = RiderStore._();

  final _auth = AuthService();
  final _socket = SocketService();

  ConnStatus status = ConnStatus.disconnected;
  BackendUser? user;
  String? error;

  final List<DeliveryTaskDto> myTasks = [];
  final List<DeliveryTaskDto> unassigned = [];
  final List<NotificationDto> notifications = [];

  bool get isConnected => status == ConnStatus.connected;
  int get unreadCount => notifications.where((n) => !n.read).length;

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
    myTasks.clear();
    unassigned.clear();
    notifications.clear();
    notifyListeners();
  }

  Future<void> _connect(AuthResult result) async {
    user = result.user;
    status = ConnStatus.connecting;
    notifyListeners();

    final socket = _socket.connect(result.accessToken);
    socket.on('connect', (_) {
      status = ConnStatus.connected;
      notifyListeners();
    });
    socket.on('disconnect', (_) {
      status = ConnStatus.connecting;
      notifyListeners();
    });
    socket.on('unauthorized', (_) => logout());

    // Server pushes.
    _socket.on('delivery:updated', (_) => refresh());
    _socket.on('order:created', (_) => refresh()); // new order → new pool item
    _socket.on('notification:new', (d) {
      notifications.insert(0, NotificationDto.fromJson(_map(d)));
      notifyListeners();
    });

    await refresh();
  }

  /// Reload the rider's tasks + the unassigned pool + notifications.
  Future<void> refresh() async {
    try {
      final mine = await _socket.request('delivery:list');
      myTasks
        ..clear()
        ..addAll((mine as List).map((e) => DeliveryTaskDto.fromJson(_map(e))));
      final pool = await _socket.request('delivery:unassigned');
      unassigned
        ..clear()
        ..addAll((pool as List).map((e) => DeliveryTaskDto.fromJson(_map(e))));
      final notif = await _socket.request('notifications:list');
      notifications
        ..clear()
        ..addAll((notif as List).map((e) => NotificationDto.fromJson(_map(e))));
      status = ConnStatus.connected;
      notifyListeners();
    } catch (_) {
      // best-effort
    }
  }

  Future<void> accept(String taskId) async {
    await _socket.request('delivery:accept', {'taskId': taskId});
    await refresh();
  }

  Future<void> advance(String taskId, String status) async {
    await _socket.request('delivery:updateStatus', {
      'taskId': taskId,
      'status': status,
    });
    await refresh();
  }

  Future<void> sendLocation(String taskId, double lat, double lng) async {
    await _socket.request('delivery:location', {
      'taskId': taskId,
      'lat': lat,
      'lng': lng,
    });
  }

  Map<String, dynamic> _map(dynamic d) =>
      (d as Map).map((k, v) => MapEntry(k.toString(), v));
}
