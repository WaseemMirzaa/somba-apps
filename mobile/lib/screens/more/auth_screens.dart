import 'dart:async';
import 'package:flutter/material.dart';
import '../../widgets/mobile_money.dart';
import 'package:flutter/gestures.dart' show TapGestureRecognizer;
import 'package:flutter/services.dart';
import 'package:flutter/foundation.dart' show kDebugMode;
import '../../l10n/strings.dart';
import '../../services/auth_service.dart'
    show ApiException, SendResult, TwoFactorRequired;
import '../../services/realtime_store.dart';
import '../../theme/app_theme.dart';
import '../../widgets/brand_logo.dart';
import '../../widgets/feedback.dart';

// ================= Splash =================
class CustomerSplashScreen extends StatefulWidget {
  final VoidCallback onDone;
  const CustomerSplashScreen({super.key, required this.onDone});
  @override
  State<CustomerSplashScreen> createState() => _CustomerSplashScreenState();
}

class _CustomerSplashScreenState extends State<CustomerSplashScreen>
    with SingleTickerProviderStateMixin {
  Timer? _t;
  late final AnimationController _c = AnimationController(
      vsync: this, duration: const Duration(milliseconds: 900))
    ..forward();

  @override
  void initState() {
    super.initState();
    _t = Timer(const Duration(milliseconds: 1600), widget.onDone);
  }

  @override
  void dispose() {
    _t?.cancel();
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: AuthBackdrop(
        child: Center(
          child: FadeTransition(
            opacity: _c,
            child: ScaleTransition(
              scale: Tween(begin: 0.85, end: 1.0).animate(
                  CurvedAnimation(parent: _c, curve: Curves.easeOutBack)),
              child: Column(mainAxisSize: MainAxisSize.min, children: [
                const BrandLogo(size: 116, radius: 30),
                const SizedBox(height: 24),
                const Text('Somba&Teka',
                    style: TextStyle(
                        color: Colors.white,
                        fontSize: 30,
                        fontWeight: FontWeight.w800,
                        fontFamily: 'PlusJakartaSans',
                        letterSpacing: -0.6)),
                const SizedBox(height: 8),
                Text(Strings.of(context).splashTagline,
                    style: TextStyle(
                        color: Colors.white.withValues(alpha: 0.9),
                        fontSize: 14.5,
                        fontWeight: FontWeight.w600)),
                const SizedBox(height: 40),
                SizedBox(
                    height: 26,
                    width: 26,
                    child: CircularProgressIndicator(
                        strokeWidth: 2.6,
                        valueColor: AlwaysStoppedAnimation(
                            Colors.white.withValues(alpha: 0.9)))),
              ]),
            ),
          ),
        ),
      ),
    );
  }
}

// ============ Shared glassy layout ============
class _AuthPage extends StatelessWidget {
  final String title;
  final String subtitle;
  final Widget form;
  final bool showBack;
  const _AuthPage(
      {required this.title,
      required this.subtitle,
      required this.form,
      this.showBack = false});

  @override
  Widget build(BuildContext context) {
    final top = MediaQuery.of(context).padding.top;
    return Scaffold(
      body: AuthBackdrop(
        child: SafeArea(
          child: Stack(children: [
            if (showBack)
              Positioned(
                left: 8,
                top: 4,
                child: Material(
                  color: Colors.white.withValues(alpha: 0.2),
                  shape: const CircleBorder(),
                  child: InkWell(
                    customBorder: const CircleBorder(),
                    onTap: () => Navigator.of(context).maybePop(),
                    child: const Padding(
                        padding: EdgeInsets.all(9),
                        child: Icon(Icons.arrow_back_rounded,
                            color: Colors.white, size: 22)),
                  ),
                ),
              ),
            ListView(
              padding:
                  EdgeInsets.fromLTRB(22, top + (showBack ? 8 : 40), 22, 30),
              children: [
                const Center(child: BrandLogo(size: 78, radius: 22)),
                const SizedBox(height: 18),
                Text(title,
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                        color: Colors.white,
                        fontSize: 26,
                        fontWeight: FontWeight.w800,
                        fontFamily: 'PlusJakartaSans',
                        letterSpacing: -0.5)),
                const SizedBox(height: 6),
                Text(subtitle,
                    textAlign: TextAlign.center,
                    style: TextStyle(
                        color: Colors.white.withValues(alpha: 0.92),
                        fontSize: 14)),
                const SizedBox(height: 24),
                GlassCard(child: form),
              ],
            ),
            Positioned(
              right: 8,
              top: 4,
              child: Material(
                color: Colors.white.withValues(alpha: 0.2),
                shape: const StadiumBorder(),
                child: InkWell(
                  key: const ValueKey('lang-toggle'),
                  customBorder: const StadiumBorder(),
                  onTap: () =>
                      Strings.setLang(Strings.of(context).isFr ? 'en' : 'fr'),
                  child: Padding(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
                    child: Row(mainAxisSize: MainAxisSize.min, children: [
                      const Icon(Icons.translate_rounded,
                          color: Colors.white, size: 18),
                      const SizedBox(width: 6),
                      // Each language is named in its own language.
                      Text(Strings.of(context).langSwitchTo,
                          style: const TextStyle(
                              color: Colors.white,
                              fontWeight: FontWeight.w700,
                              fontSize: 13)),
                    ]),
                  ),
                ),
              ),
            ),
          ]),
        ),
      ),
    );
  }
}

// A labelled field with an inline error slot.
class _GlassField extends StatelessWidget {
  final String label, hint;
  final IconData icon;
  final bool obscure;
  final TextEditingController? controller;
  final TextInputType? keyboard;
  final String? error;
  final Widget? prefix;
  final List<TextInputFormatter>? formatters;
  const _GlassField({
    required this.label,
    required this.hint,
    required this.icon,
    this.obscure = false,
    this.controller,
    this.keyboard,
    this.error,
    this.prefix,
    this.formatters,
  });
  @override
  Widget build(BuildContext context) {
    OutlineInputBorder b(Color c, [double w = 1]) => OutlineInputBorder(
        borderRadius: BorderRadius.circular(16),
        borderSide: BorderSide(color: c, width: w));
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(label,
          style: const TextStyle(
              fontWeight: FontWeight.w700,
              fontSize: 12.5,
              color: AppColors.inkSoft)),
      const SizedBox(height: 6),
      TextField(
        controller: controller,
        obscureText: obscure,
        keyboardType: keyboard,
        inputFormatters: formatters,
        decoration: InputDecoration(
          hintText: hint,
          prefixIcon: prefix ?? Icon(icon, size: 20),
          prefixIconConstraints: prefix != null
              ? const BoxConstraints(minWidth: 96, minHeight: 48)
              : null,
          filled: true,
          fillColor: AppColors.background,
          enabledBorder: b(error != null ? AppColors.danger : AppColors.line),
          focusedBorder:
              b(error != null ? AppColors.danger : AppColors.primary, 1.6),
          border: b(AppColors.line),
          contentPadding:
              const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
        ),
      ),
      if (error != null)
        Padding(
          padding: const EdgeInsets.only(top: 5, left: 4),
          child: Text(error!,
              style: const TextStyle(
                  color: AppColors.danger,
                  fontSize: 11.5,
                  fontWeight: FontWeight.w600)),
        ),
    ]);
  }
}

