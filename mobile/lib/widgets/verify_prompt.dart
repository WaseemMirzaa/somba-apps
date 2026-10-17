import 'package:flutter/material.dart';
import '../l10n/strings.dart';
import '../screens/more/auth_screens.dart' show OtpScreen, VerifyEmailScreen;
import '../services/auth_service.dart' show ApiException;
import '../services/realtime_store.dart';

/// True when the server refused an order / top-up because the account is not verified.
bool isVerificationError(Object e) => e is ApiException && e.message.startsWith('Verify your phone number or email');

/// When the platform requires a verified phone or email before ordering or
/// topping up the wallet and this account has neither, tells the user why and
/// offers the existing verification screens instead of letting the server
/// refuse. Returns true when the user may go on right now.
Future<bool> ensureVerified(BuildContext context, {required bool forTopUp, bool force = false}) async {
  final store = RealtimeStore.instance;
  if (!force && !store.needsVerification) return true;
  final s = Strings.of(context);
  final phone = store.user?.phone;
  final choice = await showDialog<String>(
    context: context,
    builder: (ctx) => AlertDialog(
      key: const ValueKey('verify-prompt'),
      icon: const Icon(Icons.verified_user_outlined),
      title: Text(s.verifyTitle),
      content: Text(forTopUp ? s.verifyBodyTopup : s.verifyBodyOrder),
      actionsOverflowDirection: VerticalDirection.down,
      actions: [
        if ((phone ?? '').isNotEmpty) FilledButton(key: const ValueKey('verify-phone-btn'), onPressed: () => Navigator.pop(ctx, 'phone'), child: Text(s.verifyPhoneBtn)),
        FilledButton.tonal(key: const ValueKey('verify-email-btn'), onPressed: () => Navigator.pop(ctx, 'email'), child: Text(s.verifyEmailBtn)),
        TextButton(onPressed: () => Navigator.pop(ctx), child: Text(s.verifyLater)),
      ],
    ),
  );
  if (!context.mounted) return false;
  if (choice == 'phone') {
    await Navigator.push(context, MaterialPageRoute(builder: (_) => OtpScreen(phone: phone)));
  } else if (choice == 'email') {
    await Navigator.push(context, MaterialPageRoute(builder: (_) => const VerifyEmailScreen()));
  }
  // The verify screens refresh the profile; the user then taps "place order" / "send" again.
  return false;
}
