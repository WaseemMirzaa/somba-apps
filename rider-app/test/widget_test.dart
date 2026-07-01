// Basic smoke test for the Somba rider app.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:somba_rider/main.dart';

void main() {
  testWidgets('Rider app boots into the splash then sign-in flow', (tester) async {
    await tester.pumpWidget(const SombaRiderApp());
    await tester.pump();

    // Splash screen shows the brand while booting.
    expect(find.text('Somba&Teka'), findsOneWidget);

    // Advance past the splash timer to reach the sign-in screen.
    await tester.pump(const Duration(seconds: 2));
    await tester.pumpAndSettle();

    expect(find.text('Welcome back'), findsOneWidget);
    expect(find.widgetWithText(FilledButton, 'Sign in'), findsOneWidget);
  });
}
