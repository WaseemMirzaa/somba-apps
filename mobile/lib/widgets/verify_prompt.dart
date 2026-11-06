import 'package:flutter/material.dart';
import '../l10n/strings.dart';
import '../screens/more/auth_screens.dart' show OtpScreen, VerifyEmailScreen, maskEmail, maskPhone;
import '../services/auth_service.dart' show ApiException;
import '../services/realtime_store.dart';
import '../theme/app_theme.dart';

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
  final user = store.user;
  // What this server can send (public settings): a channel that cannot be offered is not offered.
  final phoneOn = hasPhone && store.smsAvailable;
  final emailOn = store.emailAvailable;
  final emailOk = user?.emailVerified ?? false;
  final phoneOk = user?.phoneVerified ?? false;
  final choice = await showDialog<String>(
    context: context,
    builder: (ctx) => AlertDialog(
      key: const ValueKey('verify-prompt'),
      icon: Container(
        padding: const EdgeInsets.all(AppSpace.md),
        decoration: BoxDecoration(color: AppColors.primary.withValues(alpha: 0.08), shape: BoxShape.circle),
        child: const Icon(Icons.verified_user_outlined, color: AppColors.primary, size: 30),
      ),
      title: Text(s.verifyTitle, textAlign: TextAlign.center),
      content: SingleChildScrollView(
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Text(forTopUp ? s.verifyBodyTopup : s.verifyBodyOrder, style: const TextStyle(color: AppColors.inkSoft, height: 1.4)),
          const SizedBox(height: AppSpace.lg),
          _StatusRow(key: const ValueKey('verify-row-phone'), icon: Icons.sms_outlined, label: s.vpPhoneRow, value: hasPhone ? maskPhone(phone) : s.vpNoPhone, ok: phoneOk),
          const SizedBox(height: AppSpace.sm),
          _StatusRow(key: const ValueKey('verify-row-email'), icon: Icons.mail_outline_rounded, label: s.vpEmailRow, value: maskEmail(user?.email), ok: emailOk),
          const SizedBox(height: AppSpace.lg),
          Text(!phoneOn && !emailOn ? s.vpNoChannel : s.vpChoose, key: const ValueKey('verify-choose'), style: const TextStyle(color: AppColors.muted, fontSize: 12.5)),
        ]),
      ),
      actionsAlignment: MainAxisAlignment.center,
      actionsOverflowDirection: VerticalDirection.down,
      actions: [
        if (phoneOn) FilledButton(key: const ValueKey('verify-phone-btn'), onPressed: () => Navigator.pop(ctx, 'phone'), child: Text(s.verifyPhoneBtn)),
        // One filled button per dialog: email is the primary only when there is no phone channel to verify.
        if (emailOn && phoneOn)
          OutlinedButton(key: const ValueKey('verify-email-btn'), onPressed: () => Navigator.pop(ctx, 'email'), child: Text(s.verifyEmailBtn))
        else if (emailOn)
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

/// One line of the prompt: what is to be confirmed, where, and whether it already is.
class _StatusRow extends StatelessWidget {
  final IconData icon;
  final String label;
  final String value;
  final bool ok;
  const _StatusRow({super.key, required this.icon, required this.label, required this.value, required this.ok});

  @override
  Widget build(BuildContext context) {
    final s = Strings.of(context);
    final color = ok ? AppColors.success : const Color(0xFF92400E);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: AppSpace.md, vertical: AppSpace.md),
      decoration: BoxDecoration(color: AppColors.background, borderRadius: BorderRadius.circular(14), border: Border.all(color: AppColors.line)),
      child: Row(children: [
        Icon(icon, size: 20, color: AppColors.muted),
        const SizedBox(width: AppSpace.md),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(label, style: const TextStyle(fontSize: 12, color: AppColors.muted, fontWeight: FontWeight.w600)),
            Text(value, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w700)),
          ]),
        ),
        const SizedBox(width: AppSpace.sm),
        Flexible(
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: AppSpace.sm + 2, vertical: 4),
            decoration: BoxDecoration(color: color.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(100)),
            child: Text(ok ? s.vpVerified : s.vpNotVerified, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w800, color: color)),
          ),
        ),
      ]),
    );
  }
}
