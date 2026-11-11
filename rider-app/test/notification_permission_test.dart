// The notification permission: asked once per install right after sign-in, even when Firebase cannot start; a denial
// is never re-asked automatically and shows the "open settings" row; nothing here may break the sign-in.
import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:somba_rider/services/notification_permission.dart';
import 'package:somba_rider/services/push_service.dart';

class _FakePerm implements NotificationPermissionBackend {
  _FakePerm(this.current, {this.afterRequest = NotifPermState.granted, this.throws = false});
  NotifPermState current;
  final NotifPermState afterRequest;
  final bool throws;
  var requests = 0;
  var opened = 0;
  @override
  Future<NotifPermState> status() async {
    if (throws) throw StateError('no plugin');
    return current;
  }

  @override
  Future<NotifPermState> request() async {
    if (throws) throw StateError('no plugin');
    requests++;
    return current = afterRequest;
  }

  @override
  Future<bool> openSettings() async {
    opened++;
    return true;
  }
}

class _NoFirebase implements PushBackend {
  var initCalls = 0;
  @override
  Future<bool> initialize() async {
    initCalls++;
    return false; // Firebase cannot start in this build
  }

  @override
  Future<bool> requestPermission() async => true;
  @override
  Future<String?> token() async => null;
  @override
  Stream<String> get tokenRefreshes => const Stream.empty();
  @override
  Stream<PushMessage> get foregroundMessages => const Stream.empty();
  @override
  Stream<PushMessage> get openedMessages => const Stream.empty();
  @override
  Future<PushMessage?> initialMessage() async => null;
  @override
  String get platform => 'android';
}

Future<void> _start(PushService s) => s.start(register: (_, __) async {}, onMessage: (_) {});

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  test('granted: no prompt, no settings row', () async {
    final fake = _FakePerm(NotifPermState.granted);
    final p = NotificationPermission(backend: fake);
    expect(await p.askOnce(), isFalse);
    expect(fake.requests, 0);
    expect(p.showSettingsRow, isFalse);
  });

  test('first sign-in asks; granted hides the row', () async {
    final fake = _FakePerm(NotifPermState.denied);
    final p = NotificationPermission(backend: fake);
    expect(await p.askOnce(), isTrue);
    expect(fake.requests, 1);
    expect(p.state, NotifPermState.granted);
    expect(p.showSettingsRow, isFalse);
  });

  test('denied: shows the row, and is never asked again automatically', () async {
    final fake = _FakePerm(NotifPermState.denied, afterRequest: NotifPermState.denied);
    final p = NotificationPermission(backend: fake);
    await p.askOnce();
    expect(p.showSettingsRow, isTrue);
    // Next sign-in, next app start (a new instance reads the same saved flag).
    expect(await p.askOnce(), isFalse);
    expect(await NotificationPermission(backend: fake).askOnce(), isFalse);
    expect(fake.requests, 1);
    expect(await p.openSettings(), isTrue);
    expect(fake.opened, 1);
  });

  test('turning it on in the system settings hides the row on refresh', () async {
    final fake = _FakePerm(NotifPermState.denied, afterRequest: NotifPermState.denied);
    final p = NotificationPermission(backend: fake);
    await p.askOnce();
    fake.current = NotifPermState.granted;
    await p.refresh();
    expect(p.showSettingsRow, isFalse);
  });

  test('a failing backend is silent and shows nothing', () async {
    final p = NotificationPermission(backend: _FakePerm(NotifPermState.unknown, throws: true));
    expect(await p.askOnce(), isFalse);
    await p.refresh();
    expect(p.showSettingsRow, isFalse);
  });

  test('PushService asks for the permission even when Firebase fails to start, and only once', () async {
    final fake = _FakePerm(NotifPermState.denied);
    final firebase = _NoFirebase();
    final service = PushService(firebase, permission: NotificationPermission(backend: fake));
    await _start(service);
    expect(firebase.initCalls, 1);
    expect(fake.requests, 1);
    // The socket reconnects: start runs again, the prompt does not.
    await _start(service);
    expect(fake.requests, 1);
    expect(service.active, isFalse);
  });

  test('a denied permission does not stop PushService from finishing', () async {
    final fake = _FakePerm(NotifPermState.denied, afterRequest: NotifPermState.denied);
    final service = PushService(_NoFirebase(), permission: NotificationPermission(backend: fake));
    await expectLater(_start(service), completes);
  });
}
