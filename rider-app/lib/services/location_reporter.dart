import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:geolocator/geolocator.dart';

enum LocationAccess { granted, denied, deniedForever, serviceOff }

/// Streams the rider's REAL position while a delivery is on the road. The
/// customer (and ops) see it live through `delivery:location`.
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
  Future<LocationAccess> start(String taskId, Future<void> Function(double lat, double lng) send) async {
    final access = await ensureAccess();
    if (access != LocationAccess.granted) return access;
    if (_taskId == taskId && _sub != null) return access;
    await stop();
    _taskId = taskId;
    _sub = Geolocator.getPositionStream(
      locationSettings: const LocationSettings(accuracy: LocationAccuracy.high, distanceFilter: 10),
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

  Future<void> stop() async {
    await _sub?.cancel();
    _sub = null;
    _taskId = null;
  }
}
