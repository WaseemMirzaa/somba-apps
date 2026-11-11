// The rider's work stats: riders are salaried, so the "My work" screen shows what they did (tasks completed today, this
// week and all time; completed, in progress, failed, success rate; completed by type), the way the server's
// `rider:workStats` answers (docs/contracts/logistics.md section 7), and no pay: no dollar amount is on it.
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:somba_rider/l10n/messages.dart';
import 'package:somba_rider/l10n/strings.dart';
import 'package:somba_rider/screens/work_screen.dart';
import 'package:somba_rider/services/models.dart';
import 'package:somba_rider/services/rider_store.dart';
import 'package:somba_rider/theme/app_theme.dart';

const _serverAnswer = {
  'totalTasks': 9,
  'completed': 5,
  'active': 1,
  'failed': 3,
  'completedToday': 2,
  'completedLast7Days': 4,
  'successRate': 63,
  'byKind': [
    {'kind': 'pickup', 'count': 1},
    {'kind': 'transfer', 'count': 2},
    {'kind': 'delivery', 'count': 2},
  ],
  'delivered': 5,
};

void main() {
  setUpAll(() async {
    TestWidgetsFlutterBinding.ensureInitialized();
    for (final f in const {'Inter': 'assets/fonts/Inter.ttf', 'PlusJakartaSans': 'assets/fonts/PlusJakartaSans.ttf'}.entries) {
      await (FontLoader(f.key)..addFont(rootBundle.load(f.value))).load();
    }
  });

  setUp(() => SharedPreferences.setMockInitialValues({}));
  tearDown(() {
    RiderStore.instance.stats = const WorkStatsDto();
  });

  Future<void> show(WidgetTester tester, String lang, {double width = 402, double textScale = 1.0}) async {
    await Strings.setLang(lang, persist: false);
    tester.view.physicalSize = Size(width * 3, 1400 * 3);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(MaterialApp(
      locale: Locale(lang),
      supportedLocales: const [Locale('en'), Locale('fr')],
      localizationsDelegates: const [GlobalMaterialLocalizations.delegate, GlobalWidgetsLocalizations.delegate, GlobalCupertinoLocalizations.delegate],
      theme: AppTheme.light(),
      builder: (context, child) => MediaQuery(data: MediaQuery.of(context).copyWith(textScaler: TextScaler.linear(textScale)), child: child!),
      home: const Scaffold(body: WorkScreen()),
    ));
    await tester.pump(const Duration(milliseconds: 400));
  }

  group('WorkStatsDto', () {
    test('reads every count, the whole-percent success rate and the breakdown by type (counts only)', () {
      final e = WorkStatsDto.fromJson(_serverAnswer);
      expect((e.totalTasks, e.completed, e.active, e.failed), (9, 5, 1, 3));
      expect((e.completedToday, e.completedLast7Days, e.successRate), (2, 4, 63));
      expect(e.byKind.map((k) => (k.kind, k.count)), [('pickup', 1), ('transfer', 2), ('delivery', 2)]);
      expect(e.byKind.fold<int>(0, (n, k) => n + k.count), e.completed);
    });

    test('a null success rate stays null; an answer from before work stats (`delivered`) still parses', () {
      expect(WorkStatsDto.fromJson({...Map.of(_serverAnswer), 'successRate': null}).successRate, isNull);
      final e = WorkStatsDto.fromJson({'totalTasks': 3, 'delivered': 1, 'active': 2});
      expect(e.completed, 1);
      expect(e.failed, 0);
      expect(e.completedToday, 0);
      expect(e.successRate, isNull);
      expect(e.byKind, isEmpty);
    });
  });

  group('the work screen', () {
    for (final lang in ['en', 'fr']) {
      testWidgets('shows today, this week and all time, the four tiles and the breakdown by type ($lang)', (tester) async {
        final s = Strings(lang);
        RiderStore.instance.stats = WorkStatsDto.fromJson(_serverAnswer);
        await show(tester, lang);

        expect(tester.widget<Text>(find.byKey(const ValueKey('work-today'))).data, '2');
        expect(find.text(s.workTodaySub), findsOneWidget);
        expect(find.text(s.workWeekAll(4, 5)), findsOneWidget);
        expect(find.text(s.workCompleted), findsOneWidget);
        expect(find.text(s.inProgress), findsOneWidget);
        expect(find.text(s.workFailed), findsOneWidget);
        expect(find.text(s.workSuccessRate), findsOneWidget);
        expect(find.text('63%'), findsOneWidget);
        expect(find.text(s.workByKind), findsOneWidget);
        for (final k in const {'pickup': 1, 'transfer': 2, 'delivery': 2}.entries) {
          final row = find.byKey(ValueKey('work-kind-${k.key}'));
          expect(find.descendant(of: row, matching: find.text(s.t('kind_${k.key}'))), findsOneWidget);
          expect(find.descendant(of: row, matching: find.text('${k.value}')), findsOneWidget);
        }
        expect(find.text(s.workSalaryNote), findsOneWidget);
      });
    }

    testWidgets('the success rate reads "—" until a task has finished, and nothing done shows zeros without a breakdown card', (tester) async {
      RiderStore.instance.stats = const WorkStatsDto(active: 1);
      await show(tester, 'en');
      expect(find.text('—'), findsOneWidget);
      expect(tester.widget<Text>(find.byKey(const ValueKey('work-today'))).data, '0');
      expect(find.byKey(const ValueKey('work-by-kind')), findsNothing);
    });

    for (final lang in ['en', 'fr']) {
      testWidgets('no pay on it: no dollar amount at all ($lang)', (tester) async {
        RiderStore.instance.stats = WorkStatsDto.fromJson(_serverAnswer);
        await show(tester, lang);

        final dollars = find.byWidgetPredicate((w) => w is Text && (w.data ?? '').contains('\$') && !(w.data ?? '').contains('{'));
        expect(dollars, findsNothing);
        // And none of the old pay copy is left.
        for (final word in lang == 'fr' ? ['gains', 'payée', 'payé '] : ['earn', 'pays ', 'per task', 'rate of']) {
          expect(find.textContaining(word, findRichText: true), findsNothing, reason: word);
        }
      });
    }

    for (final lang in ['en', 'fr']) {
      testWidgets('fits a 360pt wide phone at 1.3x text with a long breakdown, no overflow ($lang)', (tester) async {
        RiderStore.instance.stats = const WorkStatsDto(
          totalTasks: 1280,
          completed: 1170,
          active: 12,
          failed: 98,
          completedToday: 14,
          completedLast7Days: 86,
          successRate: 92,
          byKind: [
            WorkStatsKind(kind: 'delivery', count: 600),
            WorkStatsKind(kind: 'pickup', count: 310),
            WorkStatsKind(kind: 'return_to_seller', count: 3),
            WorkStatsKind(kind: 'replacement_delivery', count: 2),
          ],
        );
        await show(tester, lang, width: 360, textScale: 1.3);
        expect(tester.takeException(), isNull);
        expect(find.text('92%'), findsOneWidget);
      });
    }
  });

  test('every work-stats text exists in English and French, and the old pay copy is gone', () {
    for (final k in ['nav_work', 'work_today_sub', 'work_week_all', 'work_completed', 'work_failed', 'work_success_rate', 'work_by_kind', 'work_salary_note']) {
      final m = kMessages[k];
      expect(m, isNotNull, reason: k);
      expect(m!.$1.trim(), isNotEmpty);
      expect(m.$2.trim(), isNotEmpty);
      expect(m.$1, isNot(m.$2), reason: '$k is translated');
    }
    for (final k in ['nav_earnings', 'your_earnings', 'from_tasks_one', 'from_tasks_many', 'tasks_done', 'earn_by_kind', 'earn_rate_note']) {
      expect(kMessages.containsKey(k), isFalse, reason: '$k is gone');
    }
  });
}
