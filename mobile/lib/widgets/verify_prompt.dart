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
/// refuse. Returns true when the user may go on right now (already verified,
/// or just verified from the prompt).
Future<bool> ensureVerified(BuildContext context, {required bool forTopUp, bool force = false}) async {
  final store = RealtimeStore.instance;
  if (!force && !store.needsVerification) return true;
  final s = Strings.of(context);
  final phone = store.user?.phone;
  final hasPhone = (phone ?? '').isNotEmpty;
  final choice = await showDialog<String>(
    context: context,
    builder: (ctx) => AlertDialog(
      key: const ValueKey('verify-prompt'),
      icon: const Icon(Icons.verified_user_outlined),
      title: Text(s.verifyTitle),
      content: Text(forTopUp ? s.verifyBodyTopup : s.verifyBodyOrder),
      actionsOverflowDirection: VerticalDirection.down,
      actions: [
        if (hasPhone) FilledButton(key: const ValueKey('verify-phone-btn'), onPressed: () => Navigator.pop(ctx, 'phone'), child: Text(s.verifyPhoneBtn)),
        // One filled button per dialog: email is the primary only when there is no phone to verify.
        if (hasPhone)
          OutlinedButton(key: const ValueKey('verify-email-btn'), onPressed: () => Navigator.pop(ctx, 'email'), child: Text(s.verifyEmailBtn))
        else
          FilledButton(key: const ValueKey('verify-email-btn'), onPressed: () => Navigator.pop(ctx, 'email'), child: Text(s.verifyEmailBtn)),
        TextButton(onPressed: () => Navigator.pop(ctx), child: Text(s.verifyLater)),
      ],
    ),
  );
  if (!context.mounted) return false;
  bool? verified;
  if (choice == 'phone') {
    verified = await Navigator.push<bool>(context, MaterialPageRoute(builder: (_) => OtpScreen(phone: phone)));
  } else if (choice == 'email') {
    verified = await Navigator.push<bool>(context, MaterialPageRoute(builder: (_) => const VerifyEmailScreen()));
  }
  if (!context.mounted) return false;
  // The verify screens pop `true` and refresh the profile: the caller carries on with what the user asked for.
  if (verified == true || (choice != null && !force && !store.needsVerification)) return true;
  // "Not now", or backed out of the verify screen: say why nothing happened.
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: Text(s.verifyLaterNote)));
  return false;
}
