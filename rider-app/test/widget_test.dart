// Basic smoke test for the Somba rider app.
import 'package:flutter_test/flutter_test.dart';

import 'package:somba_rider/main.dart';

void main() {
  testWidgets('Rider app boots and shows the task list', (tester) async {
    await tester.pumpWidget(const SombaRiderApp());
    await tester.pump();

    expect(find.text('Jean Mukendi'), findsWidgets);
    expect(find.text("Today's route"), findsOneWidget);
  });
}
