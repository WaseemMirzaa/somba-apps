// Building with only `--dart-define=API_URL=…` must point the socket at that server too: it used to stay on
// the Android emulator default (10.0.2.2), so on the iOS simulator the app signed in over REST and then
// sat on "Connexion…" forever.
import 'package:flutter_test/flutter_test.dart';
import 'package:somba_rider/services/env.dart';

void main() {
  test('the socket follows the API url when SOCKET_URL is not given', () {
    expect(Env.socketUrlFor(api: 'http://localhost:3001'), 'http://localhost:3001');
    expect(Env.socketUrlFor(api: 'http://192.168.1.20:3001', override: ''), 'http://192.168.1.20:3001');
  });

  test('SOCKET_URL still overrides it', () {
    expect(Env.socketUrlFor(api: 'http://localhost:3001', override: 'http://localhost:4001'), 'http://localhost:4001');
  });

  test('with no define at all both stay on the same host', () {
    // (a plain `flutter test` passes no --dart-define; CI or a dev may pass API_URL, SOCKET_URL, or both)
    const socketDefined = String.fromEnvironment('SOCKET_URL') != '';
    if (!socketDefined) expect(Env.socketUrl, Env.apiUrl);
  });
}
