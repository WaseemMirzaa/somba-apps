// Push notifications are optional: they must never break a build or a test, and
// must register/refresh the device token once Firebase is available.
import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:somba_rider/services/push_service.dart';

class _FakeBackend implements PushBackend {
  _FakeBackend({this.configured = true, this.allowed = true});

  final bool configured;
  final bool allowed;
  final String? firstToken = 'tok-1';
  final refreshes = StreamController<String>.broadcast();
  final messages = StreamController<void>.broadcast();
  var permissionAsked = 0;

  @override
  Future<bool> initialize() async => configured;
  @override
  Future<bool> requestPermission() async {
    permissionAsked++;
    return allowed;
  }

  @override
  Future<String?> token() async => firstToken;
  @override
  Stream<String> get tokenRefreshes => refreshes.stream;
  @override
  Stream<void> get foregroundMessages => messages.stream;
  @override
  String get platform => 'android';
}

void main() {
  test('registers the token after sign-in, again when it rotates, and refreshes on a foreground push', () async {
    final backend = _FakeBackend();
    final service = PushService(backend);
    final registered = <String>[];
    var pushes = 0;

    await service.start(register: (t, p) async => registered.add('$t@$p'), onMessage: () => pushes++);
    expect(registered, ['tok-1@android']);
    expect(service.active, isTrue);

    backend.refreshes.add('tok-2');
    await Future<void>.delayed(Duration.zero);
    expect(registered, ['tok-1@android', 'tok-2@android']);

    backend.messages.add(null);
    await Future<void>.delayed(Duration.zero);
    expect(pushes, 1);

    await service.stop();
    expect(service.active, isFalse);
    backend.refreshes.add('tok-3');
    backend.messages.add(null);
    await Future<void>.delayed(Duration.zero);
    expect(registered, hasLength(2), reason: 'nothing happens after sign-out');
    expect(pushes, 1);
  });

  test('does nothing, silently, when the build has no Firebase configuration', () async {
    final backend = _FakeBackend(configured: false);
    final service = PushService(backend);
    var called = false;
    await service.start(register: (t, p) async => called = true, onMessage: () {});
    expect(called, isFalse);
    expect(backend.permissionAsked, 0, reason: 'no permission prompt without Firebase');
    expect(service.active, isFalse);
  });

  test('does not register when the user declines the notification permission', () async {
    final backend = _FakeBackend(allowed: false);
    final service = PushService(backend);
    var called = false;
    await service.start(register: (t, p) async => called = true, onMessage: () {});
    expect(backend.permissionAsked, 1);
    expect(called, isFalse);
  });

  test('a failing registration (offline) never throws into the app', () async {
    final service = PushService(_FakeBackend());
    await service.start(register: (t, p) async => throw StateError('offline'), onMessage: () {});
    expect(service.token, 'tok-1');
  });

  test('the real Firebase backend reports "not configured" instead of throwing (no google-services.json here)', () async {
    TestWidgetsFlutterBinding.ensureInitialized();
    expect(await FirebasePushBackend().initialize(), isFalse);
    final service = PushService(FirebasePushBackend());
    await service.start(register: (t, p) async {}, onMessage: () {});
    expect(service.active, isFalse);
  });
}
