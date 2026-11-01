// The rider's earnings: the pay is flat per COMPLETED task of any kind, so the screen says "tasks" (not "deliveries")
// and breaks them down by kind, the way the server's `rider:earnings` answers (docs/contracts/logistics.md section 7).
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:somba_rider/l10n/messages.dart';
import 'package:somba_rider/l10n/strings.dart';
import 'package:somba_rider/screens/earnings_screen.dart';
import 'package:somba_rider/services/models.dart';
import 'package:somba_rider/services/rider_store.dart';
import 'package:somba_rider/theme/app_theme.dart';

const _serverAnswer = {
  'totalTasks': 7,
  'delivered': 5,
  'active': 1,
  'codCollectedUsd': 50,
  'perTaskUsd': 2.5,
  'byKind': [
    {'kind': 'pickup', 'count': 1, 'earningsUsd': 2.5},
    {'kind': 'transfer', 'count': 2, 'earningsUsd': 5},
    {'kind': 'delivery', 'count': 2, 'earningsUsd': 5},
  ],
  'earningsUsd': 12.5,
};

void main() {
  setUpAll(() async {
    TestWidgetsFlutterBinding.ensureInitialized();
    for (final f in const {'Inter': 'assets/fonts/Inter.ttf', 'PlusJakartaSans': 'assets/fonts/PlusJakartaSans.ttf'}.entries) {
      await (FontLoader(f.key)..addFont(rootBundle.load(f.value))).load();
    }
  });

  setUp(() => SharedPreferences.setMockInitialValues({}));
  tearDown(() => RiderStore.instance.earnings = const EarningsDto());

  group('EarningsDto', () {
    test('reads the breakdown by kind, the per-task rate and the completed count (`delivered` on the wire)', () {
      final e = EarningsDto.fromJson(_serverAnswer);
      expect(e.completed, 5);
      expect(e.perTaskUsd, 2.5);
      expect(e.byKind.map((k) => (k.kind, k.count, k.earningsUsd)), [('pickup', 1, 2.5), ('transfer', 2, 5.0), ('delivery', 2, 5.0)]);
      expect(e.byKind.fold<int>(0, (n, k) => n + k.count), e.completed);
      expect(e.byKind.fold<double>(0, (n, k) => n + k.earningsUsd), e.earningsUsd);
    });

    test('an older server that sends no breakdown still parses', () {
      final e = EarningsDto.fromJson({'totalTasks': 3, 'delivered': 1, 'active': 2, 'codCollectedUsd': 0, 'earningsUsd': 2.5});
      expect(e.completed, 1);
      expect(e.byKind, isEmpty);
      expect(e.perTaskUsd, 0);
    });
  });

  group('the earnings screen', () {
    for (final lang in ['en', 'fr']) {
      testWidgets('says tasks and shows the breakdown by kind and the flat rate ($lang)', (tester) async {
        await Strings.setLang(lang, persist: false);
        final s = Strings(lang);
        RiderStore.instance.earnings = EarningsDto.fromJson(_serverAnswer);
        tester.view.physicalSize = const Size(402 * 3, 900 * 3);
        tester.view.devicePixelRatio = 3;
        addTearDown(tester.view.reset);
        await tester.pumpWidget(MaterialApp(
          locale: Locale(lang),
          supportedLocales: const [Locale('en'), Locale('fr')],
          localizationsDelegates: const [GlobalMaterialLocalizations.delegate, GlobalWidgetsLocalizations.delegate, GlobalCupertinoLocalizations.delegate],
          theme: AppTheme.light(),
          home: const Scaffold(body: EarningsScreen()),
        ));
        await tester.pump(const Duration(milliseconds: 400));

        expect(find.text(s.usd(12.5)), findsWidgets);
        expect(find.text(s.fromTasksMany(5)), findsOneWidget);
        expect(find.text(s.tasksDone), findsOneWidget);
        expect(find.textContaining(lang == 'fr' ? 'livraisons terminées' : 'completed deliveries'), findsNothing, reason: 'it is not a count of deliveries');
        expect(find.text('${s.t('kind_pickup')} × 1'), findsOneWidget);
        expect(find.text('${s.t('kind_transfer')} × 2'), findsOneWidget);
        expect(find.text('${s.t('kind_delivery')} × 2'), findsOneWidget);
        expect(find.text(s.earnByKind), findsOneWidget);
        expect(find.text(s.earnRateNote(s.usd(2.5))), findsOneWidget);
      });
    }

    testWidgets('one completed task reads in the singular; no breakdown card without data', (tester) async {
      await Strings.setLang('en', persist: false);
      RiderStore.instance.earnings = const EarningsDto(completed: 1, earningsUsd: 2.5);
      await tester.pumpWidget(MaterialApp(theme: AppTheme.light(), home: const Scaffold(body: EarningsScreen())));
      await tester.pump(const Duration(milliseconds: 400));
      expect(find.text('from 1 completed task'), findsOneWidget);
      expect(find.byKey(const ValueKey('earnings-by-kind')), findsNothing);
    });
  });

  test('every earnings text exists in English and French', () {
    for (final k in ['from_tasks_one', 'from_tasks_many', 'tasks_done', 'earn_by_kind', 'earn_rate_note']) {
      final m = kMessages[k];
      expect(m, isNotNull, reason: k);
      expect(m!.$1.trim(), isNotEmpty);
      expect(m.$2.trim(), isNotEmpty);
      expect(m.$1, isNot(m.$2), reason: '$k is translated');
    }
  });
}