// ============ Two-step sign-in ============
/// Asks for the 6-digit authenticator code (or a recovery code) after a password or phone code that was right but
/// belongs to an account with two-factor sign-in. Returns true once the session is open.
Future<bool> askTwoFactor(BuildContext context, String challenge) async {
  final ctl = TextEditingController();
  String? err;
  bool busy = false;
  final ok = await showDialog<bool>(
    context: context,
    barrierDismissible: false,
    builder: (ctx) => StatefulBuilder(builder: (ctx, setDlg) {
      final s = Strings.of(ctx);
      return AlertDialog(
        key: const ValueKey('twofa-dialog'),
        icon: const Icon(Icons.shield_outlined),
        title: Text(s.tfTitle),
        content: SingleChildScrollView(
          child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(s.tfBody,
                    style: const TextStyle(
                        fontSize: 13.5, height: 1.4, color: AppColors.inkSoft)),
                const SizedBox(height: 14),
                KeyedSubtree(
                  key: const ValueKey('twofa-code'),
                  child: _GlassField(
                      label: s.tfCode,
                      hint: s.tfCodeHint,
                      icon: Icons.password_rounded,
                      controller: ctl,
                      keyboard: TextInputType.visiblePassword,
                      error: err),
                ),
              ]),
        ),
        actionsOverflowDirection: VerticalDirection.down,
        actions: [
          FilledButton(
            key: const ValueKey('twofa-submit'),
            onPressed: busy
                ? null
                : () async {
                    if (ctl.text.trim().isEmpty) {
                      setDlg(() => err = s.tfErrEmpty);
                      return;
                    }
                    setDlg(() {
                      err = null;
                      busy = true;
                    });
                    try {
                      await RealtimeStore.instance
                          .loginWithTwoFactor(challenge, ctl.text);
                      if (ctx.mounted) Navigator.pop(ctx, true);
                    } catch (e, st) {
                      final m = Strings.current.errorText(e, st);
                      setDlg(() {
                        busy = false;
                        err = m;
                      });
                      if (context.mounted) showSnack(context, m);
                    }
                  },
            child: busy
                ? const SizedBox(
                    height: 18,
                    width: 18,
                    child: CircularProgressIndicator(
                        strokeWidth: 2.2, color: Colors.white))
                : Text(s.tfSubmit),
          ),
          TextButton(
              onPressed: busy ? null : () => Navigator.pop(ctx, false),
              child: Text(s.tfCancel)),
        ],
      );
    }),
  );
  ctl.dispose();
  return ok == true;
}

// ============ Sign in ============
class LoginScreen extends StatefulWidget {
  final VoidCallback? onAuthed;
  const LoginScreen({super.key, this.onAuthed});
  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _email = TextEditingController();
  final _pass = TextEditingController();
  String? _emailErr, _passErr;
  bool _loading = false;

  @override
  void dispose() {
    _email.dispose();
    _pass.dispose();
    super.dispose();
  }

  bool _validEmail(String s) =>
      RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$').hasMatch(s);

