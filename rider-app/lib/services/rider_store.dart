import 'dart:async';
import 'dart:convert';
import 'package:flutter/foundation.dart';
import '../l10n/strings.dart';
import 'auth_service.dart';
import 'compliance_store.dart';
import 'location_reporter.dart';
import 'models.dart';
import 'notification_sound.dart';
import 'parcels.dart';
import 'push_service.dart';
import 'rider_focus.dart';
import 'socket_service.dart';
import 'shift_store.dart';
import 'support_store.dart';

enum ConnStatus { disconnected, connecting, connected, error }

/// Realtime state of the rider app. One authenticated Socket.IO connection:
/// the rider claims deliveries, advances their status and streams GPS — all of
/// which reach the customer app and the dashboards live. Nothing is polled.
/// A leg of a stop whose status change the server refused (the others went through).
class LegFailure {
  const LegFailure(this.orderReference, this.error);
  final String orderReference;
  final Object error;
}

class RiderStore extends ChangeNotifier {
  RiderStore._() {
    // Any call the server refuses with `password_change_required` (socket or REST) holds the app at the change screen.
    onPasswordChangeRequired = _holdAtPasswordChange;
  }
  static final RiderStore instance = RiderStore._();

  AuthService _auth = AuthService();
  final _socket = SocketService();
  /// Reports the GPS position while a delivery is `in_transit` (tests swap in a fake).
  LocationReporter location = LocationReporter();

  ConnStatus status = ConnStatus.disconnected;
  BackendUser? user;
  bool loaded = false;

  /// The legs the warehouse assigned to this rider (any state). Riders have no open pool and cannot accept: the
  /// warehouse staff assign every task.
  final List<DeliveryTaskDto> myTasks = [];
  final List<NotificationDto> notifications = [];
  WorkStatsDto stats = const WorkStatsDto();

  /// Public setting: when true the customer's 4-digit code is needed to deliver.
  bool requireDeliveryCode = false;


  /// Home warehouse (null until loaded, or for an older server).
  RiderAssignment? assignment;

  /// A tapped notification asks the app to show a tab and task; the shell and Deliveries follow it, then clear it.
  final ValueNotifier<RiderFocus?> focus = ValueNotifier(null);

  /// Tests: the sign-in calls (refresh, token storage) answered by a fake.
  @visibleForTesting
  set debugAuth(AuthService auth) => _auth = auth;

  /// Tests: the check that follows a refused connection (is the account still allowed?).
  @visibleForTesting
  Future<void> debugVerifySession() => _verifySession(force: true);

  /// The session is over (revoked, suspended, role changed): the app is back at the sign-in screen when this returns.
  VoidCallback? onSessionEnded;
  String? _access;
  String? _refresh;

  bool get isConnected => status == ConnStatus.connected;
  bool get isSignedIn => user != null;

  /// The account still has the temporary password an administrator made: only the change-password screen is shown, because
  /// the server refuses everything else (`password_change_required`).
  bool get mustChangePassword => user?.mustChangePassword == true;

  /// The server refused a call with `password_change_required` (this session was flagged while the app was open, or the
  /// sign-in answer said nothing): show the change-password screen.
  void _holdAtPasswordChange() {
    final u = user;
    if (u == null || u.mustChangePassword) return;
    user = u.withMustChangePassword(true);
    notifyListeners();
  }
  int get unreadCount => notifications.where((n) => !n.read).length;
  /// The legs on their own: a parcel travelling in one of this rider's transfer runs is shown inside the run's card.
  List<DeliveryTaskDto> get active => myTasks.where((t) => t.isActive && !_inKnownRun(t)).toList();
  List<DeliveryTaskDto> get finished => myTasks.where((t) => t.isFinished && !_inKnownRun(t)).toList();

  /// This rider's transfer runs (UC-11): only the ones assigned to this driver. Each hop of a route has its own driver.
  final List<TransferRun> runs = [];
  List<TransferRun> get activeRuns => runs.where((r) => r.isActive).toList();
  List<TransferRun> get finishedRuns => runs.where((r) => !r.isActive).toList();

  /// Runs this driver marked on the road here, kept only until the server's own state says so (`Run.inTransit`): a
  /// fallback for a server whose answer does not carry the flag.
  final Set<String> _runsOnRoad = {};

  /// Tests: forget the runs and what the session learned about them.
  @visibleForTesting
  void debugResetSession() {
    runs.clear();
    _runsOnRoad.clear();
  }

