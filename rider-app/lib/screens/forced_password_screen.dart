import 'package:flutter/material.dart';
import '../l10n/strings.dart';
import '../services/rider_store.dart';
import '../theme/app_theme.dart';
import '../widgets/ui.dart';
import 'more/rider_auth.dart' show RiderField;

/// Route-less screen the app shows INSTEAD of the shell while the rider's account still has the temporary password an
/// administrator made (`RiderStore.mustChangePassword`): the server refuses everything else (`password_change_required`).
/// Temporary password, new password, confirmation. When the change is accepted the store clears the flag, reconnects with the
/// fresh tokens and the app goes on to the shell on its own. The rider can also sign out.
class ForcedPasswordScreen extends StatefulWidget {
  /// Sign out (the app returns to the sign-in screen).
  final VoidCallback onSignOut;
  const ForcedPasswordScreen({super.key, required this.onSignOut});
  @override
  State<ForcedPasswordScreen> createState() => _ForcedPasswordScreenState();
}

class _ForcedPasswordScreenState extends State<ForcedPasswordScreen> {
  final _current = TextEditingController();
  final _next = TextEditingController();
  final _again = TextEditingController();
  bool _busy = false;
  bool _submitted = false;

  @override
  void dispose() {
    _current.dispose();
    _next.dispose();
    _again.dispose();
    super.dispose();
  }

  String? _currentError(Strings s) => _current.text.isEmpty ? s.errTemporaryPassword : null;
  String? _nextError(Strings s) {
    if (_next.text.length < 8) return s.errShortPassword;
    if (_next.text == _current.text) return s.errSameAsTemporary;
    return null;
  }

  String? _againError(Strings s) => _again.text != _next.text ? s.errPasswordMismatch : null;

  Future<void> _save() async {
    final s = Strings.of(context);
    setState(() => _submitted = true);
    if (_currentError(s) != null || _nextError(s) != null || _againError(s) != null) return;
    setState(() => _busy = true);
    try {
      await RiderStore.instance.changePassword(current: _current.text, next: _next.text);
      if (!mounted) return;
      showSnack(context, s.passwordChanged); // the shell replaces this screen as soon as the store clears the flag
    } catch (e) {
      if (mounted) showSnack(context, Strings.current.errorText(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = Strings.of(context);
    void again() {
      if (_submitted) setState(() {});
    }

    final top = MediaQuery.of(context).padding.top;
    return Scaffold(
      body: ListView(
        padding: EdgeInsets.zero,
        keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
        children: [
          Container(
            padding: EdgeInsets.fromLTRB(24, top + 36, 24, 32),
            decoration: const BoxDecoration(gradient: AppColors.brandGradient, borderRadius: BorderRadius.vertical(bottom: Radius.circular(32))),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                Container(
                    height: 52,
                    width: 52,
                    decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(16)),
                    child: const Icon(Icons.lock_reset_rounded, color: AppColors.primary, size: 30)),
                const SizedBox(width: 12),
                // Large text must not push the toggle out of the row: it shrinks instead.
                Expanded(
                  child: FittedBox(
                    fit: BoxFit.scaleDown,
                    alignment: Alignment.centerRight,
                    child: LanguageToggle(key: const ValueKey('lang-toggle'), label: s.langSwitchTo, onTap: () => Strings.setLang(s.isFr ? 'en' : 'fr')),
                  ),
                ),
              ]),
              const SizedBox(height: 16),
              Text(s.forcedPasswordTitle,
                  key: const ValueKey('forced-password-title'),
                  style: const TextStyle(color: Colors.white, fontSize: 25, fontWeight: FontWeight.w800, fontFamily: 'PlusJakartaSans', letterSpacing: -0.5)),
              const SizedBox(height: 8),
              Text(s.forcedPasswordBody, style: TextStyle(color: Colors.white.withValues(alpha: 0.92), fontSize: 14, height: 1.4)),
            ]),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 20, 20, 32),
            child: Column(children: [
              RiderField(
                fieldKey: const ValueKey('forced-current'),
                label: s.temporaryPassword,
                hint: s.passwordHint,
                icon: Icons.lock_outline_rounded,
                obscure: true,
                autocorrect: false,
                controller: _current,
                action: TextInputAction.next,
                errorText: _submitted ? _currentError(s) : null,
                onChanged: (_) => again(),
              ),
              const SizedBox(height: 16),
              RiderField(
                fieldKey: const ValueKey('forced-new'),
                label: s.newPassword,
                hint: s.passwordMinHint,
                icon: Icons.lock_outline_rounded,
                obscure: true,
                autocorrect: false,
                controller: _next,
                action: TextInputAction.next,
                errorText: _submitted ? _nextError(s) : null,
                onChanged: (_) => again(),
              ),
              const SizedBox(height: 16),
              RiderField(
                fieldKey: const ValueKey('forced-again'),
                label: s.confirmPassword,
                hint: s.passwordMinHint,
                icon: Icons.lock_outline_rounded,
                obscure: true,
                autocorrect: false,
                controller: _again,
                action: TextInputAction.done,
                errorText: _submitted ? _againError(s) : null,
                onChanged: (_) => again(),
              ),
              const SizedBox(height: 26),
              // Label only (no icon); the label shrinks to one line at large text, and busy swaps it for a spinner of the same height.
              SizedBox(
                width: double.infinity,
                child: FilledButton(
                  key: const ValueKey('forced-save'),
                  onPressed: _busy ? null : _save,
                  child: _busy ? const ButtonSpinner() : ButtonLabel(s.forcedPasswordSave),
                ),
              ),
              const SizedBox(height: 8),
              TextButton(
                key: const ValueKey('forced-sign-out'),
                onPressed: _busy ? null : widget.onSignOut,
                style: TextButton.styleFrom(foregroundColor: AppColors.muted),
                child: Text(s.signOut, style: const TextStyle(fontWeight: FontWeight.w700)),
              ),
            ]),
          ),
        ],
      ),
    );
  }
}
