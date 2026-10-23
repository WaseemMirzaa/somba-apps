// Push notifications are optional: they must never break a build or a test, must
// register/refresh the device token once Firebase is available, and a tap on a
// delivery notice must open that delivery (Available for a new one, Active once
// it is the rider's).
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:somba_rider/l10n/strings.dart';
import 'package:somba_rider/screens/rider_shell.dart';
import 'package:somba_rider/services/models.dart';
import 'package:somba_rider/services/push_service.dart';
import 'package:somba_rider/services/rider_focus.dart';
import 'package:somba_rider/services/rider_store.dart';
import 'package:somba_rider/theme/app_theme.dart';

class _FakeBackend implements PushBackend {
  _FakeBackend({this.configured = true, this.allowed = true, this.launchedBy});

  final bool configured;
  final bool allowed;
  final PushMessage? launchedBy;
  final String? firstToken = 'tok-1';
  final refreshes = StreamController<String>.broadcast();
  final messages = StreamController<PushMessage>.broadcast();
  final opened = StreamController<PushMessage>.broadcast();
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
  Stream<PushMessage> get foregroundMessages => messages.stream;
  @override
  Stream<PushMessage> get openedMessages => opened.stream;
  @override
  Future<PushMessage?> initialMessage() async => launchedBy;
  @override
  String get platform => 'android';
}

PushMessage _task(String taskId, String view) => PushMessage(
      title: 'New delivery available',
      body: 'SOM-77 · Gombe',
      data: {'type': 'task', 'entityId': taskId, 'orderId': 'o-77', 'view': view, 'notificationId': 'n-$taskId', 'link': '/rider/tasks/$taskId'},
    );

DeliveryTaskDto _dto(String id, String status, {String? zoneName, bool preferred = false}) => DeliveryTaskDto(
      id: id,
      orderId: 'o-$id',
      orderReference: 'SOM-$id',
      status: status,
      codAmountUsd: 0,
      customerName: 'Marie Dubois',
      zoneName: zoneName,
      preferred: preferred,
    );