  Future<void> _signIn() async {
    final s = Strings.of(context);
    setState(() {
      _emailErr = _email.text.trim().isEmpty
          ? s.errEnterEmail
          : (!_validEmail(_email.text.trim()) ? s.errValidEmail : null);
      _passErr = _pass.text.isEmpty ? s.errEnterPassword : null;
    });
    if (_emailErr != null || _passErr != null) return;
    setState(() => _loading = true);
    try {
      await RealtimeStore.instance.login(_email.text.trim(), _pass.text);
      if (!mounted) return;
      widget.onAuthed?.call();
    } on TwoFactorRequired catch (t) {
      if (!mounted) return;
      if (await askTwoFactor(context, t.challenge) && mounted) {
        widget.onAuthed?.call();
      }
    } catch (e, st) {
      if (!mounted) return;
      final m = Strings.current.errorText(e, st);
      setState(() => _passErr = m);
      showSnack(context,
          m); // the inline text is additive: a failure is always announced too
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = Strings.of(context);
    return _AuthPage(
      title: s.welcomeBack,
      subtitle: s.signinSubtitle,
      form: Column(children: [
        KeyedSubtree(
            key: const ValueKey('login-email'),
            child: _GlassField(
                label: s.email,
                hint: s.emailHint,
                icon: Icons.mail_outline_rounded,
                controller: _email,
                keyboard: TextInputType.emailAddress,
                error: _emailErr)),
        const SizedBox(height: 14),
        KeyedSubtree(
            key: const ValueKey('login-password'),
            child: _GlassField(
                label: s.password,
                hint: '••••••••',
                icon: Icons.lock_outline_rounded,
                obscure: true,
                controller: _pass,
                error: _passErr)),
        Align(
          alignment: Alignment.centerRight,
          child: TextButton(
            onPressed: () => Navigator.push(
                context,
                MaterialPageRoute(
                    builder: (_) =>
                        ForgotScreen(initialEmail: _email.text.trim()))),
            style: TextButton.styleFrom(foregroundColor: AppColors.primary),
            child: Text(s.forgotPassword,
                style: const TextStyle(
                    fontWeight: FontWeight.w700, fontSize: 12.5)),
          ),
        ),
        const SizedBox(height: 4),
        AuthButton(s.signIn, loading: _loading, onPressed: _signIn),
        const SizedBox(height: 6),
        TextButton(
          key: const ValueKey('go-phone-login'),
          onPressed: () => Navigator.push(
              context,
              MaterialPageRoute(
                  builder: (_) => PhoneLoginScreen(onAuthed: widget.onAuthed))),
          style: TextButton.styleFrom(foregroundColor: AppColors.primary),
          child: Text(s.phoneLoginLink,
              style: const TextStyle(fontWeight: FontWeight.w700)),
        ),
        const SizedBox(height: 22),
        Center(
          child: GestureDetector(
            key: const ValueKey('go-register'),
            onTap: () => Navigator.push(
                context,
                MaterialPageRoute(
                    builder: (_) => RegisterScreen(onAuthed: widget.onAuthed))),
            child: RichText(
                text: TextSpan(
                    style:
                        const TextStyle(color: AppColors.muted, fontSize: 13.5),
                    children: [
                  TextSpan(text: '${s.newHere}  '),
                  TextSpan(
                      text: s.createAccountLink,
                      style: const TextStyle(
                          color: AppColors.primary,
                          fontWeight: FontWeight.w700)),
                ])),
          ),
        ),
      ]),
    );
  }
}

// ============ Create account ============
class RegisterScreen extends StatefulWidget {
  final VoidCallback? onAuthed;
  const RegisterScreen({super.key, this.onAuthed});
  @override
  State<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends State<RegisterScreen> {
  final _name = TextEditingController();
  final _phone = TextEditingController();
  final _email = TextEditingController();
  final _pass = TextEditingController();
  final _confirm = TextEditingController();
  String _dial = '+243';
  bool _agree = false;
  late final TapGestureRecognizer _termsTap = TapGestureRecognizer()
    ..onTap = () => showTermsDialog(context);
  bool _loading = false;
  String? _nameErr, _phoneErr, _emailErr, _passErr, _confirmErr;

  List<(String, String, String)> _codes(Strings s) => [
        ('🇨🇩', '+243', s.countryCd),
        ('🇨🇬', '+242', s.countryCg),
        ('🇫🇷', '+33', s.countryFr),
        ('🇧🇪', '+32', s.countryBe),
        ('🇰🇪', '+254', s.countryKe),
        ('🇿🇦', '+27', s.countryZa),
      ];

  @override
  void dispose() {
    for (final c in [_name, _phone, _email, _pass, _confirm]) {
      c.dispose();
    }
    _termsTap.dispose();
    super.dispose();
  }

  bool _validEmail(String s) =>
      RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$').hasMatch(s);

  Future<void> _submit() async {
    final s = Strings.of(context);
    setState(() {
      _nameErr = _name.text.trim().length < 2 ? s.regErrName : null;
      _phoneErr = _phone.text.trim().length < 6 ? s.regErrPhone : null;
      _emailErr = !_validEmail(_email.text.trim()) ? s.errValidEmail : null;
      _passErr = _pass.text.length < 8 ? s.regErrPass : null;
      _confirmErr = _confirm.text != _pass.text ? s.regErrMatch : null;
    });
    if ([_nameErr, _phoneErr, _emailErr, _passErr, _confirmErr]
        .any((e) => e != null)) {
      return;
    }
    if (!_agree) {
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(s.regAcceptTerms)));
      return;
    }
    setState(() => _loading = true);
    try {
      final phone =
          '$_dial${_phone.text.trim().replaceFirst(RegExp(r'^0+'), '')}';
      await RealtimeStore.instance.register(
        email: _email.text.trim(),
        password: _pass.text,
        name: _name.text.trim(),
        phone: phone,
        locale: Localizations.localeOf(context).languageCode,
      );
      if (!mounted) return;
      _goVerify(phone);
    } catch (e, st) {
      if (!mounted) return;
      // The account may exist already: a previous attempt can have been accepted by the server and then lost on the
      // way back (a dropped connection, a phone that could not store the session). Same email and password as typed:
      // sign in with them instead of leaving the customer stuck between "something went wrong" and "email exists".
      if (e is ApiException && e.status == 409 && await _recoverByLogin(s)) {
        return;
      }
      if (!mounted) return;
      // Decide which field the server complaint is about from its (English) text; show it translated.
      final raw = (e is ApiException ? e.message : '').toLowerCase();
      final exists = e is ApiException && e.status == 409;
      final m = exists ? s.regExistsSignin : Strings.current.errorText(e, st);
      setState(() {
        if (raw.contains('email')) {
          _emailErr = m;
        } else if (raw.contains('password')) {
          _passErr = m;
        } else {
          _confirmErr = m;
        }
      });
      showSnack(context, m,
          action: exists
              ? SnackBarAction(
                  label: s.regGoSignin,
                  onPressed: () => Navigator.of(context).maybePop())
              : null);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  /// "This email already has an account": try to sign in with what was typed. True when that worked (the account was
  /// ours, created by an earlier attempt) and the flow went on to verification.
  Future<bool> _recoverByLogin(Strings s) async {
    try {
      await RealtimeStore.instance.login(_email.text.trim(), _pass.text);
    } catch (_) {
      return false; // not ours (another password), or two-step on: the message says to sign in
    }
    if (!mounted) return true;
    showSnack(context, s.regRecovered);
    _goVerify('$_dial${_phone.text.trim().replaceFirst(RegExp(r'^0+'), '')}');
    return true;
  }

  void _goVerify(String phone) {
    // The account exists and is signed in. Verifying the phone and email is encouraged but never blocks shopping.
    Navigator.push(
      context,
      MaterialPageRoute(
          builder: (_) => OtpScreen(
              phone: phone,
              onAuthed: () => Navigator.push(
                  context,
                  MaterialPageRoute(
                      builder: (_) =>
                          VerifyEmailScreen(onVerified: _finish))))),
    );
  }

  void _finish() {
    Navigator.of(context).popUntil((r) => r.isFirst);
    widget.onAuthed?.call();
  }

  void _pickCode() {
    final s = Strings.of(context);
    showModalBottomSheet(
      context: context,
      builder: (_) => SafeArea(
          child: Column(mainAxisSize: MainAxisSize.min, children: [
        Padding(
            padding: const EdgeInsets.all(16),
            child: Text(s.regSelectCode,
                style: const TextStyle(
                    fontWeight: FontWeight.w800, fontSize: 16))),
        ..._codes(s).map((c) => ListTile(
              leading: Text(c.$1, style: const TextStyle(fontSize: 22)),
              title: Text(c.$3),
              trailing: Text(c.$2,
                  style: const TextStyle(
                      fontWeight: FontWeight.w700, color: AppColors.primary)),
              onTap: () {
                setState(() => _dial = c.$2);
                Navigator.pop(context);
              },
            )),
        const SizedBox(height: 8),
      ])),
    );
  }

  @override
  Widget build(BuildContext context) {
    final s = Strings.of(context);
    return _AuthPage(
      title: s.registerTitle,
      subtitle: s.registerSubtitle,
      showBack: true,
      form: Column(children: [
        KeyedSubtree(
            key: const ValueKey('reg-name'),
            child: _GlassField(
                label: s.fullName,
                hint: s.regNameHint,
                icon: Icons.person_outline_rounded,
                controller: _name,
                error: _nameErr)),
        const SizedBox(height: 14),
        KeyedSubtree(
          key: const ValueKey('reg-phone'),
          child: _GlassField(
            label: s.regPhoneLabel,
            hint: s.regPhoneHint,
            icon: Icons.phone_outlined,
            controller: _phone,
            keyboard: TextInputType.phone,
            error: _phoneErr,
            formatters: [FilteringTextInputFormatter.digitsOnly],
            prefix: GestureDetector(
              onTap: _pickCode,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 6),
                alignment: Alignment.center,
                width: 96,
                child: Row(mainAxisSize: MainAxisSize.min, children: [
                  Text(_dial,
                      style: const TextStyle(
                          fontWeight: FontWeight.w700, fontSize: 13)),
                  const Icon(Icons.arrow_drop_down_rounded,
                      size: 18, color: AppColors.muted),
                ]),
              ),
            ),
          ),
        ),
        const SizedBox(height: 14),
        KeyedSubtree(
            key: const ValueKey('reg-email'),
            child: _GlassField(
                label: s.email,
                hint: s.emailHint,
                icon: Icons.mail_outline_rounded,
                controller: _email,
                keyboard: TextInputType.emailAddress,
                error: _emailErr)),
        const SizedBox(height: 14),
        KeyedSubtree(
            key: const ValueKey('reg-password'),
            child: _GlassField(
                label: s.password,
                hint: s.regPassHint,
                icon: Icons.lock_outline_rounded,
                obscure: true,
                controller: _pass,
                error: _passErr)),
        const SizedBox(height: 14),
        KeyedSubtree(
            key: const ValueKey('reg-confirm'),
            child: _GlassField(
                label: s.regConfirm,
                hint: s.regConfirmHint,
                icon: Icons.lock_reset_rounded,
                obscure: true,
                controller: _confirm,
                error: _confirmErr)),
        const SizedBox(height: 14),
        GestureDetector(
          key: const ValueKey('reg-terms'),
          behavior: HitTestBehavior.opaque,
          onTap: () => setState(() => _agree = !_agree),
          child: Row(children: [
            Icon(
                _agree
                    ? Icons.check_box_rounded
                    : Icons.check_box_outline_blank_rounded,
                color: AppColors.primary,
                size: 22),
            const SizedBox(width: 8),
            Expanded(
                child: RichText(
                    text: TextSpan(
                        style: const TextStyle(
                            color: AppColors.muted, fontSize: 12.5),
                        children: [
                  TextSpan(text: '${s.regAgree} '),
                  TextSpan(
                      text: s.regTermsLink,
                      recognizer: _termsTap,
                      style: const TextStyle(
                          color: AppColors.primary,
                          fontWeight: FontWeight.w700,
                          decoration: TextDecoration.underline)),
                ]))),
          ]),
        ),
        const SizedBox(height: 18),
        AuthButton(s.registerTitle, loading: _loading, onPressed: _submit),
      ]),
    );
  }
}