  bool _inKnownRun(DeliveryTaskDto t) => t.runId != null && runs.any((r) => r.id == t.runId);

  /// The parcels of [run] that are in this rider's list.
  List<DeliveryTaskDto> tasksOfRun(TransferRun run) => myTasks.where((t) => t.runId == run.id || run.taskIds.contains(t.id)).toList();

  /// The run is on the road: the server says so (`Run.inTransit`), the driver said so here before the server's answer
  /// carried it, or (older servers) all its parcels are in transit.
  bool runOnRoad(TransferRun run) {
    if (run.inTransit || _runsOnRoad.contains(run.id)) return true;
    final parcels = tasksOfRun(run);
    return parcels.isNotEmpty && parcels.every((t) => t.status == 'in_transit');
  }

  /// The hop of a multi-hop route the run carries, as (hop, hops): from the run, else from its parcels. Null on a
  /// single-hop route.
  ({int hop, int hops})? runHop(TransferRun run) {
    if (run.hop != null && run.hops != null && run.hops! > 1) return (hop: run.hop!, hops: run.hops!);
    for (final t in tasksOfRun(run)) {
      if (t.isRelayHop) return (hop: t.hop!, hops: t.hops!);
    }
    return null;
  }

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
    _safetyTimer?.cancel();
    _safetyTimer = null;
    _pushTimer?.cancel();
    _pushTimer = null;
    await location.stop();
    // Stop pushes to this device before the token disappears.
    if (_socket.isConnected && _deviceToken != null) {
      unawaited(request('devices:unregister', {'token': _deviceToken}).catchError((_) {}));
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
    runs.clear();
    _runsOnRoad.clear();
    notifications.clear();
    SupportStore.instance.clear();
    ShiftStore.instance.clear();
    ComplianceStore.instance.clear();
    stats = const WorkStatsDto();
    requireDeliveryCode = false;
    location.promptsAllowed = true;
    lastLocationAccess = null;
    assignment = null;
    focus.value = null;
    notifyListeners();
  }

  /// Writes the tokens to the device. Never throws: keeping the session across launches is a convenience, and a phone
  /// that cannot store it must still get the session the server just opened.
  Future<void> _saveTokens(AuthResult r) async {
    try {
      await _auth.saveTokens(r);
    } catch (e, st) {
      debugPrint('Could not store the session on this device (${e.runtimeType}): $e\n$st');
    }
  }

  Future<void> _begin(AuthResult r) async {
    await _saveTokens(r);
    _access = r.accessToken;
    _refresh = r.refreshToken;
    user = r.user;
    status = ConnStatus.connecting;
    loaded = false;
    notifyListeners();
    _connect();
  }

  Future<AuthResult>? _rotating;

  /// Trades the refresh token for new tokens and keeps BOTH, on the phone and in memory. The server rotates refresh
  /// tokens: the one just used stops working seconds later, and sending it again after that signs the rider out on every
  /// device. So callers that need a refresh at the same moment (the reconnect, `reauth`, the session check) share this
  /// one request instead of each sending the same token.
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

  Timer? _safetyTimer;
  DateTime _lastVerify = DateTime.fromMillisecondsSinceEpoch(0);

  /// After a refused connection: is the account still allowed? (revoked, suspended, role changed)
  Future<void> _verifySession({bool force = false}) async {
    final now = DateTime.now();
    if ((!force && now.difference(_lastVerify) < const Duration(seconds: 3)) || user == null) return;
    _lastVerify = now;
    if (_refresh == null && await _auth.getRefresh() == null) return;
    try {
      final r = await _rotateTokens();
      if (r.user.role != 'rider') return unawaited(_endSession());
    } on ApiException catch (e) {
      if (e.status == 401 || e.status == 403) await _endSession();
    } catch (_) {/* offline: keep retrying */}
  }

  /// The server asks for a fresh access token shortly before the socket's one runs out (`reauth`): rotate the tokens and
  /// hand the new access token to the SAME connection (`auth:reauth`), so the rider's screens are not reloaded mid-shift.
  /// A refused refresh ends the session (see [freshAccessToken]); any other failure is left to the server, which closes
  /// the socket at its deadline, and the reconnect then refreshes and connects again.
  Future<void> _renewSocket() async {
    if (user == null) return;
    try {
      final token = await freshAccessToken(force: true);
      await request('auth:reauth', {'token': token});
    } catch (e) {
      debugPrint('Socket re-authentication failed (${e.runtimeType}): $e');
    }
  }

