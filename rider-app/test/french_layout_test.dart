// French texts are longer: render the rider screens in French on a small phone
// (360 x 740, with the app's real fonts) and fail on any layout overflow.
// Each screen is also held to the button rules (no icon on a label button, one filled button).
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:somba_rider/l10n/strings.dart';
import 'package:somba_rider/screens/deliveries_screen.dart';
import 'package:somba_rider/screens/earnings_screen.dart';
import 'package:somba_rider/screens/more/rider_auth.dart';
import 'package:somba_rider/screens/profile_screen.dart';
import 'package:somba_rider/screens/rider_shell.dart';
import 'package:somba_rider/services/models.dart';
import 'package:somba_rider/services/rider_store.dart';
import 'package:somba_rider/theme/app_theme.dart';

import 'button_rules.dart';

const _lang = String.fromEnvironment('LAYOUT_LANG', defaultValue: 'fr');

DeliveryTaskDto _task(String id, String status, {double cod = 0, String? failure}) => DeliveryTaskDto(
      id: id,
      orderId: 'o$id',
      orderReference: 'SOM-10$id',
      status: status,
      codAmountUsd: cod,
      addressRaw: '{"line1":"12, avenue du Commerce","commune":"Gombe","city":"Kinshasa","phone":"+243812345678"}',
      customerName: 'Aline Kabila',
      pickupAddress: 'Entrepôt central, Limete',
      items: const [OrderLine('Téléphone', 2)],
      attempts: status == 'assigned' ? 2 : 1,
      readyAt: DateTime(2026, 10, 1),
      receivedAt: DateTime(2026, 10, 1),
      failureReason: failure,
    );

void main() {
  final overflows = <String>[];

  setUpAll(() async {
    TestWidgetsFlutterBinding.ensureInitialized();
    for (final f in const {'Inter': 'assets/fonts/Inter.ttf', 'PlusJakartaSans': 'assets/fonts/PlusJakartaSans.ttf'}.entries) {
      await (FontLoader(f.key)..addFont(rootBundle.load(f.value))).load();
    }
  });

  setUp(() async {
    overflows.clear();
    SharedPreferences.setMockInitialValues({});
    await Strings.setLang(_lang, persist: false);
    final store = RiderStore.instance;
    store.user = BackendUser(id: 'r', email: 'rider@somba.app', name: 'Jean Mukendi', role: 'rider', phone: '+243810000000');
    store.loaded = true;
    store.myTasks
      ..clear()
      ..addAll([_task('1', 'assigned', cod: 25.5), _task('2', 'in_transit'), _task('3', 'failed', failure: 'Client injoignable'), _task('4', 'delivered')]);
    store.pool
      ..clear()
      ..add(_task('5', 'unassigned', cod: 12));
    store.notifications
      ..clear()
      ..add(NotificationDto(id: 'n', title: 'Parcel ready for pickup', body: 'SOM-1 is packed and ready.', type: 'delivery', read: false));
  });

  tearDown(() {
    final store = RiderStore.instance;
    store.user = null;
    store.myTasks.clear();
    store.pool.clear();
    store.notifications.clear();
  });

  Future<void> show(WidgetTester tester, Widget screen) async {
    final previous = FlutterError.onError;
    FlutterError.onError = (d) {
      if (d.exceptionAsString().contains('overflowed')) {
        overflows.add(d.exceptionAsString().split('\n').first);
      } else if (d.exception is TestFailure) {
        previous?.call(d); // a failed expect(): hand it to the test framework, or the test hangs
      }
    };
    addTearDown(() => FlutterError.onError = previous);
    tester.view.physicalSize = const Size(360 * 3, 740 * 3);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(MaterialApp(
      locale: const Locale(_lang),
      supportedLocales: const [Locale('en'), Locale('fr')],
      localizationsDelegates: const [GlobalMaterialLocalizations.delegate, GlobalWidgetsLocalizations.delegate, GlobalCupertinoLocalizations.delegate],
      theme: AppTheme.light(),
      home: screen,
    ));
    await tester.pump(const Duration(milliseconds: 600));
    expectButtonRules(tester);
  }

  const loc = Locale(_lang);
  testWidgets('layout: sign in, forgot password', (tester) async {
    await show(tester, const RiderLoginScreen());
    expect(overflows, isEmpty);
    await show(tester, const ForgotPasswordScreen());
    expect(overflows, isEmpty);
  });

  testWidgets('layout: deliveries (active, available, done)', (tester) async {
    await show(tester, const Scaffold(body: DeliveriesScreen()));
    expect(overflows, isEmpty, reason: 'active');
    for (final i in [1, 2]) {
      await tester.tap(find.byKey(ValueKey('tab-$i')));
      await tester.pump(const Duration(milliseconds: 300));
      expect(overflows, isEmpty, reason: 'tab $i');
      expectButtonRules(tester);
    }
  });

  testWidgets('layout: earnings, profile, navigation bar', (tester) async {
    await show(tester, const Scaffold(body: EarningsScreen()));
    expect(overflows, isEmpty);
    await show(tester, Scaffold(body: ProfileScreen(locale: loc, onLocaleChanged: (_) {})));
    expect(overflows, isEmpty);
    await show(tester, RiderShell(locale: loc, onLocaleChanged: (_) {}));
    for (final icon in [Icons.account_balance_wallet_rounded, Icons.person_rounded, Icons.two_wheeler_rounded]) {
      await tester.tap(find.byIcon(icon).first);
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));
      expect(overflows, isEmpty, reason: '$icon');
      expectButtonRules(tester);
    }
  });

  testWidgets('layout: failure sheet and delivery code dialog', (tester) async {
    await show(tester, const Scaffold(body: SingleChildScrollView(child: FailReasonSheet())));
    expect(overflows, isEmpty);
    await show(tester, Builder(builder: (ctx) => TextButton(onPressed: () => showDialog(context: ctx, builder: (_) => DeliveryCodeDialog(onSubmit: (_) async {})), child: const Text('go'))));
    await tester.tap(find.text('go'));
    await tester.pump(const Duration(milliseconds: 500));
    expect(overflows, isEmpty);
    expectButtonRules(tester);
  });
}
