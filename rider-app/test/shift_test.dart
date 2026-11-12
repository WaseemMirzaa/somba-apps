// Shift & attendance: the models, the store (over the rider's socket), and the screen reached from Profile, in English
// and French: start, break, end, the last 7 days, auto-closed shifts, failures, and the layout on a small phone.
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:somba_rider/l10n/messages.dart';
import 'package:somba_rider/l10n/shift_strings.dart';
import 'package:somba_rider/l10n/strings.dart';
import 'package:somba_rider/screens/profile_screen.dart';
import 'package:somba_rider/screens/shift_screen.dart';
import 'package:somba_rider/services/auth_service.dart';
import 'package:somba_rider/services/models.dart';
import 'package:somba_rider/services/rider_store.dart';
import 'package:somba_rider/services/shift_models.dart';
import 'package:somba_rider/services/shift_store.dart';
import 'package:somba_rider/theme/app_theme.dart';

import 'button_rules.dart';

/// A server that keeps one rider's shifts, answering `shift:*` the way docs/contracts/rider-shift.md says.
class FakeShiftServer {
  final List<Map<String, dynamic>> shifts = []; // closed shifts, newest first
  Map<String, dynamic>? open;
  DateTime? breakStarted;
  final calls = <String>[];
  Object? failWith;

  String _iso(DateTime t) => t.toUtc().toIso8601String();

  Map<String, dynamic> _view(Map<String, dynamic> s) => {...s};

  Map<String, dynamic> summary() {
    final all = [if (open != null) _view(open!), ...shifts];
    final minutes = all.fold<int>(0, (a, s) => a + (s['workedMinutes'] as int));
    return {
      'status': open == null ? 'off' : (breakStarted != null ? 'break' : 'on'),
      'current': open == null ? null : _view(open!),
      'lastShift': shifts.isEmpty ? null : shifts.first,
      'minutesLast7Days': minutes,
      'shiftsLast7Days': all.length,
      'shifts': all,
      'now': _iso(DateTime.now()),
    };
  }

  Future<dynamic> call(String event, Map<String, dynamic>? body) async {
    calls.add(event);
    if (failWith != null) throw failWith!;
    final now = DateTime.now();
    switch (event) {
      case 'shift:mine':
        break;
      case 'shift:clockIn':
        open ??= {'id': 'open1', 'startedAt': _iso(now), 'endedAt': null, 'breakMinutes': 0, 'onBreak': false, 'breakStartedAt': null, 'workedMinutes': 0, 'endReason': null};
      case 'shift:breakStart':
        if (open == null) throw ApiException('Start your shift first.');
        breakStarted ??= now;
        open = {...open!, 'onBreak': true, 'breakStartedAt': _iso(breakStarted!)};
      case 'shift:breakEnd':
        if (open != null && breakStarted != null) {
          breakStarted = null;
          open = {...open!, 'onBreak': false, 'breakStartedAt': null, 'breakMinutes': 12, 'workedMinutes': 30};
        }
      case 'shift:clockOut':
        if (open != null) {
          shifts.insert(0, {...open!, 'endedAt': _iso(now), 'endReason': 'rider', 'onBreak': false, 'breakStartedAt': null, 'workedMinutes': 95});
          open = null;
          breakStarted = null;
        }
      default:
        throw StateError('unexpected $event');
    }
    return summary();
  }
}

Map<String, dynamic> _closed(String id, DateTime start, int worked, {int breaks = 0, String reason = 'rider'}) => {
      'id': id,
      'startedAt': start.toUtc().toIso8601String(),
      'endedAt': start.add(Duration(minutes: worked + breaks)).toUtc().toIso8601String(),
      'breakMinutes': breaks,
      'onBreak': false,
      'breakStartedAt': null,
      'workedMinutes': worked,
      'endReason': reason,
    };