// ============ Verification helpers ============
/// `+243 97 ••• 56`: enough for the customer to recognise their number, not enough to read it out loud in a shop.
String maskPhone(String? raw) {
  final p = (raw ?? '').replaceAll(RegExp(r'\s'), '');
  if (p.length < 7) return p;
  return '${p.substring(0, 4)}•••${p.substring(p.length - 2)}';
}

/// `m***@somba.test`.
String maskEmail(String? raw) {
  final e = (raw ?? '').trim();
  final at = e.indexOf('@');
  if (at < 1) return e;
  return '${e[0]}***${e.substring(at)}';
}

/// "0:07" for the resend timers.
String _clock(int seconds) =>
    '${seconds ~/ 60}:${(seconds % 60).toString().padLeft(2, '0')}';

/// A calm information block inside the verification card: [tone] picks the colours (info, warning, or problem).
enum _NoticeTone { info, warning }

class _VerifyNotice extends StatelessWidget {
  final _NoticeTone tone;
  final IconData icon;
  final String title;
  final String? body;
  const _VerifyNotice(
      {super.key,
      required this.tone,
      required this.icon,
      required this.title,
      this.body});

  @override
  Widget build(BuildContext context) {
    final warn = tone == _NoticeTone.warning;
    final fg = warn ? const Color(0xFF92400E) : AppColors.inkSoft;
    return Container(
      padding: const EdgeInsets.all(AppSpace.lg),
      decoration: BoxDecoration(
        color: warn
            ? const Color(0xFFFFFBEB)
            : AppColors.primary.withValues(alpha: 0.06),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
            color: warn
                ? const Color(0xFFFDE68A)
                : AppColors.primary.withValues(alpha: 0.14)),
      ),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Icon(icon,
            size: 22,
            color: warn ? const Color(0xFF92400E) : AppColors.primary),
        const SizedBox(width: AppSpace.md),
        Expanded(
          child:
              Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(title,
                style: TextStyle(
                    fontWeight: FontWeight.w800,
                    fontSize: 14,
                    color: fg,
                    height: 1.3)),
            if (body != null) ...[
              const SizedBox(height: 3),
              Text(body!,
                  style: TextStyle(fontSize: 13, color: fg, height: 1.4)),
            ],
          ]),
        ),
      ]),
    );
  }
}

// ============ Phone verification (SMS code) ============
/// Confirms the phone number with a 6-digit code sent by SMS. It says plainly what happened to the code (sent to
/// which number, or: this server cannot send text messages yet), offers to change the number, to ask again after a
/// timer, to verify by email instead, and to skip where the caller allows it.
class OtpScreen extends StatefulWidget {
  final VoidCallback? onAuthed;
  final String? phone;
  const OtpScreen({super.key, this.onAuthed, this.phone});
  @override
  State<OtpScreen> createState() => _OtpScreenState();
}

class _OtpScreenState extends State<OtpScreen> {
  final List<TextEditingController> _c =
      List.generate(6, (_) => TextEditingController());
  final List<FocusNode> _f = List.generate(6, (_) => FocusNode());
  Timer? _timer;
  int _seconds = 30;
  String? _error;
  String? _devCode;
  bool _busy = false;
  bool _sending = true;
  SendResult? _result;
  late String? _phone = widget.phone;

  @override
  void initState() {
    super.initState();
    _send();
  }

  Future<void> _send({bool again = false}) async {
    _startTimer();
    setState(() {
      _sending = true;
      _error = null;
    });
    try {
      final r = await RealtimeStore.instance.sendPhoneOtp();
      if (!mounted) return;
      setState(() {
        _result = r;
        _sending = false;
        if (kDebugMode) _devCode = r.devToken;
      });
      if (again && r.sent) {
        showSnack(context, Strings.of(context).verCodeResent);
      }
    } catch (e, st) {
      if (!mounted) return;
      final m = Strings.current.errorText(e, st);
      setState(() {
        _sending = false;
        _error = m;
      });
      showSnack(context, m);
    }
  }

