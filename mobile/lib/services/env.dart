import 'package:flutter/foundation.dart';

/// Backend endpoint configuration.
///
/// Override at build/run time, e.g.:
///   flutter run --dart-define=API_URL=http://192.168.1.20:3001
///
/// Without an override the default follows the platform: the Android emulator
/// reaches the host machine at 10.0.2.2; the iOS simulator, desktop and web
/// reach it at localhost. A physical device needs your machine's LAN IP.
class Env {
  static const String _apiOverride = String.fromEnvironment('API_URL');
  static const String _socketOverride = String.fromEnvironment('SOCKET_URL');

  static String get apiUrl => _apiOverride.isNotEmpty ? _apiOverride : defaultUrlFor(defaultTargetPlatform, web: kIsWeb);

  /// Socket.IO endpoint; defaults to the same host as the API.
  static String get socketUrl => _socketOverride.isNotEmpty ? _socketOverride : apiUrl;

  /// The local API seen from [platform] when nothing was passed with `--dart-define`.
  @visibleForTesting
  static String defaultUrlFor(TargetPlatform platform, {bool web = false}) =>
      !web && platform == TargetPlatform.android ? 'http://10.0.2.2:3001' : 'http://localhost:3001';
}