void main() {
  group('PushService', () {
    test('registers the token after sign-in, again when it rotates, and refreshes on a foreground push', () async {
      final backend = _FakeBackend();
      final service = PushService(backend);
      final registered = <String>[];
      var pushes = 0;

      await service.start(register: (t, p) async => registered.add('$t@$p'), onMessage: (_) => pushes++);
      expect(registered, ['tok-1@android']);
      expect(service.active, isTrue);

      backend.refreshes.add('tok-2');
      await Future<void>.delayed(Duration.zero);
      expect(registered, ['tok-1@android', 'tok-2@android']);

      backend.messages.add(_task('t1', 'available'));
      await Future<void>.delayed(Duration.zero);
      expect(pushes, 1);

      await service.stop();
      expect(service.active, isFalse);
      backend.refreshes.add('tok-3');
      backend.messages.add(_task('t2', 'available'));
      await Future<void>.delayed(Duration.zero);
      expect(registered, hasLength(2), reason: 'nothing happens after sign-out');
      expect(pushes, 1);
    });

    test('a background tap and the tap that launched the app are held for the app', () async {
      final backend = _FakeBackend(launchedBy: _task('t9', 'available'));
      final service = PushService(backend);
      await service.start(register: (t, p) async {}, onMessage: (_) {});
      expect(service.takeTap()?.entityId, 't9');
      backend.opened.add(_task('t3', 'active'));
      await Future<void>.delayed(Duration.zero);
      expect(service.pendingTap.value?.data['view'], 'active');
    });

    test('does nothing, silently, when the build has no Firebase configuration', () async {
      final backend = _FakeBackend(configured: false);
      final service = PushService(backend);
      var called = false;
      await service.start(register: (t, p) async => called = true, onMessage: (_) {});
      expect(called, isFalse);
      expect(backend.permissionAsked, 0, reason: 'no permission prompt without Firebase');
      expect(service.active, isFalse);
    });

    test('does not register when the user declines the notification permission', () async {
      final backend = _FakeBackend(allowed: false);
      final service = PushService(backend);
      var called = false;
      await service.start(register: (t, p) async => called = true, onMessage: (_) {});
      expect(backend.permissionAsked, 1);
      expect(called, isFalse);
    });

    test('a failing registration (offline) never throws into the app', () async {
      final service = PushService(_FakeBackend());
      await service.start(register: (t, p) async => throw StateError('offline'), onMessage: (_) {});
      expect(service.token, 'tok-1');
    });

    test('the real Firebase backend reports "not configured" instead of throwing (no Firebase config here)', () async {
      TestWidgetsFlutterBinding.ensureInitialized();
      expect(await FirebasePushBackend().initialize(), isFalse);
      final service = PushService(FirebasePushBackend());
      await service.start(register: (t, p) async {}, onMessage: (_) {});
      expect(service.active, isFalse);
    });
  });

  group('where a notification opens', () {
    bool mine(String id) => id == 'mine';

    test('a new delivery opens Available; an assigned one opens Active', () {
      expect(riderFocusFor('task', entityId: 't1', view: 'available', isMine: mine), const RiderFocus.deliveries(RiderFocus.available, taskId: 't1'));
      expect(riderFocusFor('task', entityId: 't1', view: 'active', isMine: mine), const RiderFocus.deliveries(RiderFocus.active, taskId: 't1'));
    });

    test('from the in-app list (no view) it depends on whether the task is already the rider\'s', () {
      expect(riderFocusFor('task', entityId: 'mine', isMine: mine).deliveriesTab, RiderFocus.active);
      expect(riderFocusFor('task', entityId: 'open', isMine: mine).deliveriesTab, RiderFocus.available);
    });

    test('anything else opens the profile, where the notifications are', () {
      expect(riderFocusFor('payout', isMine: mine), const RiderFocus.profile());
      expect(riderFocusFor('delivery', entityId: 'o1', isMine: mine).tab, RiderFocus.deliveriesIndex);
    });
  });

  group('the app follows a tap', () {
    setUpAll(() async {
      TestWidgetsFlutterBinding.ensureInitialized();
      for (final f in const {'Inter': 'assets/fonts/Inter.ttf', 'PlusJakartaSans': 'assets/fonts/PlusJakartaSans.ttf'}.entries) {
        await (FontLoader(f.key)..addFont(rootBundle.load(f.value))).load();
      }
    });

    Future<void> show(WidgetTester t, String lang) async {
      SharedPreferences.setMockInitialValues({});
      await Strings.setLang(lang, persist: false);
      final store = RiderStore.instance;
      store.user = BackendUser(id: 'r', email: 'rider@somba.app', name: 'Jean', role: 'rider', phone: '+243810000000');
      store.loaded = true;
      store.myTasks
        ..clear()
        ..add(_dto('mine', 'assigned'));
      store.pool
        ..clear()
        ..add(_dto('open', 'unassigned', zoneName: 'Gombe', preferred: true));
      store.assignment = const RiderAssignment(hubName: 'Kinshasa Hub', hubCity: 'Kinshasa', preferredZones: ['Gombe'], hubZones: ['Gombe', 'Limete']);
      t.view.physicalSize = const Size(360 * 3, 740 * 3);
      t.view.devicePixelRatio = 3;
      addTearDown(t.view.reset);
      addTearDown(() {
        store.user = null;
        store.myTasks.clear();
        store.pool.clear();
        store.assignment = null;
        store.focus.value = null;
      });
      await t.pumpWidget(MaterialApp(
        locale: Locale(lang),
        supportedLocales: const [Locale('en'), Locale('fr')],
        localizationsDelegates: const [GlobalMaterialLocalizations.delegate, GlobalWidgetsLocalizations.delegate, GlobalCupertinoLocalizations.delegate],
        theme: AppTheme.light(),
        home: RiderShell(locale: Locale(lang), onLocaleChanged: (_) {}),
      ));
      await t.pump(const Duration(milliseconds: 600));
    }

    for (final lang in ['en', 'fr']) {
      testWidgets('a "new delivery" tap from the profile tab opens Available, with the zone shown ($lang)', (t) async {
        await show(t, lang);
        final s = Strings(lang);
        // Start on Profile, where the warehouse is shown.
        RiderStore.instance.focus.value = const RiderFocus.profile();
        await t.pump(const Duration(milliseconds: 600));
        expect(find.byKey(const ValueKey('where-i-work')), findsOneWidget);
        expect(find.textContaining('Kinshasa Hub'), findsOneWidget);
        expect(RiderStore.instance.focus.value, isNull, reason: 'the shell clears a profile request');

        RiderStore.instance.openNotice(type: 'task', entityId: 'open', view: 'available');
        await t.pump(const Duration(milliseconds: 600));
        expect(find.byKey(const ValueKey('pool-SOM-open')), findsOneWidget);
        expect(find.byKey(const ValueKey('your-zone-SOM-open')), findsOneWidget);
        expect(find.text(s.zoneLabel('Gombe')), findsOneWidget);
        expect(RiderStore.instance.focus.value, isNull, reason: 'cleared once shown');
        expect(t.takeException(), isNull);
      });

      testWidgets('an "assigned to you" tap opens Active ($lang)', (t) async {
        await show(t, lang);
        RiderStore.instance.openNotice(type: 'task', entityId: 'mine', view: 'active');
        await t.pump(const Duration(milliseconds: 600));
        expect(find.byKey(const ValueKey('task-SOM-mine')), findsOneWidget);
        expect(find.byKey(const ValueKey('pool-SOM-open')), findsNothing);
        expect(t.takeException(), isNull);
      });
    }
  });
}
