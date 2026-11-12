// The notification chime: one per 2 s, the Sound switch (default on, saved), every notice type sounds, and the switch
// shows in Settings. A fake player stands in for SystemSound, so no audio is played.
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lipcart/l10n/strings.dart';
import 'package:lipcart/screens/more/settings_extra.dart';
import 'package:lipcart/services/notification_sound.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'gap_helpers.dart';
import 'social_helpers.dart';

/// Every notice type the API sends: the page links and the service's own types, read from the API sources.
Set<String> apiNoticeTypes() {
  final links = File('../api/src/notifications/links.ts').readAsStringSync();
  final service = File('../api/src/notifications/notifications.service.ts').readAsStringSync();
  return {
    ...RegExp(r"t === '([a-z_]+)'").allMatches(links).map((m) => m.group(1)!),
    ...RegExp(r"type: '([a-z_]+)'").allMatches(service).map((m) => m.group(1)!),
    ...RegExp(r"type: '([a-z_]+)'").allMatches(File('../api/src/users/notify-prefs.ts').readAsStringSync()).map((m) => m.group(1)!),
    'task', 'marketing', 'chat', 'system',
  }..removeAll({'varchar', 'text', 'int', 'datetime', 'float', 'boolean', 'double'});
}

void main() {
  setUpAll(() async {
    await initializeDateFormatting();
    await gapLoadFonts();
  });

  group('throttle and switch', () {
    late int plays;
    late DateTime now;
    late NotificationSound sound;
    setUp(() {
      SharedPreferences.setMockInitialValues({});
      plays = 0;
      now = DateTime(2026, 11, 11, 12);
      sound = NotificationSound(player: () => plays++, clock: () => now);
    });

    test('on by default; at most one chime per 2 seconds', () {
      expect(sound.enabled, isTrue);
      expect(sound.play(), isTrue);
      now = now.add(const Duration(milliseconds: 1900));
      expect(sound.play(), isFalse);
      now = now.add(const Duration(milliseconds: 200));
      expect(sound.play(), isTrue);
      expect(plays, 2);
    });

    test('off means silent, on again plays', () async {
      await sound.setEnabled(false);
      expect(sound.play(), isFalse);
      await sound.setEnabled(true);
      expect(sound.play(), isTrue);
      expect(plays, 1);
    });

    test('the choice is saved and read back', () async {
      await sound.setEnabled(false);
      final again = NotificationSound(player: () => plays++);
      await again.load();
      expect(again.enabled, isFalse);
    });

    test('a player that throws never throws out of play()', () {
      final bad = NotificationSound(player: () => throw StateError('no audio'));
      expect(bad.play(), isFalse);
    });
  });

  test('every notice type the API sends sounds, except a chat notice (messaging stores is closed)', () {
    final types = apiNoticeTypes();
    expect(types.length, greaterThan(20), reason: 'the API type list was read');
    expect(types, containsAll(['order', 'payment', 'delivery', 'return', 'dispute', 'support', 'campaign', 'chat', 'task']));
    for (final t in types) {
      expect(isSilentNotice(t), t == 'chat', reason: t);
    }
  });

  testWidgets('Settings shows the Sound switch; flipping it turns the chime off and saves it', (t) async {
    SharedPreferences.setMockInitialValues({});
    final plays = <int>[];
    final saved = NotificationSound.instance;
    NotificationSound.instance = NotificationSound(player: () => plays.add(1));
    addTearDown(() => NotificationSound.instance = saved);
    final server = await socialReset();
    addTearDown(socialTearDown);
    expect(server, isNotNull);
    gapTallViewport(t);
    await Strings.setLang('fr', persist: false);
    await t.pumpWidget(gapApp(const CustomerSettingsScreen(), lang: 'fr'));
    await t.pump(const Duration(milliseconds: 300));
    final sw = find.byKey(const ValueKey('sound-switch'));
    expect(sw, findsOneWidget);
    expect(find.text('Son des notifications'), findsOneWidget);
    expect(t.widget<SwitchListTile>(sw).value, isTrue);
    await t.tap(sw);
    await t.pump();
    expect(t.widget<SwitchListTile>(sw).value, isFalse);
    expect(NotificationSound.instance.play(), isFalse);
    expect((await SharedPreferences.getInstance()).getBool(NotificationSound.prefKey), isFalse);
  });
}