void main() {
  setUpAll(() async {
    TestWidgetsFlutterBinding.ensureInitialized();
    for (final f in const {'Inter': 'assets/fonts/Inter.ttf', 'PlusJakartaSans': 'assets/fonts/PlusJakartaSans.ttf'}.entries) {
      await (FontLoader(f.key)..addFont(rootBundle.load(f.value))).load();
    }
  });

  late FakeShiftServer server;
  final overflows = <String>[];

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    await Strings.setLang('en', persist: false);
    overflows.clear();
    server = FakeShiftServer();
    ShiftStore.instance.clear();
    final store = RiderStore.instance;
    store.user = BackendUser(id: 'r', email: 'rider@somba.app', name: 'Jean Mukendi', role: 'rider');
    store.loaded = true;
    store.transport = (event, body) => server.call(event, body);
  });

  tearDown(() {
    RiderStore.instance.transport = null;
    RiderStore.instance.user = null;
    ShiftStore.instance.clear();
  });

  group('models', () {
    test('durations read the same in both languages', () {
      expect(formatDuration(0), '0 min');
      expect(formatDuration(45), '45 min');
      expect(formatDuration(60), '1 h 00 min');
      expect(formatDuration(125), '2 h 05 min');
      expect(formatDuration(-4), '0 min');
    });

    test('a summary is read from the server answer, in local time; bad rows are skipped', () {
      final now = DateTime.utc(2026, 3, 10, 9, 0);
      final sum = ShiftSummary.fromJson({
        'status': 'break',
        'current': {'id': 'a', 'startedAt': '2026-03-10T08:00:00.000Z', 'endedAt': null, 'breakMinutes': 15, 'onBreak': true, 'workedMinutes': 45, 'endReason': null},
        'lastShift': _closed('b', DateTime.utc(2026, 3, 9, 8), 480, breaks: 30, reason: 'auto'),
        'minutesLast7Days': 525,
        'shifts': [
          {'id': 'a', 'startedAt': '2026-03-10T08:00:00.000Z', 'workedMinutes': 45},
          {'nonsense': true},
          'x',
          _closed('b', DateTime.utc(2026, 3, 9, 8), 480, breaks: 30, reason: 'auto'),
        ],
      }, now: now);
      expect(sum.status, ShiftStatus.onBreak);
      expect(sum.onShift, isTrue);
      expect(sum.current!.isOpen, isTrue);
      expect(sum.current!.startedAt.isUtc, isFalse);
      expect(sum.current!.startedAt.toUtc(), DateTime.utc(2026, 3, 10, 8));
      expect(sum.shifts.map((s) => s.id), ['a', 'b']);
      expect(sum.lastShift!.closedAutomatically, isTrue);
    });

    test('an open shift keeps counting after the snapshot, except while on a break', () {
      final seen = DateTime(2026, 3, 10, 9);
      ShiftDto open({bool onBreak = false}) => ShiftDto(id: 'a', startedAt: DateTime(2026, 3, 10, 8), onBreak: onBreak, workedMinutes: 60, seenAt: seen);
      expect(open().workedAt(seen.add(const Duration(minutes: 20))), 80);
      expect(open(onBreak: true).workedAt(seen.add(const Duration(minutes: 20))), 60);
      expect(open().workedAt(seen.subtract(const Duration(minutes: 5))), 60, reason: 'a clock that ran back never subtracts');
      final closed = ShiftDto(id: 'b', startedAt: DateTime(2026, 3, 9, 8), endedAt: DateTime(2026, 3, 9, 16), workedMinutes: 480, seenAt: seen);
      expect(closed.workedAt(seen.add(const Duration(hours: 5))), 480);
    });

    test('an answer that is not a summary is refused by the store and leaves the state alone', () {
      ShiftStore.instance.applyPush({'status': 'on', 'current': null, 'shifts': []});
      expect(ShiftStore.instance.summary!.status, ShiftStatus.on);
      ShiftStore.instance.applyPush('garbage');
      expect(ShiftStore.instance.summary!.status, ShiftStatus.on);
    });
  });

  group('store', () {
    test('load reads shift:mine; clock in, break, end break and clock out go over the socket and update the state', () async {
      final st = ShiftStore.instance;
      await st.load();
      expect(server.calls, ['shift:mine']);
      expect(st.summary!.status, ShiftStatus.off);
      await st.clockIn();
      expect(st.summary!.status, ShiftStatus.on);
      await st.startBreak();
      expect(st.summary!.status, ShiftStatus.onBreak);
      await st.endBreak();
      expect(st.summary!.status, ShiftStatus.on);
      await st.clockOut();
      expect(st.summary!.status, ShiftStatus.off);
      expect(st.summary!.lastShift, isNotNull);
      expect(server.calls, ['shift:mine', 'shift:clockIn', 'shift:breakStart', 'shift:breakEnd', 'shift:clockOut']);
      expect(st.busy, isFalse);
    });

    test('a refusal throws, leaves the state as it was and is not stuck busy', () async {
      final st = ShiftStore.instance;
      await st.load();
      await expectLater(st.startBreak(), throwsA(isA<ApiException>()));
      expect(st.summary!.status, ShiftStatus.off);
      expect(st.busy, isFalse);
    });

    test('a failed read keeps the older state and says so; the next good read clears it', () async {
      final st = ShiftStore.instance;
      await st.clockIn();
      server.failWith = ApiException.local('err_offline');
      await st.load();
      expect(st.loadError, isNotNull);
      expect(st.summary!.status, ShiftStatus.on);
      server.failWith = null;
      await st.load();
      expect(st.loadError, isNull);
    });

    test('a second tap while one is in flight sends nothing more', () async {
      final st = ShiftStore.instance;
      final a = st.clockIn();
      final b = st.clockIn();
      await Future.wait([a, b]);
      expect(server.calls.where((c) => c == 'shift:clockIn'), hasLength(1));
    });

    test('a shift:updated push replaces the state (another phone, or the server closing a forgotten shift); sign-out clears it', () async {
      final st = ShiftStore.instance;
      await st.clockIn();
      st.applyPush({'status': 'off', 'current': null, 'lastShift': _closed('x', DateTime.utc(2026, 3, 9, 8), 960, reason: 'auto'), 'minutesLast7Days': 960, 'shifts': []});
      expect(st.summary!.status, ShiftStatus.off);
      expect(st.summary!.lastShift!.closedAutomatically, isTrue);
      st.clear();
      expect(st.summary, isNull);
    });

    test('RiderStore sign-out forgets the shift state of the account', () async {
      await ShiftStore.instance.clockIn();
      await RiderStore.instance.logout();
      expect(ShiftStore.instance.summary, isNull);
    });
  });

  group('server messages', () {
    test('the shift refusals are shown in French', () {
      const fr = Strings('fr');
      expect(fr.serverError('Start your shift first.'), 'Commencez d’abord votre service.');
      expect(fr.serverError('Riders only.'), 'Réservé aux livreurs.');
      expect(fr.serverError('Rider not found.'), 'Livreur introuvable.');
      expect(fr.serverError('Your account is switched off. Ask an administrator.'), startsWith('Votre compte est désactivé'));
    });

    test('every shift text exists in both languages', () {
      for (final k in kMessages.keys.where((k) => k.startsWith('shift_'))) {
        final m = kMessages[k]!;
        expect(m.$1.trim(), isNotEmpty, reason: k);
        expect(m.$2.trim(), isNotEmpty, reason: k);
        expect(m.$1 == m.$2, isFalse, reason: '$k is not translated');
      }
    });
  });

  group('screen', () {
    Future<void> open(WidgetTester t, String lang, {double textScale = 1}) async {
      await Strings.setLang(lang, persist: false);
      final previous = FlutterError.onError;
      FlutterError.onError = (d) {
        if (d.exceptionAsString().contains('overflowed')) {
          overflows.add(d.exceptionAsString().split('\n').first);
        } else {
          previous?.call(d);
        }
      };
      addTearDown(() => FlutterError.onError = previous);
      t.view.physicalSize = const Size(360 * 3, 740 * 3);
      t.view.devicePixelRatio = 3;
      addTearDown(t.view.reset);
      await t.pumpWidget(MaterialApp(
        locale: Locale(lang),
        supportedLocales: const [Locale('en'), Locale('fr')],
        localizationsDelegates: const [GlobalMaterialLocalizations.delegate, GlobalWidgetsLocalizations.delegate, GlobalCupertinoLocalizations.delegate],
        theme: AppTheme.light(),
        builder: (context, child) => MediaQuery(data: MediaQuery.of(context).copyWith(textScaler: TextScaler.linear(textScale)), child: child!),
        home: Scaffold(body: ProfileScreen(locale: Locale(lang), onLocaleChanged: (_) {})),
      ));
      await t.pump(const Duration(milliseconds: 300));
      await t.ensureVisible(find.byKey(const ValueKey('shift-entry')));
      await t.pumpAndSettle();
      overflows.clear(); // what the Profile page itself does at large text is not this screen's concern
      await t.tap(find.byKey(const ValueKey('shift-entry')));
      await t.pumpAndSettle();
    }

    for (final lang in ['en', 'fr']) {
      testWidgets('Profile has the entry; the screen starts off shift with one filled button ($lang)', (t) async {
        final s = Strings(lang);
        await open(t, lang);
        expect(find.byType(ShiftScreen), findsOneWidget);
        expect(find.text(s.shiftTitle), findsWidgets);
        expect(find.text(s.shiftStatusOff), findsOneWidget);
        expect(find.text(s.shiftNotClocked), findsOneWidget);
        expect(find.text(s.shiftStart), findsOneWidget);
        expect(find.text(s.shiftHistoryEmpty), findsOneWidget);
        expectButtonRules(t);
        expect(overflows, isEmpty);
      });

      testWidgets('start, break, resume and end walk through the states and say what happened ($lang)', (t) async {
        final s = Strings(lang);
        await open(t, lang);

        await t.tap(find.byKey(const ValueKey('shift-start')));
        await t.pumpAndSettle();
        expect(server.calls.last, 'shift:clockIn');
        expect(find.text(s.shiftStatusOn), findsOneWidget);
        expect(find.text(s.shiftDoneStart), findsOneWidget, reason: 'the snackbar');
        expect(find.text(s.shiftBreakStart), findsOneWidget);
        expect(find.text(s.shiftEnd), findsOneWidget);
        expect(find.byKey(const ValueKey('shift-start')), findsNothing);
        expectButtonRules(t);

        await t.tap(find.byKey(const ValueKey('shift-break')));
        await t.pumpAndSettle();
        expect(find.text(s.shiftStatusBreak), findsOneWidget);
        expect(find.text(s.shiftDoneBreakStart), findsOneWidget);
        expect(find.text(s.shiftBreakEnd), findsOneWidget);

        await t.tap(find.byKey(const ValueKey('shift-break')));
        await t.pumpAndSettle();
        expect(find.text(s.shiftStatusOn), findsOneWidget);
        expect(find.text(s.shiftDoneBreakEnd), findsOneWidget);

        // ending asks first; "cancel" changes nothing
        await t.tap(find.byKey(const ValueKey('shift-end')));
        await t.pumpAndSettle();
        expect(find.text(s.shiftEndTitle), findsOneWidget);
        expectButtonRules(t);
        await t.tap(find.byKey(const ValueKey('shift-end-cancel')));
        await t.pumpAndSettle();
        expect(server.calls.where((c) => c == 'shift:clockOut'), isEmpty);
        expect(find.text(s.shiftStatusOn), findsOneWidget);

        await t.tap(find.byKey(const ValueKey('shift-end')));
        await t.pumpAndSettle();
        await t.tap(find.byKey(const ValueKey('shift-end-confirm')));
        await t.pumpAndSettle();
        expect(server.calls.last, 'shift:clockOut');
        expect(find.text(s.shiftStatusOff), findsOneWidget);
        expect(find.text(s.shiftDoneEnd), findsOneWidget);
        expect(find.byKey(const ValueKey('shift-start')), findsOneWidget);
        expect(find.byKey(const ValueKey('shift-open1')), findsOneWidget, reason: 'the finished shift is in the history');
        expect(overflows, isEmpty);
      });
    }

    testWidgets('the last 7 days: day, in/out, hours, break, auto-closed, totals', (t) async {
      final day = DateTime.now().subtract(const Duration(days: 1));
      final d1 = DateTime(day.year, day.month, day.day, 8, 2);
      final d2 = DateTime(day.year, day.month, day.day - 1, 7, 58);
      server.shifts
        ..add(_closed('s1', d1, 480, breaks: 60))
        ..add(_closed('s2', d2, 960, reason: 'auto'));
      await open(t, 'en');
      final s = Strings('en');
      expect(find.text(s.shiftStatusOff), findsOneWidget);
      expect(find.byKey(const ValueKey('shift-s1')), findsOneWidget);
      expect(find.byKey(const ValueKey('shift-s2')), findsOneWidget);
      expect(find.text('8 h 00 min'), findsOneWidget);
      expect(find.text('16 h 00 min'), findsOneWidget);
      expect(find.text(s.shiftBreakLine('1 h 00 min')), findsOneWidget);
      expect(find.byKey(const ValueKey('shift-auto')), findsOneWidget);
      expect(find.text(s.shiftInOut('08:02', '17:02')), findsOneWidget);
      expect(t.widget<Text>(find.byKey(const ValueKey('shift-count'))).data, '2');
      expect(t.widget<Text>(find.byKey(const ValueKey('shift-hours'))).data, '24 h 00 min');
      expect(find.text(s.shiftHistoryEmpty), findsNothing);
    });

    testWidgets('an open shift shows when it started, the hours so far and the break time', (t) async {
      // 90 minutes ago, but never before today's midnight (a run just after midnight would otherwise say "yesterday").
      final now = DateTime.now();
      final ago = now.subtract(const Duration(minutes: 90));
      final started = ago.day == now.day ? ago : DateTime(now.year, now.month, now.day);
      server.open = {'id': 'o', 'startedAt': started.toUtc().toIso8601String(), 'endedAt': null, 'breakMinutes': 10, 'onBreak': false, 'breakStartedAt': null, 'workedMinutes': 80, 'endReason': null};
      await open(t, 'en');
      final s = Strings('en');
      expect(find.text(s.shiftStatusOn), findsOneWidget);
      expect(find.textContaining('today'), findsOneWidget);
      expect(find.text(s.shiftWorked('1 h 20 min')), findsOneWidget);
      expect(find.text(s.shiftBreaks('10 min')), findsOneWidget);
    });

    testWidgets('a server refusal is shown in the rider’s language in a snackbar and the state stays', (t) async {
      await open(t, 'fr');
      server.failWith = ApiException('Your account is switched off. Ask an administrator.');
      await t.tap(find.byKey(const ValueKey('shift-start')));
      await t.pumpAndSettle();
      expect(find.textContaining('Votre compte est désactivé'), findsOneWidget);
      expect(find.text(Strings('fr').shiftStatusOff), findsOneWidget);
      expect(find.byKey(const ValueKey('shift-start')), findsOneWidget, reason: 'the button is back, not stuck on a spinner');
    });

    testWidgets('when the first read fails there is a message and a retry that works', (t) async {
      server.failWith = ApiException.local('err_offline');
      await open(t, 'en');
      final s = Strings('en');
      expect(find.byKey(const ValueKey('shift-load-failed')), findsOneWidget);
      server.failWith = null;
      await t.tap(find.byKey(const ValueKey('shift-retry')));
      await t.pumpAndSettle();
      expect(find.text(s.shiftStatusOff), findsOneWidget);
      expect(find.byKey(const ValueKey('shift-load-failed')), findsNothing);
    });

    testWidgets('a push from the server updates the open screen (the shift closed itself)', (t) async {
      server.open = {'id': 'o', 'startedAt': DateTime.now().toUtc().toIso8601String(), 'endedAt': null, 'breakMinutes': 0, 'onBreak': false, 'breakStartedAt': null, 'workedMinutes': 0, 'endReason': null};
      await open(t, 'en');
      final s = Strings('en');
      expect(find.text(s.shiftStatusOn), findsOneWidget);
      ShiftStore.instance.applyPush({'status': 'off', 'current': null, 'lastShift': _closed('o', DateTime.now().subtract(const Duration(hours: 17)), 960, reason: 'auto'), 'minutesLast7Days': 960, 'shifts': [_closed('o', DateTime.now().subtract(const Duration(hours: 17)), 960, reason: 'auto')]});
      await t.pumpAndSettle();
      expect(find.text(s.shiftStatusOff), findsOneWidget);
      expect(find.byKey(const ValueKey('shift-auto')), findsOneWidget);
    });

    for (final scale in [1.0, 1.6, 2.0]) {
      testWidgets('French on a 360 dp phone at text scale $scale: no overflow, off shift and on break', (t) async {
        server.shifts.add(_closed('s1', DateTime.now().subtract(const Duration(days: 1)), 480, breaks: 45, reason: 'auto'));
        await open(t, 'fr', textScale: scale);
        expect(overflows, isEmpty, reason: 'off shift');
        await t.tap(find.byKey(const ValueKey('shift-start')));
        await t.pumpAndSettle();
        expect(overflows, isEmpty, reason: 'on shift');
        await t.tap(find.byKey(const ValueKey('shift-break')));
        await t.pumpAndSettle();
        expect(overflows, isEmpty, reason: 'on break');
        expectButtonRules(t);
      });
    }
  });
}
