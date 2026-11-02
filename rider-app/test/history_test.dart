// The Done list: search by order reference and filter by day (pure rules, then on the screen).
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:somba_rider/l10n/strings.dart';
import 'package:somba_rider/screens/deliveries_screen.dart';
import 'package:somba_rider/services/history_filter.dart';
import 'package:somba_rider/services/models.dart';
import 'package:somba_rider/services/rider_store.dart';
import 'package:somba_rider/theme/app_theme.dart';

import 'button_rules.dart';
import 'task_fixtures.dart';

DeliveryTaskDto _done(String id, String ref, {String? deliveredAt, String? updatedAt, String status = 'delivered'}) => DeliveryTaskDto.fromJson({
      ...legJson('delivery', id: id, status: status),
      'orderReference': ref,
      'deliveredAt': deliveredAt,
      'updatedAt': updatedAt,
    });

TransferRun _run(String id, String ref, {String status = 'closed', String? closedAt, List<String> taskIds = const []}) => TransferRun.fromJson({
      'id': id,
      'reference': ref,
      'status': status,
      'riderId': 'r',
      'count': taskIds.length,
      'taskIds': taskIds,
      'receivedCount': taskIds.length,
      'closedAt': closedAt,
    });

void main() {
  group('rules', () {
    test('a reference matches whatever the case, spaces or #', () {
      expect(matchesReference('SOM-1042', 'som-10'), isTrue);
      expect(matchesReference('SOM-1042', ' #1042 '), isTrue);
      expect(matchesReference('SOM-1042', '1043'), isFalse);
      expect(matchesReference('SOM-1042', ''), isTrue);
      expect(matchesReference('SOM-1042', '   '), isTrue);
    });

    test('days are inclusive at both ends, whatever the hour', () {
      final d = DateTime(2026, 10, 20, 23, 59);
      expect(inDayRange(d, DateTime(2026, 10, 20), DateTime(2026, 10, 20)), isTrue);
      expect(inDayRange(d, DateTime(2026, 10, 21), null), isFalse);
      expect(inDayRange(d, null, DateTime(2026, 10, 19)), isFalse);
      expect(inDayRange(d, DateTime(2026, 10, 1), DateTime(2026, 10, 31)), isTrue);
      expect(inDayRange(null, null, null), isTrue);
      expect(inDayRange(null, DateTime(2026, 10, 1), null), isFalse, reason: 'a task with no date cannot be in a range');
    });

    test('a finished leg is dated by when it was delivered, else last touched, else created', () {
      expect(_done('a', 'X', deliveredAt: '2026-10-20T10:00:00.000Z', updatedAt: '2026-10-25T10:00:00.000Z').finishedAt, DateTime.parse('2026-10-20T10:00:00.000Z').toLocal());
      expect(_done('a', 'X', status: 'failed', updatedAt: '2026-10-25T10:00:00.000Z').finishedAt, DateTime.parse('2026-10-25T10:00:00.000Z').toLocal());
      expect(_done('a', 'X').finishedAt, DateTime.parse('2026-10-24T08:00:00.000Z').toLocal(), reason: 'the fixture createdAt');
    });

    test('tasks: search and days combine', () {
      final a = _done('a', 'SOM-1001', deliveredAt: '2026-10-20T10:00:00');
      final b = _done('b', 'SOM-1002', deliveredAt: '2026-10-21T10:00:00');
      final c = _done('c', 'SOM-2001', deliveredAt: '2026-10-21T11:00:00', status: 'failed');
      final all = [a, b, c];
      expect(filterFinishedTasks(all).length, 3);
      expect(filterFinishedTasks(all, query: 'som-100').map((t) => t.id), ['a', 'b']);
      expect(filterFinishedTasks(all, from: DateTime(2026, 10, 21), to: DateTime(2026, 10, 21)).map((t) => t.id), ['b', 'c']);
      expect(filterFinishedTasks(all, query: '2001', from: DateTime(2026, 10, 21), to: DateTime(2026, 10, 22)).map((t) => t.id), ['c']);
      expect(filterFinishedTasks(all, query: 'nope'), isEmpty);
    });

    test('runs: found by their own reference or by the order reference of a parcel inside', () {
      final p = _done('p1', 'SOM-3001', deliveredAt: '2026-10-20T10:00:00');
      final r1 = _run('r1', 'TR-0007', closedAt: '2026-10-20T12:00:00', taskIds: ['p1']);
      final r2 = _run('r2', 'TR-0008', closedAt: '2026-10-22T12:00:00', taskIds: ['p2']);
      List<DeliveryTaskDto> parcels(TransferRun r) => r.id == 'r1' ? [p] : const [];
      expect(filterFinishedRuns([r1, r2], parcels, query: 'tr-0008').map((r) => r.id), ['r2']);
      expect(filterFinishedRuns([r1, r2], parcels, query: '3001').map((r) => r.id), ['r1']);
      expect(filterFinishedRuns([r1, r2], parcels, from: DateTime(2026, 10, 22), to: DateTime(2026, 10, 22)).map((r) => r.id), ['r2']);
      expect(runFinishedAt(_run('x', 'TR-1')), isNull);
    });
  });

  group('on the Done tab', () {
    setUpAll(() async {
      TestWidgetsFlutterBinding.ensureInitialized();
      for (final f in const {'Inter': 'assets/fonts/Inter.ttf', 'PlusJakartaSans': 'assets/fonts/PlusJakartaSans.ttf'}.entries) {
        await (FontLoader(f.key)..addFont(rootBundle.load(f.value))).load();
      }
    });

    Future<void> show(WidgetTester t, String lang, {List<DeliveryTaskDto>? tasks, Future<DateTimeRange?> Function(DateTimeRange?)? pickDays}) async {
      SharedPreferences.setMockInitialValues({});
      await Strings.setLang(lang, persist: false);
      final store = RiderStore.instance;
      store.user = BackendUser(id: 'r', email: 'rider@somba.app', name: 'Jean', role: 'rider', phone: '+243810000000');
      store.loaded = true;
      store.debugResetSession();
      store.myTasks
        ..clear()
        ..addAll(tasks ??
            [
              _done('a', 'SOM-1001', deliveredAt: '2026-10-20T10:00:00'),
              _done('b', 'SOM-1002', deliveredAt: '2026-10-21T10:00:00'),
              _done('c', 'SOM-2001', deliveredAt: '2026-10-21T11:00:00', status: 'failed'),
            ]);
      t.view.physicalSize = const Size(360 * 3, 740 * 3);
      t.view.devicePixelRatio = 3;
      addTearDown(t.view.reset);
      addTearDown(() {
        store.user = null;
        store.myTasks.clear();
        store.debugResetSession();
      });
      await t.pumpWidget(MaterialApp(
        locale: Locale(lang),
        supportedLocales: const [Locale('en'), Locale('fr')],
        localizationsDelegates: const [GlobalMaterialLocalizations.delegate, GlobalWidgetsLocalizations.delegate, GlobalCupertinoLocalizations.delegate],
        theme: AppTheme.light(),
        home: Scaffold(body: DeliveriesScreen(pickDays: pickDays)),
      ));
      await t.pump(const Duration(milliseconds: 600));
      await t.tap(find.byKey(const ValueKey('tab-1')));
      await t.pump(const Duration(milliseconds: 300));
    }

    testWidgets('the search narrows the list by order reference, and clearing brings everything back', (t) async {
      await show(t, 'en');
      expect(find.byKey(const ValueKey('history-search')), findsOneWidget);
      expect(find.byKey(const ValueKey('task-a'), skipOffstage: false), findsOneWidget);
      expect(find.byKey(const ValueKey('task-c'), skipOffstage: false), findsOneWidget);

      await t.enterText(find.byKey(const ValueKey('history-search')), 'som-2001');
      await t.pump();
      expect(find.byKey(const ValueKey('task-c'), skipOffstage: false), findsOneWidget);
      expect(find.byKey(const ValueKey('task-a'), skipOffstage: false), findsNothing);
      expect(find.byKey(const ValueKey('task-b'), skipOffstage: false), findsNothing);

      await t.enterText(find.byKey(const ValueKey('history-search')), 'zzz');
      await t.pump();
      expect(find.byKey(const ValueKey('empty-tasks')), findsOneWidget);
      expect(find.text(Strings('en').historyNoMatch), findsOneWidget);

      await t.tap(find.byKey(const ValueKey('history-search-clear')));
      await t.pump();
      expect(find.byKey(const ValueKey('task-a'), skipOffstage: false), findsOneWidget);
      expect(find.byKey(const ValueKey('task-b'), skipOffstage: false), findsOneWidget);
      expectButtonRules(t);
    });

    testWidgets('the Active tab has no search bar, and nothing finished means no bar either', (t) async {
      await show(t, 'en');
      await t.tap(find.byKey(const ValueKey('tab-0')));
      await t.pump(const Duration(milliseconds: 300));
      expect(find.byKey(const ValueKey('history-search')), findsNothing);
      await show(t, 'en', tasks: const []);
      expect(find.byKey(const ValueKey('history-search')), findsNothing);
      expect(find.text(Strings('en').emptyDone), findsOneWidget);
    });

    for (final lang in ['en', 'fr']) {
      testWidgets('the date filter keeps the days picked, shows them in the rider\'s language and clears ($lang)', (t) async {
        final s = Strings(lang);
        await show(t, lang, pickDays: (_) async => DateTimeRange(start: DateTime(2026, 10, 21), end: DateTime(2026, 10, 21)));
        expect(find.text(s.historyAnyDate), findsOneWidget);
        expect(find.byKey(const ValueKey('history-date-clear')), findsNothing);
        await t.tap(find.byKey(const ValueKey('history-date')));
        await t.pump(const Duration(milliseconds: 300));
        expect(find.text(s.historyAnyDate), findsNothing, reason: 'the chip now names the day');
        expect(find.text(MaterialLocalizations.of(t.element(find.byType(Scaffold).first)).formatShortDate(DateTime(2026, 10, 21))), findsOneWidget);
        expect(find.byKey(const ValueKey('task-a'), skipOffstage: false), findsNothing, reason: 'delivered on the 20th');
        expect(find.byKey(const ValueKey('task-b'), skipOffstage: false), findsOneWidget);
        expect(find.byKey(const ValueKey('task-c'), skipOffstage: false), findsOneWidget);

        // days and search together
        await t.enterText(find.byKey(const ValueKey('history-search')), '1002');
        await t.pump();
        expect(find.byKey(const ValueKey('task-b'), skipOffstage: false), findsOneWidget);
        expect(find.byKey(const ValueKey('task-c'), skipOffstage: false), findsNothing);

        await t.tap(find.byKey(const ValueKey('history-date-clear')));
        await t.pump();
        expect(find.text(s.historyAnyDate), findsOneWidget);
        await t.tap(find.byKey(const ValueKey('history-search-clear')));
        await t.pump();
        expect(find.byKey(const ValueKey('task-a'), skipOffstage: false), findsOneWidget);
        expect(find.byKey(const ValueKey('task-c'), skipOffstage: false), findsOneWidget);
        expectButtonRules(t);
        expect(t.takeException(), isNull);
      });
    }

    testWidgets('the real date picker opens in the rider\'s language and can be dismissed', (t) async {
      await show(t, 'fr');
      await t.tap(find.byKey(const ValueKey('history-date')));
      await t.pumpAndSettle();
      expect(find.byType(DateRangePickerDialog), findsOneWidget);
      await t.tap(find.byType(CloseButton));
      await t.pumpAndSettle();
      expect(find.byType(DateRangePickerDialog), findsNothing);
      expect(find.text(Strings('fr').historyAnyDate), findsOneWidget);
    });
  });
}
