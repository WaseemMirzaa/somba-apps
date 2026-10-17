import 'dart:async';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';

/// What the push service needs from Firebase. The default talks to Firebase
/// Cloud Messaging; tests (and builds without Firebase) use other backends.
abstract class PushBackend {
  /// Starts Firebase. Returns false — never throws — when this build has no
  /// Firebase configuration (`google-services.json` / `GoogleService-Info.plist`
  /// missing), on the web, or when Firebase cannot start for any other reason.
  Future<bool> initialize();

  /// Asks the user for the notification permission. True when notifications may be shown.
  Future<bool> requestPermission();

  /// The device's FCM registration token (null when unavailable).
  Future<String?> token();

  /// New tokens (FCM rotates them from time to time).
  Stream<String> get tokenRefreshes;

  /// A push message that arrived while the app is open.
  Stream<void> get foregroundMessages;

  /// `android` or `ios`, as the API's `devices:register` expects.
  String get platform;
}

/// Firebase Cloud Messaging.
class FirebasePushBackend implements PushBackend {
  @override
  Future<bool> initialize() async {
    if (kIsWeb) return false; // web push needs its own VAPID setup: not used
    try {
      if (Firebase.apps.isEmpty) await Firebase.initializeApp();
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
  Stream<void> get foregroundMessages => FirebaseMessaging.onMessage;

  @override
  String get platform => defaultTargetPlatform == TargetPlatform.iOS ? 'ios' : 'android';
}

/// Registers this device for push notifications once the user is signed in and
/// keeps the registration fresh. Everything is best-effort and silent: without
/// Firebase configuration in the build (or when the user declines the
/// permission) the app simply keeps using its live socket updates.
class PushService {
  PushService(this.backend);

  /// The service the app uses. Tests replace [backend].
  static PushService instance = PushService(FirebasePushBackend());

  final PushBackend backend;
  StreamSubscription<String>? _refreshSub;
  StreamSubscription<void>? _messageSub;
  bool _started = false;

  /// True once a token was registered with the API in this session.
  bool get active => _started && _token != null;
  String? _token;
  String? get token => _token;

  /// Call after sign-in, once the socket is ready. [register] sends the token
  /// to the API (`devices:register`); [onMessage] runs when a push arrives while
  /// the app is open (the notification list is refreshed).
  Future<void> start({
    required Future<void> Function(String token, String platform) register,
    required void Function() onMessage,
  }) async {
    if (_started) return;
    try {
      if (!await backend.initialize()) return;
      if (!await backend.requestPermission()) return;
      _started = true;
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
      _messageSub = backend.foregroundMessages.listen((_) => onMessage(), onError: (_) {});
    } catch (e) {
      _started = false;
      if (kDebugMode) debugPrint('Push start failed: $e');
    }
  }

  /// Call on sign-out (after `devices:unregister`): stop listening.
  Future<void> stop() async {
    _started = false;
    _token = null;
    await _refreshSub?.cancel();
    await _messageSub?.cancel();
    _refreshSub = _messageSub = null;
  }
}
