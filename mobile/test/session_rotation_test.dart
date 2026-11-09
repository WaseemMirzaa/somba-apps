// Refresh-token rotation and socket re-authentication (server audit A-02 / A-09). The server now hands out a NEW
// refresh token on every refresh and signs the account out everywhere when an old one comes back after a short grace,
// and it asks an open socket to re-authenticate (`reauth`) before its access token runs out. The app must therefore
// keep the newest refresh token, never send the same one twice from two places at once, and renew the socket in place.

import 'package:flutter_test/flutter_test.dart';
import 'package:lipcart/services/auth_service.dart';
import 'package:lipcart/services/models.dart';
import 'package:lipcart/services/realtime_store.dart';

/// A server that rotates: `rN` is answered with `r(N+1)` (and access token `aN+1`). Sending a token that was already
/// replaced is recorded as a reuse, which on the real server would sign the customer out everywhere.
class RotatingAuth extends AuthService {
  int latest = 0;
  final sent = <String>[];
  final reused = <String>[];
  final saved = <AuthResult>[];
  String? stored = 'r0';

  @override
  Future<AuthResult> refresh(String token) async {
    sent.add(token);
    await Future<void>.delayed(const Duration(milliseconds: 20)); // a real round trip: callers overlap
    if (token != 'r$latest') reused.add(token);
    latest++;
    return AuthResult(user: BackendUser(id: 'c', email: 'marie@somba.app', name: 'Marie', role: 'customer'), accessToken: 'a$latest', refreshToken: 'r$latest');
  }

  @override
  Future<void> saveTokens(AuthResult r) async {
    saved.add(r);
    stored = r.refreshToken;
  }

  @override
  Future<String?> getRefresh() async => stored;

  @override
  Future<void> clear() async => stored = null;
}

void main() {
  // One server for the whole file: the store is a singleton and keeps the newest token from test to test, as a phone would.
  final auth = RotatingAuth();
  late List<(String, Map<String, dynamic>?)> calls;
  final store = RealtimeStore.instance;

  setUp(() {
    auth
      ..sent.clear()
      ..reused.clear()
      ..saved.clear();
    calls = [];
    store.debugAuth = auth;
    store.user = BackendUser(id: 'c', email: 'marie@somba.app', name: 'Marie', role: 'customer');
    store.debugCallRequest = (event, [body]) async {
      calls.add((event, body));
      return {'expiresAt': '2026-11-09T12:15:00.000Z'};
    };
  });

  test('on `reauth` the app rotates once, keeps the NEW refresh token and renews the open socket with the new access token', () async {
    await store.debugReauth();
    expect(auth.sent, hasLength(1));
    expect(auth.stored, 'r${auth.latest}', reason: 'the rotated refresh token is what the phone keeps');
    expect(calls.single.$1, 'auth:reauth');
    expect(calls.single.$2, {'token': 'a${auth.latest}'});
  });

  test('a long session: every renewal sends the newest refresh token, never a replaced one', () async {
    for (var i = 0; i < 5; i++) {
      await store.debugReauth();
    }
    expect(auth.sent, hasLength(5));
    expect(auth.reused, isEmpty);
    expect(calls.map((c) => c.$2?['token']).toSet(), hasLength(5));
  });

  test('`reauth`, a reconnect and the session check at the same moment share ONE refresh (no reuse, no sign-out)', () async {
    await Future.wait([
      store.debugReauth(),
      store.debugVerifySession(),
      store.freshAccessToken(force: true),
      store.debugReauth(),
    ]);
    expect(auth.sent, hasLength(1));
    expect(auth.reused, isEmpty);
    expect(store.user, isNotNull);
    // and the next one goes out with the token that refresh returned
    await store.freshAccessToken(force: true);
    expect(auth.sent.last, 'r${auth.latest - 1}');
    expect(auth.reused, isEmpty);
  });

  test('a refused renewal (the session was revoked) leaves nothing half-done: no `auth:reauth` is sent', () async {
    final refusing = _RefusingAuth();
    store.debugAuth = refusing;
    store.onSessionEnded = (_) {};
    await store.debugReauth();
    expect(calls, isEmpty);
    await pumpEventQueue();
    expect(store.user, isNull, reason: 'a refused refresh ends the session');
  });
}

class _RefusingAuth extends RotatingAuth {
  @override
  Future<AuthResult> refresh(String token) async => throw ApiException('Session has been revoked.', 401);
}