  void _startTimer() {
    _timer?.cancel();
    setState(() => _seconds = 30);
    _timer = Timer.periodic(const Duration(seconds: 1), (t) {
      if (_seconds <= 0) {
        t.cancel();
      } else if (mounted) {
        setState(() => _seconds--);
      }
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    for (final c in _c) {
      c.dispose();
    }
    for (final f in _f) {
      f.dispose();
    }
    super.dispose();
  }

  String get _code => _c.map((c) => c.text).join();

  /// One box changed. A pasted or auto-filled code (more than one digit) is spread over the boxes from this one.
  void _onBox(int i, String v) {
    if (v.length > 1) {
      final digits = v.replaceAll(RegExp(r'\D'), '');
      if (digits.length == 2 && _c[i].text.length == 2) {
        // Typing over a filled box: the new digit replaces the old one.
        _c[i].text = digits[1];
      } else {
        for (var k = 0; k < digits.length && i + k < 6; k++) {
          _c[i + k].text = digits[k];
        }
      }
      final next = (i + (digits.length == 2 ? 1 : digits.length)).clamp(0, 5);
      _f[next].requestFocus();
    } else if (v.isNotEmpty && i < 5) {
      _f[i + 1].requestFocus();
    } else if (v.isEmpty && i > 0) {
      _f[i - 1].requestFocus();
    }
    setState(() => _error = null);
  }

  Future<void> _verify() async {
    final s = Strings.of(context);
    if (_code.length < 6) {
      setState(() => _error = s.otpErrFull);
      return;
    }
    setState(() {
      _error = null;
      _busy = true;
    });
    try {
      await RealtimeStore.instance.verifyPhoneOtp(_code);
      if (!mounted) return;
      showSnack(context, s.verPhoneDone);
      // Opened later from Settings (no next step): go back to where we came from.
      widget.onAuthed != null
          ? widget.onAuthed!()
          : Navigator.pop(context, true);
    } catch (e, st) {
      if (!mounted) return;
      final m = Strings.current.errorText(e, st);
      setState(() {
        _busy = false;
        _error = m;
      });
      showSnack(context, m);
    }
  }

  /// "Change number": a sheet with the field, the new number is saved on the account (which un-verifies it) and a new
  /// code goes to it.
  Future<void> _changeNumber() async {
    final s = Strings.of(context);
    final ctl = TextEditingController(text: _phone ?? '');
    String? err;
    bool saving = false;
    final saved = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.surface,
      shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setSheet) => SafeArea(
          child: Padding(
            padding: EdgeInsets.fromLTRB(
                22, 22, 22, 22 + MediaQuery.of(ctx).viewInsets.bottom),
            child: SingleChildScrollView(
              child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(s.verChangeTitle,
                        style: const TextStyle(
                            fontWeight: FontWeight.w800, fontSize: 18)),
                    const SizedBox(height: 6),
                    Text(s.verChangeBody,
                        style: const TextStyle(
                            color: AppColors.muted,
                            fontSize: 13.5,
                            height: 1.4)),
                    const SizedBox(height: 16),
                    KeyedSubtree(
                      key: const ValueKey('change-phone-field'),
                      child: _GlassField(
                          label: s.phone,
                          hint: '+243 81 234 5678',
                          icon: Icons.phone_iphone_rounded,
                          controller: ctl,
                          keyboard: TextInputType.phone,
                          error: err),
                    ),
                    const SizedBox(height: 18),
                    AuthButton(
                      s.verChangeSave,
                      loading: saving,
                      onPressed: () async {
                        final bad = validateMobileNumber(ctl.text, s);
                        if (bad != null) {
                          setSheet(() => err = bad);
                          return;
                        }
                        setSheet(() {
                          err = null;
                          saving = true;
                        });
                        try {
                          final p =
                              ctl.text.replaceAll(RegExp(r'[\s().-]'), '');
                          await RealtimeStore.instance.updateProfile(phone: p);
                          if (ctx.mounted) Navigator.pop(ctx, p);
                        } catch (e, st) {
                          final m = Strings.current.errorText(e, st);
                          setSheet(() {
                            saving = false;
                            err = m;
                          });
                          if (ctx.mounted) showSnack(ctx, m);
                        }
                      },
                    ),
                  ]),
            ),
          ),
        ),
      ),
    );
    ctl.dispose();
    if (saved == null || !mounted) return;
    for (final c in _c) {
      c.clear();
    }
    setState(() {
      _phone = saved;
      _devCode = null;
    });
    showSnack(context, s.verChangeDone);
    await _send();
  }

  Future<void> _useEmail() async {
    final done = await Navigator.push<bool>(
        context, MaterialPageRoute(builder: (_) => const VerifyEmailScreen()));
    if (done == true && mounted) {
      widget.onAuthed != null ? widget.onAuthed!() : Navigator.pop(context, true);
    }
  }

  Widget _status(Strings s) {
    final r = _result;
    if (_sending && r == null) {
      return _VerifyNotice(
        key: const ValueKey('otp-sending'),
        tone: _NoticeTone.info,
        icon: Icons.sms_outlined,
        title: s.verPhoneSending,
      );
    }
    if (r != null && r.notConfigured) {
      return _VerifyNotice(
        key: const ValueKey('otp-unavailable'),
        tone: _NoticeTone.warning,
        icon: Icons.sms_failed_outlined,
        title: s.verSmsOffTitle,
        body: s.verSmsOffBody,
      );
    }
    if (r != null && r.failed) {
      return _VerifyNotice(
        key: const ValueKey('otp-failed'),
        tone: _NoticeTone.warning,
        icon: Icons.sms_failed_outlined,
        title: s.verSmsFailedTitle,
        body: s.verSmsFailedBody,
      );
    }
    if (r != null && r.sent) {
      return _VerifyNotice(
        key: const ValueKey('otp-sent'),
        tone: _NoticeTone.info,
        icon: Icons.mark_chat_read_outlined,
        title: s.verPhoneSent(r.to ?? maskPhone(_phone)),
      );
    }
    return const SizedBox.shrink();
  }

  @override
  Widget build(BuildContext context) {
    final s = Strings.of(context);
    final r = _result;
    // With no SMS service there is no code to type: the way forward is the email (a local dev server still shows its code).
    final noCode = r != null && r.notConfigured && _devCode == null;
    final noWay = noCode &&
        !RealtimeStore.instance
            .emailAvailable; // e-mail is off on this server too: nothing to offer
    final undelivered = r != null && (r.notConfigured || r.failed);
    return _AuthPage(
      title: s.otpTitle,
      subtitle: undelivered
          ? s.verSubtitleOff(_phone ?? s.otpYourPhone)
          : s.otpSubtitle(_phone ?? s.otpYourPhone),
      showBack: true,
      form: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        _status(s),
        if (!noCode) ...[
          const SizedBox(height: 18),
          Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: List.generate(6, (i) {
                return Flexible(
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 46),
                    child: Semantics(
                      label: s.verBoxLabel(i + 1),
                      textField: true,
                      child: TextField(
                        key: ValueKey('otp-$i'),
                        controller: _c[i],
                        focusNode: _f[i],
                        textAlign: TextAlign.center,
                        keyboardType: TextInputType.number,
                        autofillHints:
                            i == 0 ? const [AutofillHints.oneTimeCode] : null,
                        style: const TextStyle(
                            fontWeight: FontWeight.w800, fontSize: 22),
                        inputFormatters: [
                          FilteringTextInputFormatter.digitsOnly
                        ],
                        decoration: InputDecoration(
                          counterText: '',
                          filled: true,
                          fillColor: AppColors.background,
                          contentPadding:
                              const EdgeInsets.symmetric(vertical: 16),
                          enabledBorder: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(14),
                              borderSide: BorderSide(
                                  color: _error != null
                                      ? AppColors.danger
                                      : AppColors.line)),
                          focusedBorder: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(14),
                              borderSide: const BorderSide(
                                  color: AppColors.primary, width: 1.7)),
                          border: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(14)),
                        ),
                        onChanged: (v) => _onBox(i, v),
                      ),
                    ),
                  ),
                );
              })),
        ],
        if (_error != null)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Text(_error!,
                key: const ValueKey('otp-error'),
                style: const TextStyle(
                    color: AppColors.danger,
                    fontSize: 12,
                    fontWeight: FontWeight.w600)),
          ),
        if (_devCode != null)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Text(s.devCode(_devCode),
                key: const ValueKey('otp-dev'),
                style: const TextStyle(color: AppColors.muted, fontSize: 11.5)),
          ),
        const SizedBox(height: 18),
        if (noWay)
          AuthButton(s.verContinue,
              key: const ValueKey('otp-continue'),
              onPressed: () => widget.onAuthed != null
                  ? widget.onAuthed!()
                  : Navigator.maybePop(context))
        else if (noCode)
          AuthButton(s.verUseEmail,
              key: const ValueKey('otp-use-email'), onPressed: _useEmail)
        else ...[
          AuthButton(s.verify, loading: _busy, onPressed: _verify),
          const SizedBox(height: 10),
          Center(
            child: _seconds > 0
                ? Text(s.otpResendIn(_clock(_seconds)),
                    style: const TextStyle(
                        color: AppColors.muted,
                        fontSize: 13,
                        fontWeight: FontWeight.w600))
                : TextButton(
                    key: const ValueKey('otp-resend'),
                    onPressed: _sending ? null : () => _send(again: true),
                    style: TextButton.styleFrom(
                        foregroundColor: AppColors.primary),
                    child: Text(s.otpResend,
                        style: const TextStyle(fontWeight: FontWeight.w700)),
                  ),
          ),
        ],
        Wrap(alignment: WrapAlignment.center, children: [
          TextButton(
            key: const ValueKey('otp-change'),
            onPressed: _busy ? null : _changeNumber,
            style: TextButton.styleFrom(foregroundColor: AppColors.primary),
            child: Text(s.verChangeNumber,
                style: const TextStyle(fontWeight: FontWeight.w700)),
          ),
          if (!noCode && undelivered && RealtimeStore.instance.emailAvailable)
            TextButton(
              key: const ValueKey('otp-email-alt'),
              onPressed: _useEmail,
              style: TextButton.styleFrom(foregroundColor: AppColors.primary),
              child: Text(s.verUseEmail,
                  style: const TextStyle(fontWeight: FontWeight.w700)),
            ),
          if (!noWay)
            TextButton(
              key: const ValueKey('otp-skip'),
              onPressed: () => widget.onAuthed != null
                  ? widget.onAuthed!()
                  : Navigator.maybePop(context),
              child: Text(s.skip,
                  style: const TextStyle(fontWeight: FontWeight.w700)),
            ),
        ]),
      ]),
    );
  }
}

