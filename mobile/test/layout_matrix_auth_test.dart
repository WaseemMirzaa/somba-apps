// Round 3: sign-in, sign-up, recovery, phone and e-mail verification (every state the server can leave them in), the
// verification prompt at checkout, the two-step sign-in dialog and the address book / form without a map, at two phone
// widths (360 and 402 pt), in English and French, at text scale 1.0 and 1.3, with the app's real fonts, and with the
// keyboard open where the screen has fields. Fails on any overflow, a button label that wraps or is cut, text over text,
// an icon on a label button, or two filled buttons.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lipcart/screens/more/account_more.dart';
import 'package:lipcart/screens/more/auth_screens.dart';
import 'package:lipcart/screens/more/support_extra.dart';
import 'package:lipcart/services/auth_service.dart';
import 'package:lipcart/services/maps_config.dart';
import 'package:lipcart/services/models.dart';
import 'package:lipcart/services/realtime_store.dart';
import 'package:lipcart/widgets/verify_prompt.dart';

import 'gap_helpers.dart';
import 'matrix_helpers.dart';

BackendUser _user({bool phoneVerified = false, bool emailVerified = false, String phone = '+243812345678'}) => BackendUser.fromJson({
      'id': 'u1',
      'email': 'amani.mukendi.long.address@somba-teka.example',
      'name': 'Amani Mukendi',
      'role': 'customer',
      'phone': phone,
      'phoneVerified': phoneVerified,
      'emailVerified': emailVerified,
    });

const _sent = SendResult(sent: true, to: '+243•••78');
const _sentMail = SendResult(sent: true, to: 'a***@somba-teka.example');
const _off = SendResult(sent: false, reason: 'not_configured');
const _failed = SendResult(sent: false, reason: 'failed');

/// A button that opens [open] once pumped, so a dialog is on screen for the checks.
Widget _opener(Future<void> Function(BuildContext) open) => Builder(
      builder: (ctx) => Scaffold(body: Align(alignment: Alignment.topLeft, child: SafeArea(child: TextButton(key: const ValueKey('open'), onPressed: () => open(ctx), child: const Text('open'))))),
    );

Future<void> _seed(String lang) async {
  await gapReset(lang: lang);
  final store = RealtimeStore.instance;
  store.user = _user();
  store.requireVerifiedForCheckout = true;
  store.requirePinnedAddress = true;
  store.translationAvailable = true;
  store.smsAvailable = true;
  store.emailAvailable = true;
  store.debugSendPhone = () async => _sent;
  store.debugSendEmail = () async => _sentMail;
  MapsConfig.debugEnabledOverride = false;
}

void _tearDown() {
  final store = RealtimeStore.instance;
  store.debugSendPhone = null;
  store.debugSendEmail = null;
  store.smsAvailable = true;
  store.emailAvailable = true;
  store.requirePinnedAddress = false;
  MapsConfig.debugEnabledOverride = null;
}

Future<void> _keyboard(WidgetTester tester) async {
  tester.view.viewInsets = const FakeViewPadding(bottom: 291 * 3); // an iPhone keyboard, in physical pixels
  await tester.pump(const Duration(milliseconds: 300));
}

void main() {
  setUp(() => TestWidgetsFlutterBinding.ensureInitialized());
  tearDown(() {
    _tearDown();
  });

  registerLayoutMatrix(
    {
      'sign in': (l) => const LoginScreen(),
      'sign up': (l) => const RegisterScreen(),
      'phone sign-in': (l) => const PhoneLoginScreen(),
      'forgot password': (l) => const ForgotScreen(initialEmail: 'amani.mukendi.long.address@somba-teka.example'),
      'reset password': (l) => const ResetPasswordScreen(),
      'verify phone: code sent': (l) => const OtpScreen(phone: '+243812345678'),
      'verify phone: no SMS service': (l) {
        RealtimeStore.instance.debugSendPhone = () async => _off;
        return const OtpScreen(phone: '+243812345678');
      },
      'verify phone: no SMS and no e-mail service': (l) {
        RealtimeStore.instance
          ..debugSendPhone = (() async => _off)
          ..emailAvailable = false;
        return const OtpScreen(phone: '+243812345678');
      },
      'verify phone: provider refused': (l) {
        RealtimeStore.instance.debugSendPhone = () async => _failed;
        return const OtpScreen(phone: '+243812345678');
      },
      'verify phone: server error': (l) {
        RealtimeStore.instance.debugSendPhone = () async => throw ApiException.local('err_rate_limit', status: 429);
        return const OtpScreen(phone: '+243812345678');
      },
      'verify e-mail: link sent': (l) => const VerifyEmailScreen(),
      'verify e-mail: no e-mail service, phone offered': (l) {
        RealtimeStore.instance.debugSendEmail = () async => _off;
        return const VerifyEmailScreen();
      },
      'verify e-mail: no e-mail and no SMS service': (l) {
        RealtimeStore.instance
          ..debugSendEmail = (() async => _off)
          ..smsAvailable = false;
        return const VerifyEmailScreen();
      },
      'verify e-mail: provider refused': (l) {
        RealtimeStore.instance.debugSendEmail = () async => _failed;
        return const VerifyEmailScreen();
      },
      'checkout prompt: phone and e-mail': (l) => _opener((c) async {
            await ensureVerified(c, forTopUp: false);
          }),
      'checkout prompt: no phone on the account': (l) {
        RealtimeStore.instance.user = _user(phone: '');
        return _opener((c) async {
          await ensureVerified(c, forTopUp: true);
        });
      },
      'checkout prompt: no SMS service': (l) {
        RealtimeStore.instance.smsAvailable = false;
        return _opener((c) async {
          await ensureVerified(c, forTopUp: false);
        });
      },
      'checkout prompt: no way to verify yet': (l) {
        RealtimeStore.instance
          ..smsAvailable = false
          ..emailAvailable = false;
        return _opener((c) async {
          await ensureVerified(c, forTopUp: false);
        });
      },
      'two-step sign-in dialog': (l) => _opener((c) async {
            await askTwoFactor(c, 'challenge');
          }),
      'address book: empty': (l) => AddressBookScreen(locale: l),
      'address form: no map, a pin is required': (l) => AddressFormScreen(locale: l),
    },
    seed: _seed,
    tearDownFakes: _tearDown,
    afterPump: (tester, screen) async {
      if (screen.startsWith('checkout prompt') || screen == 'two-step sign-in dialog') {
        await tester.tap(find.byKey(const ValueKey('open')));
        await tester.pump(const Duration(milliseconds: 600));
        return;
      }
      await tester.pump(const Duration(milliseconds: 400)); // the verification screens ask the server on open
      // Screens with fields are checked with the keyboard up as well.
      if (const {'sign in', 'sign up', 'phone sign-in', 'forgot password', 'reset password', 'address form: no map, a pin is required'}.contains(screen)) {
        await _keyboard(tester);
      }
    },
  );
}
