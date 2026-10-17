// UI smoke tests for the Somba customer app (no server needed).
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:lipcart/l10n/strings.dart';
import 'package:lipcart/main.dart';

void main() {
  // French is the app's default language (the market is DR Congo).
  const fr = Strings('fr');

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    Strings.hasChoice = false;
    await Strings.setLang('fr', persist: false);
  });

  testWidgets('boots into the splash, then a real sign-in form (no demo shortcuts)', (tester) async {
    await tester.pumpWidget(const SombaApp());
    await tester.pump();

    // Splash shows the brand while booting.
    expect(find.text('Somba&Teka'), findsOneWidget);

    await tester.pump(const Duration(seconds: 3));
    await tester.pump();

    expect(find.text(fr.welcomeBack), findsOneWidget);
    expect(find.widgetWithText(FilledButton, fr.signIn), findsOneWidget);

    // The account is mandatory: no guest entry, no fake social sign-in, no
    // pre-filled demo credentials.
    expect(find.textContaining('guest', findRichText: true), findsNothing);
    expect(find.textContaining('Google'), findsNothing);
    expect(find.text('customer@somba.app'), findsNothing);
    expect(find.text('Somba@2026'), findsNothing);
  });

  testWidgets('sign-in validates before calling the server', (tester) async {
    await tester.pumpWidget(const SombaApp());
    await tester.pump(const Duration(seconds: 3));
    await tester.pump();

    await tester.tap(find.widgetWithText(FilledButton, fr.signIn));
    await tester.pump();
    expect(find.text(fr.errEnterEmail), findsOneWidget);
    expect(find.text(fr.errEnterPassword), findsOneWidget);

    await tester.enterText(find.descendant(of: find.byKey(const ValueKey('login-email')), matching: find.byType(TextField)), 'not-an-email');
    await tester.tap(find.widgetWithText(FilledButton, fr.signIn));
    await tester.pump();
    expect(find.text(fr.errValidEmail), findsOneWidget);
  });

  testWidgets('create-account form requires an 8+ character password and matching confirmation', (tester) async {
    tester.view.physicalSize = const Size(900, 2000); // tall enough to show the whole form
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(const SombaApp());
    await tester.pump(const Duration(seconds: 3));
    await tester.pump();

    await tester.tap(find.byKey(const ValueKey('go-register')));
    await tester.pumpAndSettle();
    expect(find.text(fr.registerTitle), findsWidgets);

    Finder field(String key) => find.descendant(of: find.byKey(ValueKey(key)), matching: find.byType(TextField));
    await tester.enterText(field('reg-name'), 'Aline Kabila');
    await tester.enterText(field('reg-phone'), '812345678');
    await tester.enterText(field('reg-email'), 'aline@example.com');
    await tester.enterText(field('reg-password'), 'short');
    await tester.enterText(field('reg-confirm'), 'different');
    await tester.tap(find.widgetWithText(FilledButton, fr.registerTitle));
    await tester.pump();
    expect(find.text(fr.regErrPass), findsOneWidget);
    expect(find.text(fr.regErrMatch), findsOneWidget);
  });
}
