import 'package:flutter/foundation.dart';

/// Backend endpoint configuration.
///
/// Override at build/run time, e.g.:
///   flutter run --dart-define=API_URL=http://192.168.1.20:3001
///
/// `API_URL` is enough: the Socket.IO endpoint follows it. Pass `SOCKET_URL` only
/// when the socket lives somewhere else than the REST API.
///
/// Without `API_URL` the default targets the Android emulator loopback
/// (10.0.2.2 → host machine). For iOS simulator or desktop use
/// http://localhost:3001; for a physical device use your machine's LAN IP.
class Env {
  static const String apiUrl = String.fromEnvironment(
    'API_URL',
    defaultValue: 'http://10.0.2.2:3001',
  );

  static const String _socketOverride = String.fromEnvironment('SOCKET_URL');

  /// Socket.IO endpoint: `SOCKET_URL` when given, else the same host as the API
  /// (a build with only `--dart-define=API_URL=…` must not keep the socket on the
  /// Android emulator default, or the app signs in over REST and never connects).
  static String get socketUrl => socketUrlFor(api: apiUrl, override: _socketOverride);

  /// The socket endpoint for an [api] URL and an optional `SOCKET_URL` [override] (empty = none).
  @visibleForTesting
  static String socketUrlFor({required String api, String override = ''}) => override.isNotEmpty ? override : api;
}
