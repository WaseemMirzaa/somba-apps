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
import 'package:somba_rider/screens/support_screen.dart';
import 'package:somba_rider/services/models.dart';
import 'package:somba_rider/services/rider_store.dart';
import 'package:somba_rider/theme/app_theme.dart';

import 'button_rules.dart';
import 'task_fixtures.dart';

const _lang = String.fromEnvironment('LAYOUT_LANG', defaultValue: 'fr');

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
    store.requireDeliveryCode = true;
    store.assignment = const RiderAssignment(hubId: 'h2', hubName: 'Entrepôt de Gombe', hubCity: 'Kinshasa', hubAddress: 'Boulevard du 30 Juin 8');
    store.myTasks
      ..clear()
      ..addAll([
        leg('pickup', id: 'p1'),
        leg('transfer', id: 'p2', status: 'in_transit'),
        leg('delivery', id: 'p3', status: 'in_transit', cod: 25.5),
        leg('replacement_delivery', id: 'p4'),
        leg('return_to_seller', id: 'p5', status: 'picked_up'),
        leg('delivery', id: 'p6', status: 'failed', failure: 'Client injoignable'),
        leg('delivery', id: 'p7', status: 'delivered'),
      ]);
    fakeSupport(tickets: [ticket('1', unread: 1), ticket('2', status: 'closed')]);
    store.notifications
      ..clear()
      ..add(NotificationDto(id: 'n', title: 'Parcel ready for pickup', body: 'SOM-1 is packed and ready.', type: 'delivery', read: false));
  });

  tearDown(() {
    final store = RiderStore.instance;
    store.user = null;
    store.myTasks.clear();
    store.notifications.clear();
    store.assignment = null;
    store.requireDeliveryCode = false;
    resetSupport();
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

  testWidgets('layout: deliveries (active, done)', (tester) async {
    await show(tester, const Scaffold(body: DeliveriesScreen()));
    expect(overflows, isEmpty, reason: 'active');
    await tester.tap(find.byKey(const ValueKey('tab-1')));
    await tester.pump(const Duration(milliseconds: 300));
    expect(overflows, isEmpty, reason: 'done');
    expectButtonRules(tester);
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

  testWidgets('layout: one task card holds the only filled button, with a label and no icon', (tester) async {
    RiderStore.instance.myTasks
      ..clear()
      ..add(leg('pickup', id: 'solo'));
    await show(tester, const Scaffold(body: DeliveriesScreen()));
    expect(overflows, isEmpty);
    expect(find.byType(FilledButton), findsOneWidget);
  });

  testWidgets('layout: support list, new ticket, thread, closed thread', (tester) async {
    await show(tester, const SupportScreen());
    expect(overflows, isEmpty, reason: 'list');
    await show(tester, const NewTicketScreen());
    expect(overflows, isEmpty, reason: 'new ticket');
    await show(tester, const SupportThreadScreen(ticketId: '1'));
    expect(overflows, isEmpty, reason: 'thread');
    await show(tester, const SupportThreadScreen(ticketId: '2'));
    expect(overflows, isEmpty, reason: 'closed thread');
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
