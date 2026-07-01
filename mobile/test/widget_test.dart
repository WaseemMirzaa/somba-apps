// Basic smoke test for the Somba customer app.
import 'package:flutter_test/flutter_test.dart';

import 'package:lipcart/main.dart';

void main() {
  testWidgets('App boots and shows the bottom navigation', (tester) async {
    await tester.pumpWidget(const LipCartApp());
    // One frame is enough; the home screen runs periodic timers (carousel /
    // countdown) so pumpAndSettle would never complete.
    await tester.pump();

    // Home screen renders and the floating navigation shows its tabs.
    expect(find.text('Deliver to'), findsOneWidget);
    expect(find.text('Home'), findsWidgets);
  });
}
