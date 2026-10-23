import 'dart:async';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'firebase_env.dart';

/// A push notification as the app sees it. The server sends the same data on
/// every push: `type`, `entityId`, `notificationId` and `link` (plus `orderId`
/// and `view` on rider tasks), so a tap can open the right screen.
class PushMessage {
  const PushMessage({this.title, this.body, this.data = const {}});

  final String? title;
  final String? body;
  final Map<String, String> data;

  String get type => data['type'] ?? '';
  String? get entityId => _nonEmpty(data['entityId']);
  String? get notificationId => _nonEmpty(data['notificationId']);

  static String? _nonEmpty(String? v) => v == null || v.isEmpty ? null : v;

  factory PushMessage.fromRemote(RemoteMessage m) => PushMessage(
        title: m.notification?.title,
        body: m.notification?.body,
        data: m.data.map((k, v) => MapEntry(k, '$v')),
      );
}

/// What the push service needs from Firebase. The default talks to Firebase
/// Cloud Messaging; tests (and builds without Firebase) use other backends.
abstract class PushBackend {
  /// Starts Firebase. Returns false — never throws — when this build has no
  /// Firebase configuration (no `--dart-define=FIREBASE_*` values and no
  /// `google-services.json` / `GoogleService-Info.plist`), on the web, or when
  /// Firebase cannot start for any other reason.
  Future<bool> initialize();

  /// Asks the user for the notification permission. True when notifications may be shown.
  Future<bool> requestPermission();

  /// The device's FCM registration token (null when unavailable).
  Future<String?> token();

  /// New tokens (FCM rotates them from time to time).
  Stream<String> get tokenRefreshes;

  /// A push message that arrived while the app is open.
  Stream<PushMessage> get foregroundMessages;

  /// The user tapped a notification while the app was in the background.
  Stream<PushMessage> get openedMessages;

  /// The notification whose tap launched the app from closed (once; null otherwise).
  Future<PushMessage?> initialMessage();

  /// `android` or `ios`, as the API's `devices:register` expects.
  String get platform;
}

/// Firebase Cloud Messaging.
class FirebasePushBackend implements PushBackend {
  @override
  Future<bool> initialize() async {
    if (kIsWeb) return false; // web push needs its own VAPID setup: not used
    try {
      if (Firebase.apps.isEmpty) await Firebase.initializeApp(options: firebaseOptionsFromDefines());
      // iOS: the app shows its own banner for pushes that arrive while it is
      // open (see PushService.foreground), so the system only plays the sound.
      await FirebaseMessaging.instance.setForegroundNotificationPresentationOptions(alert: false, badge: true, sound: true);
      return true;
    } catch (e) {
      if (kDebugMode) debugPrint('Push disabled (Firebase is not configured in this build): $e');
      return false;
    }
  }

  @override
  Future<bool> requestPermission() async {
    final s = await FirebaseMessaging.instance.requestPermission();
    return s.authorizationStatus == AuthorizationStatus.authorized || s.authorizationStatus == AuthorizationStatus.provisional;
  }

  @override
  Future<String?> token() => FirebaseMessaging.instance.getToken();

  @override
  Stream<String> get tokenRefreshes => FirebaseMessaging.instance.onTokenRefresh;

  @override
  Stream<PushMessage> get foregroundMessages => FirebaseMessaging.onMessage.map(PushMessage.fromRemote);

  @override
  Stream<PushMessage> get openedMessages => FirebaseMessaging.onMessageOpenedApp.map(PushMessage.fromRemote);

  @override
  Future<PushMessage?> initialMessage() async {
    final m = await FirebaseMessaging.instance.getInitialMessage();
    return m == null ? null : PushMessage.fromRemote(m);
  }

  @override
  String get platform => defaultTargetPlatform == TargetPlatform.iOS ? 'ios' : 'android';
}

/// Registers this device for push notifications once the user is signed in and
/// keeps the registration fresh. Everything is best-effort and silent: without
/// Firebase configuration in the build (or when the user declines the
/// permission) the app simply keeps using its live socket updates.
///
/// Taps are held in [pendingTap] until the app is ready to open a screen (signed
/// in, data loaded); the app takes them with [takeTap]. Pushes that arrive while
/// the app is open are on [foreground], for an in-app banner.
class PushService {
  PushService(this.backend);

  /// The service the app uses. Tests replace [backend].
  static PushService instance = PushService(FirebasePushBackend());

  final PushBackend backend;
  StreamSubscription<String>? _refreshSub;
  StreamSubscription<PushMessage>? _messageSub;
  StreamSubscription<PushMessage>? _openedSub;
  bool _started = false;
  bool _initialChecked = false;
  final _foreground = StreamController<PushMessage>.broadcast();

  /// A tapped notification the app has not opened yet.
  final ValueNotifier<PushMessage?> pendingTap = ValueNotifier(null);

  /// Pushes that arrive while the app is open.
  Stream<PushMessage> get foreground => _foreground.stream;

  /// True once a token was registered with the API in this session.
  bool get active => _started && _token != null;
  String? _token;
  String? get token => _token;

  /// The tapped notification to open now (cleared once taken).
  PushMessage? takeTap() {
    final m = pendingTap.value;
    pendingTap.value = null;
    return m;
  }

  /// Call after sign-in, once the socket is ready. [register] sends the token
  /// to the API (`devices:register`); [onMessage] runs when a push arrives while
  /// the app is open (the notification list is refreshed).
  Future<void> start({
    required Future<void> Function(String token, String platform) register,
    required void Function(PushMessage message) onMessage,
  }) async {
    if (_started) return;
    try {
      if (!await backend.initialize()) return;
      _started = true;
      // A tap is worth following even if the permission prompt is declined below.
      _openedSub = backend.openedMessages.listen((m) => pendingTap.value = m, onError: (_) {});
      if (!_initialChecked) {
        _initialChecked = true;
        final launched = await backend.initialMessage();
        if (launched != null) pendingTap.value = launched;
      }
      if (!await backend.requestPermission()) {
        _started = false;
        await _openedSub?.cancel();
        _openedSub = null;
        return;
      }
      Future<void> send(String token) async {
        _token = token;
        try {
          await register(token, backend.platform);
        } catch (e) {
          if (kDebugMode) debugPrint('Push: registering the device failed: $e');
        }
      }

      final first = await backend.token();
      if (first != null) await send(first);
      _refreshSub = backend.tokenRefreshes.listen((t) => unawaited(send(t)), onError: (_) {});
      _messageSub = backend.foregroundMessages.listen((m) {
        onMessage(m);
        _foreground.add(m);
      }, onError: (_) {});
    } catch (e) {
      _started = false;
      if (kDebugMode) debugPrint('Push start failed: $e');
    }
  }

  /// Call on sign-out (after `devices:unregister`): stop listening and forget any unopened tap.
  Future<void> stop() async {
    _started = false;
    _token = null;
    pendingTap.value = null;
    await _refreshSub?.cancel();
    await _messageSub?.cancel();
    await _openedSub?.cancel();
    _refreshSub = _messageSub = _openedSub = null;
  }
}
