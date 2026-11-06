// Round 3: what the sign-in / sign-up / verification calls do with the answers a real server gives.
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:lipcart/l10n/strings.dart';
import 'package:lipcart/screens/more/auth_screens.dart';
import 'package:lipcart/services/auth_service.dart';
import 'package:lipcart/services/maps_config.dart';
import 'package:lipcart/services/models.dart';
import 'package:lipcart/services/realtime_store.dart';
import 'package:lipcart/widgets/verify_prompt.dart';

import 'gap_helpers.dart';

Future<T> _withServer<T>(int status, Object body, Future<T> Function() run) =>
    http.runWithClient(run, () => MockClient((_) async => http.Response(jsonEncode(body), status, headers: {'content-type': 'application/json'})));

/// The error a call fails with (null when it works).
Future<Object?> _fails(int status, Object body, Future<Object?> Function() run) async {
  try {
    await _withServer(status, body, run);
    return null;
  } catch (e) {
    return e;
  }
}

const _user = {'id': 'u1', 'email': 'a@b.cd', 'name': 'A', 'role': 'customer', 'walletBalance': 0};

void main() {
  final auth = AuthService();

  group('the answers of the auth endpoints', () {
    test('429 is the translated rate-limit text whatever the server says', () async {
      await Strings.setLang('fr', persist: false);
      final Object? e = await _fails(429, {'message': 'ThrottlerException: Too Many Requests'}, () => auth.login('a@b.cd', 'x'));
      expect(e, isA<ApiException>());
      expect(e.toString(), 'Trop de tentatives. Patientez une minute.');
    });

    test('a 500 is a plain "server problem" message, not "Internal server error"', () async {
      await Strings.setLang('en', persist: false);
      final Object? e = await _fails(500, {'message': 'Internal server error'}, () => auth.login('a@b.cd', 'x'));
      expect(e.toString(), 'The server had a problem. Please try again in a moment.');
    });

    test('wrong password and a suspended account arrive in French', () async {
      await Strings.setLang('fr', persist: false);
      Object? e = await _fails(401, {'message': 'Invalid email or password.'}, () => auth.login('a@b.cd', 'x'));
      expect(e.toString(), 'E-mail ou mot de passe incorrect.');
      e = await _fails(401, {'message': 'This account has been suspended. Contact support.'}, () => auth.login('a@b.cd', 'x'));
      expect(e.toString(), 'Ce compte est suspendu. Contactez l’assistance.');
    });

    test('an account with two-step sign-in answers with a challenge, not an error', () async {
      final Object? e = await _fails(200, {'needs2fa': true, 'challenge': 'abc'}, () => auth.login('a@b.cd', 'x'));
      expect(e, isA<TwoFactorRequired>());
      expect((e as TwoFactorRequired).challenge, 'abc');
    });

    test('an answer the app cannot read is a server problem, never an unexplained crash', () async {
      await Strings.setLang('en', persist: false);
      final Object? e = await _fails(200, {'oops': 1}, () => auth.login('a@b.cd', 'x'));
      expect(e, isA<ApiException>());
    });

    test('the tokens of a good sign-in parse (the wallet may be 0 or a number)', () async {
      final r = await _withServer(200, {'user': _user, 'accessToken': 'a', 'refreshToken': 'r'}, () => auth.login('a@b.cd', 'x'));
      expect(r.user.id, 'u1');
    });

    test('send results say what happened', () {
      final off = SendResult.fromJson({'sent': false, 'reason': 'not_configured', 'to': '+243•••78'});
      expect(off.notConfigured, isTrue);
      expect(off.failed, isFalse);
      expect(SendResult.fromJson({'sent': false, 'reason': 'failed'}).failed, isTrue);
      final ok = SendResult.fromJson({'sent': true, 'to': 'a***@b.cd'});
      expect(ok.sent, isTrue);
      expect(ok.notConfigured, isFalse);
      // An older server sends only `sent`.
      expect(SendResult.fromJson({'sent': false}).notConfigured, isFalse);
    });
  });

  test('an unexpected error gets the generic text (and is logged)', () async {
    await Strings.setLang('en', persist: false);
    expect(Strings.current.errorText(StateError('x')), 'Something went wrong. Please try again.');
  });

  test('masks show enough to recognise, not enough to read out', () {
    expect(maskPhone('+243 81 234 5678'), '+243•••78');
    expect(maskPhone('123'), '123');
    expect(maskEmail('amani@somba.test'), 'a***@somba.test');
  });

  test('without the native Maps key (or in tests) the map is never offered', () {
    expect(MapsConfig.enabled, isFalse);
  });

  group('verification screens', () {
    setUp(() async => gapReset());
    tearDown(() {
      RealtimeStore.instance.debugSendPhone = null;
      RealtimeStore.instance.debugSendEmail = null;
      gapTearDown();
    });

    Future<void> pump(WidgetTester t, Widget w) async {
      await t.pumpWidget(gapApp(w));
      await t.pump(const Duration(milliseconds: 400));
    }

    testWidgets('no SMS service: the screen says so instead of "code sent", and offers e-mail', (t) async {
      RealtimeStore.instance.debugSendPhone = () async => const SendResult(sent: false, reason: 'not_configured');
      await pump(t, const OtpScreen(phone: '+243812345678'));
      expect(find.byKey(const ValueKey('otp-unavailable')), findsOneWidget);
      expect(find.byKey(const ValueKey('otp-sent')), findsNothing);
      expect(find.byKey(const ValueKey('otp-use-email')), findsOneWidget);
      expect(find.byKey(const ValueKey('otp-0')), findsNothing, reason: 'no code to type');
    });

    testWidgets('code sent: boxes, the masked number, a resend timer', (t) async {
      RealtimeStore.instance.debugSendPhone = () async => const SendResult(sent: true, to: '+243•••78');
      await pump(t, const OtpScreen(phone: '+243812345678'));
      expect(find.byKey(const ValueKey('otp-sent')), findsOneWidget);
      expect(find.textContaining('+243•••78'), findsOneWidget);
      expect(find.textContaining('Resend code in'), findsOneWidget);
    });

    testWidgets('a pasted code fills the six boxes', (t) async {
      RealtimeStore.instance.debugSendPhone = () async => const SendResult(sent: true);
      await pump(t, const OtpScreen(phone: '+243812345678'));
      await t.enterText(find.byKey(const ValueKey('otp-0')), '123456');
      await t.pump();
      final digits = [for (var i = 0; i < 6; i++) (t.widget<TextField>(find.byKey(ValueKey('otp-$i'))).controller!.text)];
      expect(digits, ['1', '2', '3', '4', '5', '6']);
    });

    testWidgets('skip on the e-mail screen returns false, so a checkout does not take it for "verified"', (t) async {
      RealtimeStore.instance.debugSendEmail = () async => const SendResult(sent: true, to: 'a***@b.cd');
      bool? result;
      await t.pumpWidget(gapApp(Builder(
          builder: (ctx) => Scaffold(body: TextButton(onPressed: () async => result = await Navigator.push<bool>(ctx, MaterialPageRoute(builder: (_) => const VerifyEmailScreen())), child: const Text('go'))))));
      await t.tap(find.text('go'));
      await t.pumpAndSettle(const Duration(milliseconds: 100));
      await t.tap(find.byKey(const ValueKey('email-skip')));
      await t.pumpAndSettle(const Duration(milliseconds: 100));
      expect(result, isFalse);
    });

    testWidgets('the prompt with no channel available offers only "Not now"', (t) async {
      final s = RealtimeStore.instance;
      s
        ..requireVerifiedForCheckout = true
        ..smsAvailable = false
        ..emailAvailable = false
        ..user = BackendUser.fromJson({'id': 'u', 'email': 'a@b.cd', 'name': 'A', 'role': 'customer', 'phone': '+243812345678'});
      await t.pumpWidget(gapApp(Builder(builder: (ctx) => Scaffold(body: TextButton(onPressed: () => ensureVerified(ctx, forTopUp: false), child: const Text('go'))))));
      await t.tap(find.text('go'));
      await t.pumpAndSettle(const Duration(milliseconds: 100));
      expect(find.byKey(const ValueKey('verify-phone-btn')), findsNothing);
      expect(find.byKey(const ValueKey('verify-email-btn')), findsNothing);
      expect(find.byKey(const ValueKey('verify-choose')), findsOneWidget);
      s
        ..smsAvailable = true
        ..emailAvailable = true
        ..requireVerifiedForCheckout = false;
    });
  });
}
