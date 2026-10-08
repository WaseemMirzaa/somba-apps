import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:somba_rider/main.dart';

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  testWidgets('boots through the splash to a real sign-in (no demo credentials)', (tester) async {
    await tester.pumpWidget(const SombaRiderApp());
    await tester.pump();
    expect(find.text('Somba&Teka'), findsOneWidget);

    await tester.pump(const Duration(seconds: 2));
    await tester.pumpAndSettle();

    expect(find.text('Welcome back'), findsOneWidget);
    expect(find.byKey(const ValueKey('rider-signin')), findsOneWidget);
    // Fields start empty: no prefilled demo account.
    final email = tester.widget<TextField>(find.byKey(const ValueKey('rider-email')));
    final pass = tester.widget<TextField>(find.byKey(const ValueKey('rider-password')));
    expect(email.controller!.text, isEmpty);
    expect(pass.controller!.text, isEmpty);
  });

  testWidgets('empty submit is rejected locally and never enters the app', (tester) async {
    await tester.pumpWidget(const SombaRiderApp());
    await tester.pump(const Duration(seconds: 2));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('rider-signin')));
    await tester.pump();
    expect(find.byKey(const ValueKey('login-error')), findsOneWidget);
    expect(find.text('Welcome back'), findsOneWidget);
  });

  testWidgets('forgot password opens the reset form', (tester) async {
    await tester.pumpWidget(const SombaRiderApp());
    await tester.pump(const Duration(seconds: 2));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Forgot password?'));
    await tester.pumpAndSettle();
    expect(find.text('Forgot your password?'), findsOneWidget);
    expect(find.byKey(const ValueKey('forgot-email')), findsOneWidget);
  });
}
