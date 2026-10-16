import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:somba_rider/main.dart';
import 'package:somba_rider/screens/deliveries_screen.dart';

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

  testWidgets('failure sheet requires a reason and returns it', (tester) async {
    String? result;
    await tester.pumpWidget(MaterialApp(
      home: Builder(
        builder: (ctx) => Scaffold(
          body: TextButton(
            child: const Text('open'),
            onPressed: () async => result = await showModalBottomSheet<String>(context: ctx, isScrollControlled: true, builder: (_) => const FailReasonSheet()),
          ),
        ),
      ),
    ));
    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();
    expect(tester.widget<FilledButton>(find.byKey(const ValueKey('reason-submit'))).onPressed, isNull);
    await tester.tap(find.byKey(const ValueKey('reason-Wrong address')));
    await tester.pump();
    await tester.tap(find.byKey(const ValueKey('reason-submit')));
    await tester.pumpAndSettle();
    expect(result, 'Wrong address');
  });

  testWidgets('delivery code dialog shows the server error and allows a retry', (tester) async {
    var calls = 0;
    await tester.pumpWidget(MaterialApp(
      home: Builder(
        builder: (ctx) => Scaffold(
          body: TextButton(
            child: const Text('open'),
            onPressed: () => showDialog(
              context: ctx,
              builder: (_) => DeliveryCodeDialog(onSubmit: (code) async {
                calls++;
                if (code != '4321') throw Exception('x');
              }),
            ),
          ),
        ),
      ),
    ));
    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('delivery-code-submit')));
    await tester.pump();
    expect(find.byKey(const ValueKey('delivery-code-error')), findsOneWidget); // needs 4 digits
    expect(calls, 0);
    await tester.enterText(find.byKey(const ValueKey('delivery-code-field')), '1111');
    await tester.tap(find.byKey(const ValueKey('delivery-code-submit')));
    await tester.pumpAndSettle();
    expect(calls, 1);
    expect(find.byKey(const ValueKey('delivery-code-error')), findsOneWidget);
    await tester.enterText(find.byKey(const ValueKey('delivery-code-field')), '4321');
    await tester.tap(find.byKey(const ValueKey('delivery-code-submit')));
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('delivery-code-field')), findsNothing);
  });
}
