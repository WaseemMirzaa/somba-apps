/// Backend endpoint configuration.
///
/// Override at build/run time, e.g.:
///   flutter run --dart-define=API_URL=http://192.168.1.20:3001
///
/// Defaults target the Android emulator loopback (10.0.2.2 → host machine).
/// For iOS simulator or desktop use http://localhost:3001; for a physical
/// device use your machine's LAN IP.
class Env {
  static const String apiUrl = String.fromEnvironment(
    'API_URL',
    defaultValue: 'http://10.0.2.2:3001',
  );

  /// Socket.IO endpoint; defaults to the same host as the API.
  static const String socketUrl = String.fromEnvironment(
    'SOCKET_URL',
    defaultValue: 'http://10.0.2.2:3001',
  );
}