// ============ Email verification ============
class VerifyEmailScreen extends StatefulWidget {
  final VoidCallback? onVerified;
  const VerifyEmailScreen({super.key, this.onVerified});
  @override
  State<VerifyEmailScreen> createState() => _VerifyEmailScreenState();
}

class _VerifyEmailScreenState extends State<VerifyEmailScreen> {
  String? _msg;
  String? _devToken;
  bool _busy = false;
  bool _sending = true;
  SendResult? _result;
  Timer? _timer;
  int _seconds = 30;

  @override
  void initState() {
    super.initState();
    _send();
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  void _startTimer() {
    _timer?.cancel();
    setState(() => _seconds = 30);
    _timer = Timer.periodic(const Duration(seconds: 1), (t) {
      if (_seconds <= 0) {
        t.cancel();
      } else if (mounted) {
        setState(() => _seconds--);
      }
    });
  }

  Future<void> _send({bool again = false}) async {
    _startTimer();
    setState(() {
      _sending = true;
      _msg = null;
    });
    try {
      final r = await RealtimeStore.instance.sendEmailVerification();
      if (!mounted) return;
      setState(() {
        _result = r;
        _sending = false;
        if (kDebugMode) _devToken = r.devToken;
      });
      if (again && r.sent) showSnack(context, Strings.of(context).veResent);
    } catch (e, st) {
      if (!mounted) return;
      final m = Strings.current.errorText(e, st);
      setState(() {
        _sending = false;
        _msg = m;
      });
      showSnack(context, m);
    }
  }

  Future<void> _check() async {
    final s = Strings.of(context);
    setState(() => _busy = true);
    try {
      final verified = await RealtimeStore.instance.refreshEmailVerified();
      if (!mounted) return;
      setState(() {
        _busy = false;
        _msg = verified ? null : s.veNotYet;
      });
      if (verified) {
        showSnack(context, s.verEmailDone);
        _done();
      } else {
        showSnack(context, s.veNotYet);
      }
    } catch (e, st) {
      if (!mounted) return;
      setState(() => _busy = false);
      showSnack(context, Strings.current.errorText(e, st));
    }
  }

  /// Verified: sign-up continues with its next step; opened later from the Account page we just go back, telling the
  /// caller it worked (`true`).
  void _done() => widget.onVerified != null ? widget.onVerified!() : Navigator.pop(context, true);

  /// "Skip for now": sign-up carries on, anywhere else we go back saying nothing was verified (`false`), so a checkout
  /// that sent the customer here does not mistake it for a verified account.
  void _skip() => widget.onVerified != null ? widget.onVerified!() : Navigator.pop(context, false);

  Future<void> _usePhone() async {
    final done = await Navigator.push<bool>(
        context,
        MaterialPageRoute(
            builder: (_) =>
                OtpScreen(phone: RealtimeStore.instance.user?.phone)));
    if (done == true && mounted) _done();
  }

  Widget _status(Strings s, String email) {
    final r = _result;
    if (_sending && r == null) {
      return _VerifyNotice(
          key: const ValueKey('email-sending'),
          tone: _NoticeTone.info,
          icon: Icons.mail_outline_rounded,
          title: s.veCheckInbox);
    }
    if (r != null && r.notConfigured) {
      return _VerifyNotice(
          key: const ValueKey('email-unavailable'),
          tone: _NoticeTone.warning,
          icon: Icons.unsubscribe_outlined,
          title: s.veOffTitle,
          body: s.veOffBody);
    }
    if (r != null && r.failed) {
      return _VerifyNotice(
          key: const ValueKey('email-failed'),
          tone: _NoticeTone.warning,
          icon: Icons.unsubscribe_outlined,
          title: s.veFailedTitle,
          body: s.veFailedBody);
    }
    return _VerifyNotice(
      key: const ValueKey('email-sent'),
      tone: _NoticeTone.info,
      icon: Icons.mark_email_read_rounded,
      title: s.veCheckInbox,
      body: '${s.veSentTo(r?.to ?? maskEmail(email))} ${s.veCheckHint}',
    );
  }

  @override
  Widget build(BuildContext context) {
    final s = Strings.of(context);
    final user = RealtimeStore.instance.user;
    final email = user?.email ?? s.veYourEmail;
    final r = _result;
    final off = r != null && r.notConfigured && _devToken == null;
    final hasPhone = (user?.phone ?? '').isNotEmpty &&
        !(user?.phoneVerified ?? false) &&
        RealtimeStore.instance.smsAvailable;
    final noWay = off &&
        !hasPhone; // phone is off (or done) too: nothing to offer but carrying on
    final undelivered = r != null && (r.notConfigured || r.failed);
    return _AuthPage(
      title: s.veTitle,
      subtitle: undelivered ? s.verSubtitleOff(email) : s.veSubtitle(email),
      showBack: true,
      form: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        _status(s, email),
        if (_msg != null)
          Padding(
              padding: const EdgeInsets.only(top: 10),
              child: Text(_msg!,
                  key: const ValueKey('email-msg'),
                  textAlign: TextAlign.center,
                  style:
                      const TextStyle(color: AppColors.muted, fontSize: 12.5))),
        if (_devToken != null)
          Padding(
              padding: const EdgeInsets.only(top: 6),
              child: SelectableText(s.devToken(_devToken),
                  key: const ValueKey('email-dev'),
                  style:
                      const TextStyle(color: AppColors.muted, fontSize: 10.5))),
        const SizedBox(height: 18),
        if (noWay)
          AuthButton(s.verContinue,
              key: const ValueKey('email-continue'), onPressed: _skip)
        else if (off && hasPhone)
          AuthButton(s.verUsePhone,
              key: const ValueKey('email-use-phone'), onPressed: _usePhone)
        else
          AuthButton(s.veContinue, loading: _busy, onPressed: _check),
        const SizedBox(height: 6),
        if (!noWay)
          Center(
            child: _seconds > 0
                ? Padding(
                    padding: const EdgeInsets.symmetric(vertical: 10),
                    child: Text(s.veWait(_clock(_seconds)),
                        style: const TextStyle(
                            color: AppColors.muted,
                            fontSize: 13,
                            fontWeight: FontWeight.w600)))
                : TextButton(
                    key: const ValueKey('email-resend'),
                    onPressed: _sending ? null : () => _send(again: true),
                    style: TextButton.styleFrom(
                        foregroundColor: AppColors.primary),
                    child: Text(s.veResend,
                        style: const TextStyle(fontWeight: FontWeight.w700)),
                  ),
          ),
        Wrap(alignment: WrapAlignment.center, children: [
          if (!off && hasPhone && r != null && (r.notConfigured || r.failed))
            TextButton(
                onPressed: _usePhone,
                style: TextButton.styleFrom(foregroundColor: AppColors.primary),
                child: Text(s.verUsePhone,
                    style: const TextStyle(fontWeight: FontWeight.w700))),
          if (!noWay)
            TextButton(
              key: const ValueKey('email-skip'),
              onPressed: _skip,
              child: Text(s.skip,
                  style: const TextStyle(fontWeight: FontWeight.w700)),
            ),
        ]),
      ]),
    );
  }
}