  /// Tests: what the app does on the server's `reauth`.
  @visibleForTesting
  Future<void> debugReauth() => _renewSocket();

  Future<void> _endSession() async {
    if (user == null) return;
    await logout();
    onSessionEnded?.call();
  }

  /// Tests: [_connect] only counts its calls instead of opening a real socket.
  @visibleForTesting
  bool debugSkipConnect = false;
  @visibleForTesting
  int debugConnects = 0;

  void _connect() {
    if (debugSkipConnect) {
      debugConnects++;
      return;
    }
    final socket = _socket.connect(freshAccessToken);
    // `ready` = the server verified us and joined our rooms; only then can we ask for data.
    socket.on('ready', (_) {
      status = ConnStatus.connected;
      notifyListeners();
      // Held at the password change: the server refuses everything else, so nothing is loaded. The change reconnects.
      if (mustChangePassword) return;
      unawaited(refresh());
      unawaited(ComplianceStore.instance.load()); // the documents reminder on the profile row
      // Push: asks for the permission and registers this device (no-op without Firebase).
      unawaited(PushService.instance.start(
        register: registerDevice,
        onMessage: (_) => unawaited(refreshNotifications()),
      ));
      // New tasks arrive as `task:updated` pushes to the assigned rider; this slow
      // re-read is only a safety net for a push missed while the connection was flaky.
      _safetyTimer?.cancel();
      _safetyTimer = Timer.periodic(const Duration(seconds: 120), (_) {
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
    // The access token behind this socket expires soon: renew it on the same connection.
    socket.on('reauth', (_) => unawaited(_renewSocket()));

    // Server pushes (a change event triggers one targeted re-read — no timers).
    // `task:updated` (and the same payload as `delivery:updated` for older servers) is a TaskView: show it at once,
    // then one targeted re-read brings the order snapshot.
    _socket.on('task:updated', (d) {
      applyTaskPush(d);
      _pushRefresh();
    });
    _socket.on('delivery:updated', (d) {
      applyTaskPush(d);
      _pushRefresh();
    });
    _socket.on('order:updated', (_) => _pushRefresh());
    // A transfer run of this driver changed (assigned, dispatched, scanned in, closed): show it at once, then re-read.
    _socket.on('run:updated', (d) {
      applyRunPush(d);
      _pushRefresh();
    });
    // An administrator changed a public setting (the delivery code): the screens follow at once.
    _socket.on('settings:updated', applySettingsPush);
    _socket.on('support:updated', (d) => SupportStore.instance.applyPush(d));
    // The rider's shift changed (here, on another phone, or the server closed a forgotten shift).
    _socket.on('shift:updated', ShiftStore.instance.applyPush);
    // The warehouse edited the vehicle, or approved or rejected a document (docs/contracts/rider-compliance.md).
    _socket.on('rider:vehicle:updated', (d) => ComplianceStore.instance.applyVehiclePush(d));
    _socket.on('rider:document:updated', (d) => ComplianceStore.instance.applyDocumentPush(d));
    // The rider's own account changed (here, or on another phone or the web portal).
    _socket.on('me:updated', _applyAccount);
    _socket.on('notification:new', applyNotificationPush);
  }

  /// A `notification:new` push. "Task updated" means parcels were merged into one of this rider's tasks, so its items
  /// changed: one re-read brings the order's lines.
  void applyNotificationPush(dynamic d) {
    if (d is! Map) return;
    final n = NotificationDto.fromJson(_map(d));
    notifications.insert(0, n);
    // Every notice type sounds here, task alerts included (new delivery available, task assigned or updated).
    NotificationSound.instance.play();
    notifyListeners();
    if (isTaskUpdatedNotice(n.title)) _pushRefresh();
  }

  /// The notice the server sends the rider when parcels were merged into a task they already have.
  static bool isTaskUpdatedNotice(String title) => title.trim() == 'Task updated';

  /// A `settings:updated` push: the public settings the rider screens follow (the delivery code).
  void applySettingsPush(dynamic d) {
    if (d is! Map) return;
    if (d.containsKey('requireDeliveryCode')) requireDeliveryCode = '${d['requireDeliveryCode']}' == 'true';
    notifyListeners();
  }

  Timer? _pushTimer;

  /// Pushes often arrive in bursts: re-read once, shortly after the last one.
  void _pushRefresh() {
    _pushTimer?.cancel();
    _pushTimer = Timer(const Duration(milliseconds: 300), () => unawaited(refresh(light: true)));
  }

  /// A `task:updated` push (a TaskView). A task assigned to this rider is added or updated in place (the push has
  /// no order snapshot: what the list already knew about the order is kept); one taken from the rider (reassigned,
  /// unassigned) leaves the list. A payload without `riderId` (older server) changes nothing: the re-read follows.
  void applyTaskPush(dynamic d) {
    if (d is! Map || d['id'] is! String || !d.containsKey('riderId')) return;
    final m = _map(d);
    final id = m['id'] as String;
    final i = myTasks.indexWhere((t) => t.id == id);
    final mine = m['riderId'] != null && m['riderId'] == user?.id && m['status'] != 'unassigned';
    if (!mine) {
      if (i != -1) {
        myTasks.removeAt(i);
        notifyListeners();
      }
      return;
    }
    try {
      final fresh = DeliveryTaskDto.fromJson(m);
      if (i == -1) {
        myTasks.insert(0, fresh);
        NotificationSound.instance.play(); // a task was assigned to this rider (its notice, if any, falls in the same 2 s)
      } else {
        myTasks[i] = fresh.withOrderFrom(myTasks[i]);
      }
      notifyListeners();
      _syncLocation();
    } catch (_) {/* malformed push: the re-read fixes it */}
  }

  /// A `run:updated` push (a Run). A run assigned to this driver is added or updated in place; one that is not (or no
  /// longer) this driver's leaves the list: each driver only ever sees their own runs.
  void applyRunPush(dynamic d) {
    if (d is! Map || d['id'] is! String) return;
    try {
      final run = TransferRun.fromJson(_map(d));
      final i = runs.indexWhere((r) => r.id == run.id);
      final mine = run.riderId != null && run.riderId == user?.id;
      if (!mine) {
        if (i != -1) {
          runs.removeAt(i);
          notifyListeners();
        }
        return;
      }
      if (i == -1) {
        runs.insert(0, run);
        NotificationSound.instance.play(); // a transfer run was assigned to this driver
      } else {
        runs[i] = run;
      }
      notifyListeners();
    } catch (_) {/* malformed push: the re-read fixes it */}
  }

  bool _readingRuns = false;

  /// Re-read this driver's transfer runs (`rider:runs`). Quiet: an older server without runs simply has none.
  Future<void> _readRuns() async {
    if (_readingRuns) return;
    _readingRuns = true;
    try {
      final mine = TransferRun.listFrom(await request('rider:runs')).where((r) => r.riderId == null || r.riderId == user?.id).toList();
      runs
        ..clear()
        ..addAll(mine);
      // the server's own state (`inTransit`) takes over from what this session remembered
      _runsOnRoad.removeWhere((id) => !runs.any((r) => r.id == id && !r.isClosed && !r.inTransit));
      notifyListeners();
    } catch (_) {/* older server: no runs */} finally {
      _readingRuns = false;
    }
  }

  /// "On the road": the whole run is in transit (`rider:runStatus { runId, status: 'in_transit' }`, which replies with the
  /// `Run`). Throws what the server refuses with.
  Future<void> markRunOnRoad(String runId) async {
    final res = await request('rider:runStatus', {'runId': runId, 'status': 'in_transit'});
    final run = res is Map && res['id'] is String ? TransferRun.fromJson(_map(res)) : null;
    // An answer without the flag (older server): remember it here until a later read says so.
    if (run == null || !run.inTransit) _runsOnRoad.add(runId);
    if (run != null) applyRunPush(res);
    notifyListeners();
    await refresh(light: true);
  }

  /// Any socket call (the support screens use it).
  Future<dynamic> request(String event, [Map<String, dynamic>? body]) => (transport ?? _socket.request)(event, body);

  /// Tests answer the socket calls themselves.
  @visibleForTesting
  Future<dynamic> Function(String event, Map<String, dynamic>? body)? transport;

  /// Re-read the rider's queue, work stats and notifications.
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
  /// (after an action or a push) only needs the queue and the work stats.
  Future<void> _refreshOnce({required bool full}) async {
    try {
      final rows = ((await request('rider:tasks')) as List).map((e) => DeliveryTaskDto.fromJson(_map(e))).toList();
      myTasks
        ..clear()
        ..addAll(rows.where((t) => t.status != 'unassigned')); // an older server may still list its open pool: not ours
      stats = WorkStatsDto.fromJson(_map(await request('rider:workStats')));
      unawaited(_readRuns());
      if (full) {
        notifications
          ..clear()
          ..addAll(((await request('notifications:list')) as List).map((e) => NotificationDto.fromJson(_map(e))));
        await _readSettings();
        await _readAssignment();
        unawaited(SupportStore.instance.load()); // the unread badge
        unawaited(ShiftStore.instance.load());
      }
      loaded = true;
      status = ConnStatus.connected;
      notifyListeners();
      _syncLocation();
    } catch (e) {
      if (kDebugMode) debugPrint('refresh failed: $e');
    }
  }

  /// The home warehouse and the areas it covers. `rider:assignment` carries `hub.coverage`; a server that does not (older
  /// payloads) is asked with `hubs:coverage { hubId }`, which any rider of the warehouse may call. A server that answers
  /// neither leaves the coverage unknown: the profile then shows the warehouse alone.
  Future<void> _readAssignment() async {
    final RiderAssignment fresh;
    try {
      fresh = RiderAssignment.fromJson(_map(await request('rider:assignment')));
    } catch (_) {
      return; // older server: no warehouse info
    }
    final old = assignment;
    // Keep what was known about the same warehouse while its coverage is read again (no flicker).
    assignment = fresh.coverage == null && old?.hubId == fresh.hubId && old?.coverage != null ? fresh.withCoverage(old!.coverage!) : fresh;
    if (fresh.coverage == null) await _readCoverage();
  }

  /// The areas the home warehouse covers, from `hubs:coverage`, for the profile (read-only). Quiet: a failure or an
  /// answer without areas changes nothing.
  Future<void> _readCoverage() async {
    final hubId = assignment?.hubId;
    if (hubId == null || assignment?.hasHub != true) return;
    try {
      final res = await request('hubs:coverage', {'hubId': hubId});
      final raw = res is Map ? res['areas'] : res;
      if (raw is List && assignment?.hubId == hubId) assignment = assignment!.withCoverage(CoverageArea.listFrom(raw));
    } catch (_) {/* older server, or nothing to show: keep what is known */}
  }

  /// Open what a notification is about (a push tap or the in-app list) and mark it read.
  void openNotice({required String type, String? entityId, String? notificationId}) {
    if (notificationId != null && notifications.any((n) => n.id == notificationId && !n.read)) {
      markRead(notificationId).catchError((_) {});
    }
    focus.value = riderFocusFor(type, entityId: entityId);
  }

  Future<void> _readSettings() async {
    try {
      final m = _map(await request('settings:get'));
      requireDeliveryCode = '${m['requireDeliveryCode']}' == 'true';
    } catch (_) {/* keep the last known value */}
  }

  // ---- parcel scanning ----

  /// The boxes of every leg of [run] (the run's checklist is counted over all of them).
  List<ParcelDto> parcelsOfRun(TransferRun run) => [for (final t in tasksOfRun(run)) ...t.parcels];

  /// The run's checklist for [stage] is complete (a run without labelled boxes has nothing to scan).
  bool runStageDone(TransferRun run, ParcelStage stage) => tasksOfRun(run).every((t) => t.stageDone(stage));

  /// The scan rule is on for this run: at least one of its legs says so and carries boxes.
  bool runScanRequired(TransferRun run) => tasksOfRun(run).any((t) => t.scanRequired && t.hasParcels);

  /// The legs worked together with [task] (itself included): its stop, i.e. the open sibling legs of the same box set.
  List<DeliveryTaskDto> stopLegsOf(DeliveryTaskDto task) {
    for (final stop in groupStops(active)) {
      if (stop.legs.any((l) => l.id == task.id)) return stop.legs;
    }
    return [task];
  }

  /// The rider scans one box of [task] (`rider:scanParcel`). The answer updates the task at once, so the buttons react. One
  /// scan ticks the box on every sibling leg too (the server records it on each), so the whole stop is updated.
  /// Throws what the server refuses with ("PKG-... is not part of this pickup.").
  Future<ParcelScan> scanParcel(DeliveryTaskDto task, String code, ParcelStage stage, {bool manual = false}) async {
    final res = await request('rider:scanParcel', {'taskId': task.id, 'code': code, 'stage': stage.wire, if (manual) 'manual': true});
    final scan = ParcelScan.fromJson(_map(res));
    _applyChecklist(stopLegsOf(task), scan.parcels, scan.required,
        single: true, pickupComplete: scan.pickupComplete, dropoffComplete: scan.dropoffComplete, contents: scan.contents, orders: scan.orders);
    notifyListeners();
    return scan;
  }

  /// What a box is (`parcels:resolve`): its contents, orders and legs, and (only for the rider's own customer delivery or
  /// express leg) the street, phone and recipient. Throws what the server refuses with ("Parcel not found.").
  Future<ParcelResolution> resolveParcel(String code) async => ParcelResolution.fromJson(_map(await request('parcels:resolve', {'code': code})));

  /// Same, for a whole transfer run: one checklist over every leg of the run.
  Future<ParcelScan> scanRunParcel(TransferRun run, String code, ParcelStage stage, {bool manual = false}) async {
    final res = await request('rider:scanParcel', {'runId': run.id, 'code': code, 'stage': stage.wire, if (manual) 'manual': true});
    final scan = ParcelScan.fromJson(_map(res));
    _applyChecklist(tasksOfRun(run), scan.parcels, scan.required);
    notifyListeners();
    return scan;
  }

  /// Re-reads one leg's checklist (`rider:legParcels`). Quiet on failure: the card keeps what it knew.
  Future<void> legParcels(DeliveryTaskDto task) async {
    try {
      final m = _map(await request('rider:legParcels', {'taskId': task.id}));
      _applyChecklist(stopLegsOf(task), ParcelDto.listFrom(m['parcels']), m['required'] != false,
          single: true,
          pickupComplete: m['pickupComplete'] as bool?,
          dropoffComplete: m['dropoffComplete'] as bool?,
          contents: ParcelContent.listFrom(m['contents']),
          orders: ParcelOrderRef.listFrom(m['orders']));
      notifyListeners();
    } catch (_) {/* keep what the card knew */}
  }

  /// Re-reads a run's checklist (`rider:legParcels` with the run).
  Future<void> legParcelsOfRun(TransferRun run) async {
    try {
      final m = _map(await request('rider:legParcels', {'runId': run.id}));
      _applyChecklist(tasksOfRun(run), ParcelDto.listFrom(m['parcels']), m['required'] != false);
      notifyListeners();
    } catch (_) {/* keep what the card knew */}
  }

  /// Puts the server's boxes onto [tasks]: each task keeps its own boxes (matched by code) with the fresh scan times; with
  /// [single] the answer is that one leg's own list.
  void _applyChecklist(List<DeliveryTaskDto> tasks, List<ParcelDto> fresh, bool required,
      {bool single = false, bool? pickupComplete, bool? dropoffComplete, List<ParcelContent> contents = const [], List<ParcelOrderRef> orders = const []}) {
    final byCode = {for (final p in fresh) p.code: p};
    for (final t in tasks) {
      t.scanRequired = required;
      // The answer's box-set contents and orders are the same for every leg of the set; absent (older server): keep what the leg had.
      if (contents.isNotEmpty) t.parcelContents = contents;
      if (orders.isNotEmpty) t.parcelOrders = orders;
      t.parcels = single ? fresh : [for (final p in t.parcels) byCode[p.code] ?? p];
      t.pickupComplete = single && pickupComplete != null ? pickupComplete : stageComplete(t.parcels, ParcelStage.pickup);
      t.dropoffComplete = single && dropoffComplete != null ? dropoffComplete : stageComplete(t.parcels, ParcelStage.dropoff);
    }
  }

  /// [reason] is required for `failed`; [code] is the customer's 4-digit code for `delivered`.
  Future<void> advance(String taskId, String status, {String? reason, String? code}) async {
    await request('delivery:updateStatus', {
      'taskId': taskId,
      'status': status,
      if (reason != null && reason.trim().isNotEmpty) 'reason': reason.trim(),
      if (code != null && code.trim().isNotEmpty) 'code': code.trim(),
    });
    await refresh(light: true);
  }

  /// Moves every leg of a stop to [status] (the customer's one 4-digit [code] is sent with each leg: sibling deliveries share
  /// it). The first leg goes alone: if the server refuses it (wrong code, scans missing) nothing changed and the refusal is
  /// thrown, so the caller can ask again without spending the other legs' attempts. Once it went through, the other legs
  /// follow and a refusal of one of them does not stop the rest: the result lists the legs that failed (empty: all went
  /// through). The list is refreshed once at the end.
  Future<List<LegFailure>> advanceLegs(List<DeliveryTaskDto> legs, String status, {String? reason, String? code}) async {
    final failures = <LegFailure>[];
    Future<void> one(DeliveryTaskDto leg) => request('delivery:updateStatus', {
          'taskId': leg.id,
          'status': status,
          if (reason != null && reason.trim().isNotEmpty) 'reason': reason.trim(),
          if (code != null && code.trim().isNotEmpty) 'code': code.trim(),
        });
    await one(legs.first);
    for (final leg in legs.skip(1)) {
      try {
        await one(leg);
      } catch (e) {
        failures.add(LegFailure(leg.orderReference, e));
      }
    }
    await refresh(light: true);
    return failures;
  }

  Future<void> sendLocation(String taskId, double lat, double lng) async {
    await request('delivery:location', {'taskId': taskId, 'lat': lat, 'lng': lng});
  }

  /// GPS (also in the background: Android foreground service / iOS background
  /// location) follows the delivery that is `in_transit` and nothing else: it
  /// starts when the rider sets off, and stops when the delivery is delivered or
  /// failed (it leaves `in_transit`), or on sign-out.
  LocationAccess? lastLocationAccess;

  @visibleForTesting
  void syncLocationNow() => _syncLocation();

  /// The app is back in front (for example from the phone's location settings): if a ride is on and the position is not
  /// being shared, try to start it again.
  void retryLocation() {
    if (user == null || location.running) return;
    _syncLocation();
  }

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
    await request('devices:register', {'token': token, 'platform': platform, 'app': 'rider'});
  }

  /// Re-read the notification list (a push arrived while the app is open).
  Future<void> refreshNotifications() async {
    try {
      final rows = ((await request('notifications:list')) as List).map((e) => NotificationDto.fromJson(_map(e))).toList();
      notifications
        ..clear()
        ..addAll(rows);
      notifyListeners();
    } catch (_) {/* the socket's own `notification:new` still delivers it */}
    unawaited(refresh(light: true));
  }

  Future<void> markRead(String id) async {
    await request('notifications:markRead', {'id': id});
    final i = notifications.indexWhere((n) => n.id == id);
    if (i != -1) {
      notifications[i] = notifications[i].asRead();
      notifyListeners();
    }
  }

  /// The rider's own name and phone (`me:update`; the server edits the signed-in account only, and never the e-mail, the
  /// role or the warehouse). A blank phone clears it. Throws what the server refuses with ("Enter a valid phone number.").
  Future<void> updateProfile({required String name, required String phone}) async {
    final res = await request('me:update', {'name': name.trim(), 'phone': phone.trim().isEmpty ? null : phone.trim()});
    _applyAccount(res);
  }

  /// Change the password (`me:changePassword`). The answer carries FRESH tokens: this phone keeps them (otherwise its next
  /// refresh would be refused as revoked and the rider signed out); every other phone is signed out by the server.
  Future<void> changePassword({required String current, required String next}) async {
    final wasHeld = mustChangePassword;
    final res = await request('me:changePassword', {'current': current, 'next': next});
    final r = AuthResult.fromJson(_map(res));
    await _saveTokens(r);
    _access = r.accessToken;
    _refresh = r.refreshToken;
    _applyAccount(_map(res)['user']);
    if (wasHeld && !mustChangePassword) {
      // Nothing was loaded while the account was held: reconnect with the new tokens, as after a normal sign-in.
      loaded = false;
      status = ConnStatus.connecting;
      notifyListeners();
      _connect();
    }
  }

  /// A `me:updated` push or the answer of `me:update`: the signed-in rider's own account (another account's is ignored).
  void _applyAccount(dynamic d) {
    if (d is! Map || user == null) return;
    try {
      final fresh = BackendUser.fromJson(_map(d));
      if (fresh.id != user!.id || fresh.role != 'rider') return;
      user = fresh;
      notifyListeners();
    } catch (_) {/* malformed push: keep what is known */}
  }

  Future<({String? devToken, bool notConfigured})> forgotPassword(String email) => _auth.forgotPassword(email);
  Future<void> resetPassword(String token, String password) => _auth.resetPassword(token, password);

  Map<String, dynamic> _map(dynamic d) => (d as Map).map((k, v) => MapEntry(k.toString(), v));
}
