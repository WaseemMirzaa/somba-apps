// Basic smoke test for the Somba customer app.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:lipcart/main.dart';

void main() {
  testWidgets('App boots and shows the bottom navigation', (tester) async {
    await tester.pumpWidget(const LipCartApp());
    // One frame is enough; the home screen runs periodic timers (carousel /
    // countdown) so pumpAndSettle would never complete.
    await tester.pump();

    expect(find.byType(NavigationBar), findsOneWidget);
    expect(find.text('Home'), findsWidgets);
  });
}
