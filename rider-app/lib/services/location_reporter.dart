import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:geolocator/geolocator.dart';

enum LocationAccess { granted, denied, deniedForever, serviceOff }

/// Text of the Android foreground-service notification shown while the position
/// is shared in the background (already in the rider's language).
class TrackingNotice {
  final String title;
  final String text;
  final String channel;
  const TrackingNotice({required this.title, required this.text, required this.channel});
}

/// The settings that keep the position stream alive when the screen is off or
/// the app is in the background:
///  * Android: a foreground service of type `location` with an ongoing
///    notification (geolocator's [ForegroundNotificationConfig]);
///  * iOS: `allowBackgroundLocationUpdates` (needs the `location` background
///    mode in Info.plist) with the blue "location in use" indicator;
///  * anything else (web, desktop, tests): a plain foreground stream.
LocationSettings trackingSettings(TrackingNotice notice, {TargetPlatform? platform, bool web = kIsWeb}) {
  const distanceFilter = 10;
  if (web) return const LocationSettings(accuracy: LocationAccuracy.high, distanceFilter: distanceFilter);
  switch (platform ?? defaultTargetPlatform) {
    case TargetPlatform.android:
      return AndroidSettings(
        accuracy: LocationAccuracy.high,
        distanceFilter: distanceFilter,
        intervalDuration: const Duration(seconds: 5),
        foregroundNotificationConfig: ForegroundNotificationConfig(
          notificationTitle: notice.title,
          notificationText: notice.text,
          notificationChannelName: notice.channel,
          enableWakeLock: true,
          setOngoing: true,
        ),
      );
    case TargetPlatform.iOS:
    case TargetPlatform.macOS:
      return AppleSettings(
        accuracy: LocationAccuracy.high,
        distanceFilter: distanceFilter,
        activityType: ActivityType.automotiveNavigation,
        pauseLocationUpdatesAutomatically: false,
        showBackgroundLocationIndicator: true,
        allowBackgroundLocationUpdates: true,
      );
    default:
      return const LocationSettings(accuracy: LocationAccuracy.high, distanceFilter: distanceFilter);
  }
}

/// Streams the rider's REAL position while a delivery is on the road
/// (`in_transit`), also with the screen off. The customer (and ops) see it live
/// through `delivery:location`. Stopped when the delivery ends or on sign-out.
class LocationReporter {
  StreamSubscription<Position>? _sub;
  String? _taskId;
  DateTime _lastSent = DateTime.fromMillisecondsSinceEpoch(0);

  /// Where the rider currently is (last fix), for the UI.
  final ValueNotifier<Position?> last = ValueNotifier(null);

  bool get running => _sub != null;
  String? get taskId => _taskId;

  Future<LocationAccess> ensureAccess() async {
    try {
      return await _ensureAccess();
    } catch (_) {
      // No location plugin on this platform (tests, unsupported desktop): treat as off.
      return LocationAccess.serviceOff;
    }
  }

  Future<LocationAccess> _ensureAccess() async {
    if (!await Geolocator.isLocationServiceEnabled()) return LocationAccess.serviceOff;
    var p = await Geolocator.checkPermission();
    if (p == LocationPermission.denied) p = await Geolocator.requestPermission();
    return switch (p) {
      LocationPermission.deniedForever => LocationAccess.deniedForever,
      LocationPermission.denied || LocationPermission.unableToDetermine => LocationAccess.denied,
      _ => LocationAccess.granted,
    };
  }

  /// Start reporting for [taskId]. [send] pushes one fix to the server. Fixes are
  /// throttled to one every 4 s and only when the rider moved at least 10 m.
  Future<LocationAccess> start(String taskId, Future<void> Function(double lat, double lng) send, {required TrackingNotice notice}) async {
    final access = await ensureAccess();
    if (access != LocationAccess.granted) return access;
    if (_taskId == taskId && _sub != null) return access;
    await stop();
    _taskId = taskId;
    _sub = Geolocator.getPositionStream(
      locationSettings: trackingSettings(notice),
    ).listen((pos) {
      last.value = pos;
      final now = DateTime.now();
      if (now.difference(_lastSent) < const Duration(seconds: 4)) return;
      _lastSent = now;
      unawaited(send(pos.latitude, pos.longitude).catchError((_) {}));
    }, onError: (_) {});
    // Send an immediate first fix so the customer sees the rider straight away.
    try {
      final pos = await Geolocator.getCurrentPosition(locationSettings: const LocationSettings(accuracy: LocationAccuracy.high)).timeout(const Duration(seconds: 8));
      last.value = pos;
      _lastSent = DateTime.now();
      unawaited(send(pos.latitude, pos.longitude).catchError((_) {}));
    } catch (_) {/* the stream will deliver the first fix */}
    return access;
  }

  /// Opens the system page where the rider can fix the problem. Returns false
  /// when the platform has no such page (tests, desktop).
  Future<bool> openSettings(LocationAccess access) async {
    try {
      return access == LocationAccess.serviceOff ? await Geolocator.openLocationSettings() : await Geolocator.openAppSettings();
    } catch (_) {
      return false;
    }
  }

  Future<void> stop() async {
    await _sub?.cancel();
    _sub = null;
    _taskId = null;
  }
}
