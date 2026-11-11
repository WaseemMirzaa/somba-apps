// The notification chime in the rider app: one per 2 s, the Sound switch (default on, saved), every notice type and
// every task alert sounds, and the switch shows on the Profile screen. A fake player stands in for SystemSound.
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:somba_rider/l10n/strings.dart';
import 'package:somba_rider/screens/profile_screen.dart';
import 'package:somba_rider/services/models.dart';
import 'package:somba_rider/services/notification_sound.dart';
import 'package:somba_rider/services/rider_store.dart';
import 'package:somba_rider/theme/app_theme.dart';

import 'task_fixtures.dart';

/// Every notice type the API sends: the page links and the service's own types, read from the API sources.
Set<String> apiNoticeTypes() {
  final links = File('../api/src/notifications/links.ts').readAsStringSync();
  final service = File('../api/src/notifications/notifications.service.ts').readAsStringSync();
  return {
    ...RegExp(r"t === '([a-z_]+)'").allMatches(links).map((m) => m.group(1)!),
    ...RegExp(r"type: '([a-z_]+)'").allMatches(service).map((m) => m.group(1)!),
    'task', 'marketing', 'chat', 'system',
  }..removeAll({'varchar', 'text', 'int', 'datetime', 'float', 'boolean', 'double'});
}

void main() {
  late int plays;
  late DateTime now;
  late NotificationSound saved;

  setUp(() {
    SharedPreferences.setMockInitialValues({});
    plays = 0;
    now = DateTime(2026, 11, 11, 12);
    saved = NotificationSound.instance;
    NotificationSound.instance = NotificationSound(player: () => plays++, clock: () => now);
  });
  tearDown(() => NotificationSound.instance = saved);

  test('on by default; at most one chime per 2 seconds; off is silent; the choice is saved', () async {
    final s = NotificationSound.instance;
    expect(s.enabled, isTrue);
    expect(s.play(), isTrue);
    now = now.add(const Duration(milliseconds: 1900));
    expect(s.play(), isFalse);
    now = now.add(const Duration(milliseconds: 200));
    expect(s.play(), isTrue);
    expect(plays, 2);
    await s.setEnabled(false);
    now = now.add(const Duration(seconds: 5));
    expect(s.play(), isFalse);
    final again = NotificationSound(player: () => plays++);
    await again.load();
    expect(again.enabled, isFalse);
    expect(NotificationSound(player: () => throw StateError('no audio')).play(), isFalse);
  });

  test('every notice type the API sends sounds in the rider app', () {
    final store = RiderStore.instance;
    final types = apiNoticeTypes();
    expect(types.length, greaterThan(20), reason: 'the API type list was read');
    var n = 0;
    for (final t in types) {
      now = now.add(const Duration(seconds: 3)); // clear the throttle between notices
      final before = plays;
      store.applyNotificationPush({'id': 'n${n++}', 'title': 'Something', 'body': 'x', 'type': t});
      expect(plays, before + 1, reason: 'notice type $t');
    }
  });

  test('a task assigned to this rider sounds (a task push with a new id); an update of a known one does not', () {
    final store = RiderStore.instance;
    store.user = BackendUser(id: 'r', email: 'rider@somba.app', name: 'Jean', role: 'rider', phone: '+243810000000');
    store.myTasks.clear();
    store.applyTaskPush(legJson('pickup', id: 'a', withOrder: false));
    expect(plays, 1);
    now = now.add(const Duration(seconds: 3));
    store.applyTaskPush(legJson('pickup', id: 'a', status: 'in_transit', withOrder: false));
    expect(plays, 1, reason: 'a status change of a task already on the list has its own notice');
  });

  testWidgets('Profile shows the Sound switch; flipping it turns the chime off and saves it', (t) async {
    await Strings.setLang('fr', persist: false);
    t.view.physicalSize = const Size(360 * 3, 740 * 3);
    t.view.devicePixelRatio = 3;
    addTearDown(t.view.reset);
    await t.pumpWidget(MaterialApp(
      locale: const Locale('fr'),
      supportedLocales: const [Locale('en'), Locale('fr')],
      localizationsDelegates: const [GlobalMaterialLocalizations.delegate, GlobalWidgetsLocalizations.delegate, GlobalCupertinoLocalizations.delegate],
      theme: AppTheme.light(),
      home: Scaffold(body: ProfileScreen(locale: const Locale('fr'), onLocaleChanged: (_) {})),
    ));
    await t.pump(const Duration(milliseconds: 300));
    final sw = find.byKey(const ValueKey('sound-switch'));
    await t.ensureVisible(sw);
    await t.pump();
    expect(sw, findsOneWidget);
    expect(find.text('Son des notifications'), findsOneWidget);
    expect(t.widget<Switch>(sw).value, isTrue);
    await t.tap(sw);
    await t.pump();
    expect(t.widget<Switch>(sw).value, isFalse);
    expect(NotificationSound.instance.play(), isFalse);
    expect((await SharedPreferences.getInstance()).getBool(NotificationSound.prefKey), isFalse);
  });
}
