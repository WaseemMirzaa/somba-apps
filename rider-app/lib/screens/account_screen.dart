import 'package:flutter/material.dart';
import '../l10n/strings.dart';
import '../services/rider_store.dart';
import '../theme/app_theme.dart';
import '../widgets/ui.dart';
import 'more/rider_auth.dart' show RiderField;

/// Route names, so a test (or a sign-out) can tell these screens from the shell.
const kEditProfileRoute = 'rider/edit-profile';
const kChangePasswordRoute = 'rider/change-password';

/// The same phone rule as the server (`users.service.ts`): an optional +, then 7 to 20 digits, spaces, dashes or brackets.
final _phoneRule = RegExp(r'^\+?[0-9 ()-]{7,20}$');

/// Is [name] a valid display name (2 to 80 characters once trimmed)?
bool isValidName(String name) {
  final n = name.trim();
  return n.length >= 2 && n.length <= 80;
}

/// A phone is optional; when typed it must look like one.
bool isValidPhone(String phone) => phone.trim().isEmpty || _phoneRule.hasMatch(phone.trim());

/// The rider edits their own name and phone number. The e-mail is shown but only the fleet team can change it.
class EditProfileScreen extends StatefulWidget {
  const EditProfileScreen({super.key});
  @override
  State<EditProfileScreen> createState() => _EditProfileScreenState();
}

class _EditProfileScreenState extends State<EditProfileScreen> {
  final _store = RiderStore.instance;
  late final _name = TextEditingController(text: _store.user?.name ?? '');
  late final _phone = TextEditingController(text: _store.user?.phone ?? '');
  bool _nameBad = false, _phoneBad = false, _busy = false;

  @override
  void dispose() {
    _name.dispose();
    _phone.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final s = Strings.of(context);
    setState(() {
      _nameBad = !isValidName(_name.text);
      _phoneBad = !isValidPhone(_phone.text);
    });
    if (_nameBad || _phoneBad) return;
    setState(() => _busy = true);
    try {
      await _store.updateProfile(name: _name.text, phone: _phone.text);
      if (!mounted) return;
      showSnack(context, s.profileSaved);
      Navigator.of(context).pop();
    } catch (e) {
      if (mounted) showSnack(context, Strings.current.errorText(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = Strings.of(context);
    return Scaffold(
      appBar: backAppBar(context, s.editProfile),
      body: ListView(padding: const EdgeInsets.fromLTRB(20, 12, 20, 32), keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag, children: [
        RiderField(
          fieldKey: const ValueKey('profile-name'),
          label: s.fullName,
          hint: s.fullName,
          icon: Icons.person_outline_rounded,
          controller: _name,
          capitalization: TextCapitalization.words,
          action: TextInputAction.next,
          errorText: _nameBad ? s.errValidName : null,
          onChanged: (_) {
            if (_nameBad) setState(() => _nameBad = false);
          },
        ),
        const SizedBox(height: 16),
        RiderField(
          fieldKey: const ValueKey('profile-phone'),
          label: s.phone,
          hint: '+243 81 234 5678',
          icon: Icons.phone_outlined,
          controller: _phone,
          keyboard: TextInputType.phone,
          autocorrect: false,
          action: TextInputAction.done,
          errorText: _phoneBad ? s.errValidPhone : null,
          onChanged: (_) {
            if (_phoneBad) setState(() => _phoneBad = false);
          },
        ),
        const SizedBox(height: 16),
        Text(s.email, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13, color: AppColors.inkSoft)),
        const SizedBox(height: 6),
        SurfaceCard(
          key: const ValueKey('profile-email'),
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
          child: Row(children: [
            const Icon(Icons.lock_outline_rounded, size: 20, color: AppColors.muted),
            const SizedBox(width: 12),
            Expanded(child: Text(_store.user?.email ?? '', style: const TextStyle(color: AppColors.muted, fontSize: 14.5))),
          ]),
        ),
        const SizedBox(height: 6),
        Text(s.emailLocked, style: const TextStyle(color: AppColors.muted, fontSize: 12.5, height: 1.3)),
        const SizedBox(height: 26),
        PrimaryButton(s.save, busy: _busy, onPressed: _save),
      ]),
    );
  }
}

/// The rider changes their password: current, new, and the new one again. The server signs every other phone out and
/// answers with fresh tokens for this one.
class ChangePasswordScreen extends StatefulWidget {
  const ChangePasswordScreen({super.key});
  @override
  State<ChangePasswordScreen> createState() => _ChangePasswordScreenState();
}

class _ChangePasswordScreenState extends State<ChangePasswordScreen> {
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

  String? _currentError(Strings s) => _current.text.isEmpty ? s.errCurrentPassword : null;
  String? _nextError(Strings s) {
    if (_next.text.length < 8) return s.errShortPassword;
    if (_next.text == _current.text) return s.errSamePassword;
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
      showSnack(context, s.passwordChanged);
      Navigator.of(context).pop();
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

    return Scaffold(
      appBar: backAppBar(context, s.changePassword),
      body: ListView(padding: const EdgeInsets.fromLTRB(20, 12, 20, 32), keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag, children: [
        Text(s.changePasswordSub, style: const TextStyle(color: AppColors.muted, fontSize: 13.5, height: 1.4)),
        const SizedBox(height: 18),
        RiderField(
          fieldKey: const ValueKey('password-current'),
          label: s.currentPassword,
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
          fieldKey: const ValueKey('password-new'),
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
          fieldKey: const ValueKey('password-again'),
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
        const SizedBox(height: 10),
        Text(s.passwordOtherPhones, style: const TextStyle(color: AppColors.muted, fontSize: 12.5, height: 1.3)),
        const SizedBox(height: 26),
        PrimaryButton(s.save, busy: _busy, onPressed: _save),
      ]),
    );
  }
}