// ============ Phone-code login ============
/// Sign in without a password: a 6-digit code goes by SMS to the account's verified number.
class PhoneLoginScreen extends StatefulWidget {
  final VoidCallback? onAuthed;
  const PhoneLoginScreen({super.key, this.onAuthed});
  @override
  State<PhoneLoginScreen> createState() => _PhoneLoginScreenState();
}

class _PhoneLoginScreenState extends State<PhoneLoginScreen> {
  final _phone = TextEditingController(text: '+243 ');
  final _code = TextEditingController();
  bool _codeSent = false;
  bool _busy = false;
  String? _phoneErr, _codeErr;

  @override
  void dispose() {
    _phone.dispose();
    _code.dispose();
    super.dispose();
  }

  void _snack(String m) => ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: Text(m)));

  Future<void> _send() async {
    final s = Strings.of(context);
    final err = validateMobileNumber(_phone.text, s);
    setState(() => _phoneErr = err);
    if (err != null) {
      _snack(err);
      return;
    }
    setState(() => _busy = true);
    final messenger = ScaffoldMessenger.of(context);
    try {
      final r = await RealtimeStore.instance.sendLoginCode(_phone.text);
      if (!mounted) return;
      // No SMS service on this server: say so, instead of "a code is on its way" (a local dev server still shows its code).
      final unavailable =
          r.notConfigured && !(kDebugMode && r.devToken != null);
      setState(() {
        _codeSent = !unavailable;
        _phoneErr = unavailable ? s.phoneLoginOff : null;
        if (kDebugMode && r.devToken != null) {
          _code.text = r.devToken!; // local dev has no SMS gateway
        }
      });
      messenger
        ..hideCurrentSnackBar()
        ..showSnackBar(SnackBar(
            content: Text(unavailable ? s.phoneLoginOff : s.phoneLoginSent)));
    } catch (e, st) {
      if (mounted) {
        final m = Strings.current.errorText(e, st);
        setState(() => _phoneErr = m);
        _snack(m);
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _verify() async {
    final s = Strings.of(context);
    if (!RegExp(r'^[0-9]{6}$').hasMatch(_code.text.trim())) {
      setState(() => _codeErr = s.phoneLoginCodeInvalid);
      _snack(s.phoneLoginCodeInvalid);
      return;
    }
    setState(() {
      _codeErr = null;
      _busy = true;
    });
    try {
      await RealtimeStore.instance.loginWithPhoneCode(_phone.text, _code.text);
      if (!mounted) return;
      Navigator.of(context).popUntil((r) => r.isFirst);
      widget.onAuthed?.call();
    } on TwoFactorRequired catch (t) {
      if (!mounted) return;
      if (await askTwoFactor(context, t.challenge) && mounted) {
        Navigator.of(context).popUntil((r) => r.isFirst);
        widget.onAuthed?.call();
      }
    } catch (e, st) {
      if (mounted) {
        final m = Strings.current.errorText(e, st);
        setState(() => _codeErr = m);
        _snack(m);
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = Strings.of(context);
    return _AuthPage(
      title: s.phoneLoginTitle,
      subtitle: _codeSent ? s.phoneLoginCodeSubtitle : s.phoneLoginSubtitle,
      showBack: true,
      form: Column(children: [
        KeyedSubtree(
            key: const ValueKey('phone-login-phone'),
            child: _GlassField(
                label: s.phone,
                hint: '+243 81 234 5678',
                icon: Icons.phone_iphone_rounded,
                controller: _phone,
                keyboard: TextInputType.phone,
                error: _phoneErr)),
        if (_codeSent) ...[
          const SizedBox(height: 14),
          KeyedSubtree(
              key: const ValueKey('phone-login-code'),
              child: _GlassField(
                  label: s.phoneLoginCode,
                  hint: '123456',
                  icon: Icons.password_rounded,
                  controller: _code,
                  keyboard: TextInputType.number,
                  error: _codeErr)),
          Align(
            alignment: Alignment.centerRight,
            child: TextButton(
                onPressed: _busy ? null : _send,
                child: Text(s.phoneLoginResend)),
          ),
        ],
        const SizedBox(height: 16),
        AuthButton(_codeSent ? s.signIn : s.phoneLoginSend,
            loading: _busy, onPressed: _codeSent ? _verify : _send),
      ]),
    );
  }
}

// ============ Forgot password ============
class ForgotScreen extends StatefulWidget {
  final String initialEmail;
  const ForgotScreen({super.key, this.initialEmail = ''});
  @override
  State<ForgotScreen> createState() => _ForgotScreenState();
}

class _ForgotScreenState extends State<ForgotScreen> {
  late final _email = TextEditingController(text: widget.initialEmail);
  String? _err;
  bool _busy = false;

  @override
  void dispose() {
    _email.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    final ok =
        RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$').hasMatch(_email.text.trim());
    setState(() => _err = ok ? null : Strings.of(context).errValidEmail);
    if (!ok) return;
    setState(() => _busy = true);
    try {
      final r = await RealtimeStore.instance.forgotPassword(_email.text.trim());
      if (!mounted) return;
      // No e-mail service on this server: say so (a local dev server still shows its token).
      if (r.notConfigured && !(kDebugMode && r.devToken != null)) {
        final m = Strings.of(context).forgotOff;
        setState(() => _err = m);
        showSnack(context, m);
        return;
      }
      // Same message whether or not the address has an account.
      showSnack(context, Strings.of(context).forgotSent);
      Navigator.push(
          context,
          MaterialPageRoute(
              builder: (_) => ResetPasswordScreen(
                  devToken: kDebugMode ? r.devToken : null)));
    } catch (e, st) {
      if (mounted) {
        final m = Strings.current.errorText(e, st);
        setState(() => _err = m);
        showSnack(context, m);
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = Strings.of(context);
    return _AuthPage(
      title: s.forgotTitle,
      subtitle: s.forgotSubtitle,
      showBack: true,
      form: Column(children: [
        KeyedSubtree(
            key: const ValueKey('forgot-email'),
            child: _GlassField(
                label: s.email,
                hint: s.emailHint,
                icon: Icons.mail_outline_rounded,
                controller: _email,
                keyboard: TextInputType.emailAddress,
                error: _err)),
        const SizedBox(height: 20),
        AuthButton(s.forgotSend, loading: _busy, onPressed: _send),
      ]),
    );
  }
}

// ============ Reset password ============
class ResetPasswordScreen extends StatefulWidget {
  final String? devToken;
  const ResetPasswordScreen({super.key, this.devToken});
  @override
  State<ResetPasswordScreen> createState() => _ResetPasswordScreenState();
}

class _ResetPasswordScreenState extends State<ResetPasswordScreen> {
  late final _token = TextEditingController(text: widget.devToken ?? '');
  final _pass = TextEditingController();
  final _confirm = TextEditingController();
  String? _tokenErr, _passErr, _confirmErr;
  bool _busy = false;

  @override
  void dispose() {
    _token.dispose();
    _pass.dispose();
    _confirm.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final s = Strings.of(context);
    setState(() {
      _tokenErr = _token.text.trim().length < 20 ? s.resetErrCode : null;
      _passErr = _pass.text.length < 8 ? s.regErrPass : null;
      _confirmErr = _confirm.text != _pass.text ? s.regErrMatch : null;
    });
    if (_tokenErr != null || _passErr != null || _confirmErr != null) return;
    setState(() => _busy = true);
    try {
      await RealtimeStore.instance
          .resetPassword(_token.text.trim(), _pass.text);
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(s.resetDone)));
      Navigator.popUntil(context, (r) => r.isFirst);
    } catch (e, st) {
      if (mounted) {
        final m = Strings.current.errorText(e, st);
        setState(() => _tokenErr = m);
        showSnack(context, m);
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = Strings.of(context);
    return _AuthPage(
      title: s.resetTitle,
      subtitle: s.resetSubtitle,
      showBack: true,
      form: Column(children: [
        KeyedSubtree(
            key: const ValueKey('reset-token'),
            child: _GlassField(
                label: s.resetCode,
                hint: s.resetCodeHint,
                icon: Icons.key_rounded,
                controller: _token,
                error: _tokenErr)),
        const SizedBox(height: 14),
        KeyedSubtree(
            key: const ValueKey('reset-password'),
            child: _GlassField(
                label: s.resetNewPw,
                hint: s.regPassHint,
                icon: Icons.lock_outline_rounded,
                obscure: true,
                controller: _pass,
                error: _passErr)),
        const SizedBox(height: 14),
        KeyedSubtree(
            key: const ValueKey('reset-confirm'),
            child: _GlassField(
                label: s.regConfirm,
                hint: s.regConfirmHint,
                icon: Icons.lock_reset_rounded,
                obscure: true,
                controller: _confirm,
                error: _confirmErr)),
        const SizedBox(height: 20),
        AuthButton(s.resetSave, loading: _busy, onPressed: _save),
      ]),
    );
  }
}

/// A short, plain summary of the terms and privacy policy.
Future<void> showTermsDialog(BuildContext context) {
  final s = Strings.of(context);
  return showDialog<void>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: Text(s.termsTitle),
      content: SingleChildScrollView(
        key: const ValueKey('terms-body'),
        child: Text(s.termsBody,
            style: const TextStyle(height: 1.4, fontSize: 13.5)),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(ctx), child: Text(s.close))
      ],
    ),
  );
}
