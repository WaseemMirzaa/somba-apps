// Basic smoke test for the Somba customer app.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:lipcart/main.dart';

void main() {
  testWidgets('App boots into splash then the sign-in screen', (tester) async {
    await tester.pumpWidget(const SombaApp());
    await tester.pump();

    // Splash screen shows the brand while booting.
    expect(find.text('Somba&Teka'), findsOneWidget);

    // Advance past the splash timer to reach the sign-in screen.
    await tester.pump(const Duration(seconds: 2));
    await tester.pump();

    expect(find.text('Welcome back'), findsOneWidget);
    expect(find.widgetWithText(FilledButton, 'Sign in'), findsOneWidget);
  });
}
