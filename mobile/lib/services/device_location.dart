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

/// The phone's position, asking for permission when needed. Throws a [LocationException] that says which of the four
/// things went wrong, so a screen can tell the customer what to do instead of a generic "denied".
/// Tests replace it with [debugPosition].
Future<({double lat, double lng})> currentPosition() async {
  final stub = debugPosition;
  if (stub != null) return stub();
  if (!await Geolocator.isLocationServiceEnabled()) throw const LocationException(LocationProblem.servicesOff);
  var perm = await Geolocator.checkPermission();
  if (perm == LocationPermission.denied) perm = await Geolocator.requestPermission();
  if (perm == LocationPermission.deniedForever) throw const LocationException(LocationProblem.blocked);
  if (perm == LocationPermission.denied) throw const LocationException(LocationProblem.denied);
  try {
    final p = await Geolocator.getCurrentPosition(locationSettings: const LocationSettings(accuracy: LocationAccuracy.high, timeLimit: Duration(seconds: 10)));
    return (lat: p.latitude, lng: p.longitude);
  } catch (e) {
    debugPrint('No position: $e');
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
