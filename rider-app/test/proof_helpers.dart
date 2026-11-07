// Completing a delivery to the customer now opens the proof-of-delivery sheet (photo and signature, both optional) after the
// cash prompt and before the delivery code. Tests that are about the cash or the code carry on past it without capturing anything.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

Future<void> continueWithoutProof(WidgetTester t) async {
  expect(find.byKey(const ValueKey('proof-continue')), findsOneWidget, reason: 'the proof sheet opens before the delivery is completed');
  await t.tap(find.byKey(const ValueKey('proof-continue')));
  await t.pumpAndSettle();
}
