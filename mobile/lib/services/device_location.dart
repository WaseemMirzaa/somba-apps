import 'package:flutter/foundation.dart';
import 'package:geolocator/geolocator.dart';

/// Why the phone could not say where it is.
enum LocationProblem {
  /// Location services (GPS) are switched off for the whole device.
  servicesOff,

  /// The customer said no this time; asking again is allowed.
  denied,

  /// "Don't allow" was chosen for good: only the system Settings can undo it.
  blocked,

  /// Allowed, but no position arrived (no signal, timeout).
  unavailable,
}

class LocationException implements Exception {
  final LocationProblem problem;
  const LocationException(this.problem);
  @override
  String toString() => 'LocationException($problem)';
}

/// A remembered position younger than this is good enough to centre the map at once (no waiting for a new fix).
const lastKnownMaxAge = Duration(minutes: 10);

/// How long a new balanced-accuracy fix may take before the remembered position (even an older one) is used.
const freshFixTimeLimit = Duration(seconds: 6);

/// The phone's position, asking for permission when needed. Throws a [LocationException] that says which of the four
/// things went wrong, so a screen can tell the customer what to do instead of a generic "denied".
///
/// Order: a last known position up to [lastKnownMaxAge] old is returned immediately; otherwise a new balanced fix is
/// awaited for at most [freshFixTimeLimit]; if none arrives the last known position is used however old it is, and only
/// without any position at all is `unavailable` thrown. Tests replace it with [debugPosition].
Future<({double lat, double lng})> currentPosition() async {
  final stub = debugPosition;
  if (stub != null) return stub();
  if (!await Geolocator.isLocationServiceEnabled()) throw const LocationException(LocationProblem.servicesOff);
  var perm = await Geolocator.checkPermission();
  if (perm == LocationPermission.denied) perm = await Geolocator.requestPermission();
  if (perm == LocationPermission.deniedForever) throw const LocationException(LocationProblem.blocked);
  if (perm == LocationPermission.denied) throw const LocationException(LocationProblem.denied);
  Position? remembered;
  try {
    remembered = await Geolocator.getLastKnownPosition();
  } catch (e) {
    debugPrint('No last known position: $e'); // not supported on every platform: carry on with a fresh fix
  }
  if (remembered != null && DateTime.now().difference(remembered.timestamp).abs() <= lastKnownMaxAge) {
    return (lat: remembered.latitude, lng: remembered.longitude);
  }
  try {
    final p = await Geolocator.getCurrentPosition(locationSettings: const LocationSettings(accuracy: LocationAccuracy.medium, timeLimit: freshFixTimeLimit));
    return (lat: p.latitude, lng: p.longitude);
  } catch (e) {
    debugPrint('No fresh position: $e');
    if (remembered != null) return (lat: remembered.latitude, lng: remembered.longitude);
    throw const LocationException(LocationProblem.unavailable);
  }
}

/// The system screen that can fix [problem] (location services, or this app's permissions).
Future<void> openLocationSettingsFor(LocationProblem problem) async {
  if (problem == LocationProblem.servicesOff) {
    await Geolocator.openLocationSettings();
  } else {
    await Geolocator.openAppSettings();
  }
}

@visibleForTesting
Future<({double lat, double lng})> Function()? debugPosition;
