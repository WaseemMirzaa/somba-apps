import 'dart:async';
import 'package:flutter/material.dart';
import '../../widgets/mobile_money.dart';
import 'package:flutter/gestures.dart' show TapGestureRecognizer;
import 'package:flutter/services.dart';
import 'package:flutter/foundation.dart' show kDebugMode;
import '../../l10n/strings.dart';
import '../../services/auth_service.dart' show ApiException;
import '../../services/realtime_store.dart';
import '../../theme/app_theme.dart';
import '../../widgets/brand_logo.dart';

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
    } catch (e) {
      if (!mounted) return;
      setState(() => _passErr = Strings.current.errorText(e));
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
        AuthButton(s.signIn,
            icon: Icons.login_rounded, loading: _loading, onPressed: _signIn),
        const SizedBox(height: 6),
        TextButton(
          key: const ValueKey('go-phone-login'),
          onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => PhoneLoginScreen(onAuthed: widget.onAuthed))),
          style: TextButton.styleFrom(foregroundColor: AppColors.primary),
          child: Text(s.phoneLoginLink, style: const TextStyle(fontWeight: FontWeight.w700)),
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
    if ([_nameErr, _phoneErr, _emailErr, _passErr, _confirmErr].any((e) => e != null)) {
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
      // The account exists and is signed in. Verifying the phone and email is
      // encouraged but never blocks shopping.
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
    } catch (e) {
      if (!mounted) return;
      // Decide which field the server complaint is about from its (English) text; show it translated.
      final raw = (e is ApiException ? e.message : '').toLowerCase();
      final m = Strings.current.errorText(e);
      setState(() {
        if (raw.contains('email')) {
          _emailErr = m;
        } else if (raw.contains('password')) {
          _passErr = m;
        } else {
          _confirmErr = m;
        }
      });
    } finally {
      if (mounted) setState(() => _loading = false);
    }
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
        AuthButton(s.registerTitle,
            icon: Icons.arrow_forward_rounded,
            loading: _loading,
            onPressed: _submit),
      ]),
    );
  }
}

// ============ Phone verification (SMS code) ============
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

  @override
  void initState() {
    super.initState();
    _send();
  }

  Future<void> _send() async {
    _startTimer();
    try {
      final dev = await RealtimeStore.instance.sendPhoneOtp();
      if (mounted && kDebugMode) setState(() => _devCode = dev);
    } catch (e) {
      if (mounted) setState(() => _error = Strings.current.errorText(e));
    }
  }

  void _startTimer() {
    _timer?.cancel();
    setState(() => _seconds = 30);
    _timer = Timer.periodic(const Duration(seconds: 1), (t) {
      if (_seconds <= 0) {
        t.cancel();
      } else {
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

  Future<void> _verify() async {
    if (_code.length < 6) {
      setState(() => _error = Strings.of(context).otpErrFull);
      return;
    }
    setState(() {
      _error = null;
      _busy = true;
    });
    try {
      await RealtimeStore.instance.verifyPhoneOtp(_code);
      if (!mounted) return;
      // Opened later from Settings (no next step): go back to where we came from.
      widget.onAuthed != null
          ? widget.onAuthed!()
          : Navigator.pop(context, true);
    } catch (e) {
      if (mounted) {
        setState(() {
          _busy = false;
          _error = Strings.current.errorText(e);
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = Strings.of(context);
    return _AuthPage(
      title: s.otpTitle,
      subtitle: s.otpSubtitle(widget.phone ?? s.otpYourPhone),
      showBack: true,
      form: Column(children: [
        Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: List.generate(6, (i) {
              return Flexible(
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 46),
                  child: TextField(
                    key: ValueKey('otp-$i'),
                    controller: _c[i],
                    focusNode: _f[i],
                    textAlign: TextAlign.center,
                    keyboardType: TextInputType.number,
                    maxLength: 1,
                    style: const TextStyle(
                        fontWeight: FontWeight.w800, fontSize: 22),
                    inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                    decoration: InputDecoration(
                      counterText: '',
                      filled: true,
                      fillColor: AppColors.background,
                      contentPadding: const EdgeInsets.symmetric(vertical: 16),
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
                    onChanged: (v) {
                      if (v.isNotEmpty && i < 5) _f[i + 1].requestFocus();
                      if (v.isEmpty && i > 0) _f[i - 1].requestFocus();
                      setState(() {});
                    },
                  ),
                ),
              );
            })),
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
        AuthButton(s.verify,
            icon: Icons.verified_rounded, loading: _busy, onPressed: _verify),
        const SizedBox(height: 10),
        Center(
          child: _seconds > 0
              ? Text(s.otpResendIn('0:${_seconds.toString().padLeft(2, '0')}'),
                  style: const TextStyle(
                      color: AppColors.muted,
                      fontSize: 13,
                      fontWeight: FontWeight.w600))
              : TextButton.icon(
                  onPressed: _send,
                  icon: const Icon(Icons.refresh_rounded, size: 18),
                  style:
                      TextButton.styleFrom(foregroundColor: AppColors.primary),
                  label: Text(s.otpResend,
                      style: const TextStyle(fontWeight: FontWeight.w700)),
                ),
        ),
        TextButton(
          key: const ValueKey('otp-skip'),
          onPressed: () => widget.onAuthed?.call(),
          child:
              Text(s.skip, style: const TextStyle(fontWeight: FontWeight.w700)),
        ),
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

  @override
  void initState() {
    super.initState();
    _send();
  }

  Future<void> _send() async {
    try {
      final dev = await RealtimeStore.instance.sendEmailVerification();
      if (mounted) {
        setState(() {
          _msg = Strings.of(context).veSent;
          if (kDebugMode) _devToken = dev;
        });
      }
    } catch (e) {
      if (mounted) setState(() => _msg = Strings.current.errorText(e));
    }
  }

  Future<void> _check() async {
    setState(() => _busy = true);
    final verified = await RealtimeStore.instance.refreshEmailVerified();
    if (!mounted) return;
    setState(() {
      _busy = false;
      _msg = verified ? null : Strings.of(context).veNotYet;
    });
    if (verified) _done();
  }

  /// Sign-up continues with its next step; opened later from the Account page we just go back.
  void _done() => widget.onVerified != null
      ? widget.onVerified!()
      : Navigator.pop(context, true);

  @override
  Widget build(BuildContext context) {
    final s = Strings.of(context);
    final email = RealtimeStore.instance.user?.email ?? s.veYourEmail;
    return _AuthPage(
      title: s.veTitle,
      subtitle: s.veSubtitle(email),
      showBack: true,
      form: Column(children: [
        Container(
          padding: const EdgeInsets.all(20),
          decoration: BoxDecoration(
              color: AppColors.primary.withValues(alpha: 0.08),
              borderRadius: BorderRadius.circular(18)),
          child: Column(children: [
            const Icon(Icons.mark_email_read_rounded,
                color: AppColors.primary, size: 46),
            const SizedBox(height: 12),
            Text(s.veCheckInbox,
                style:
                    const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
            const SizedBox(height: 6),
            Text(s.veCheckHint,
                textAlign: TextAlign.center,
                style: const TextStyle(
                    color: AppColors.muted, fontSize: 13, height: 1.4)),
          ]),
        ),
        if (_msg != null)
          Padding(
              padding: const EdgeInsets.only(top: 10),
              child: Text(_msg!,
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
        AuthButton(s.veContinue,
            icon: Icons.check_circle_rounded,
            loading: _busy,
            onPressed: _check),
        const SizedBox(height: 6),
        TextButton.icon(
          onPressed: _send,
          icon: const Icon(Icons.refresh_rounded, size: 18),
          style: TextButton.styleFrom(foregroundColor: AppColors.primary),
          label: Text(s.veResend,
              style: const TextStyle(fontWeight: FontWeight.w700)),
        ),
        TextButton(
          key: const ValueKey('email-skip'),
          onPressed: _done,
          child:
              Text(s.skip, style: const TextStyle(fontWeight: FontWeight.w700)),
        ),
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
      final dev = await RealtimeStore.instance.sendLoginCode(_phone.text);
      if (!mounted) return;
      setState(() {
        _codeSent = true;
        if (kDebugMode && dev != null) _code.text = dev; // local dev has no SMS gateway
      });
      messenger.showSnackBar(SnackBar(content: Text(s.phoneLoginSent)));
    } catch (e) {
      if (mounted) {
        setState(() => _phoneErr = Strings.current.errorText(e));
        _snack(Strings.current.errorText(e));
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
    } catch (e) {
      if (mounted) {
        setState(() => _codeErr = Strings.current.errorText(e));
        _snack(Strings.current.errorText(e));
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
            child: TextButton(onPressed: _busy ? null : _send, child: Text(s.phoneLoginResend)),
          ),
        ],
        const SizedBox(height: 16),
        AuthButton(_codeSent ? s.signIn : s.phoneLoginSend, loading: _busy, onPressed: _codeSent ? _verify : _send),
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
      final dev =
          await RealtimeStore.instance.forgotPassword(_email.text.trim());
      if (!mounted) return;
      // Same message whether or not the address has an account.
      ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(Strings.of(context).forgotSent)));
      Navigator.push(
          context,
          MaterialPageRoute(
              builder: (_) =>
                  ResetPasswordScreen(devToken: kDebugMode ? dev : null)));
    } catch (e) {
      if (mounted) setState(() => _err = Strings.current.errorText(e));
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
        AuthButton(s.forgotSend,
            icon: Icons.send_rounded, loading: _busy, onPressed: _send),
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
    } catch (e) {
      if (mounted) setState(() => _tokenErr = Strings.current.errorText(e));
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
        AuthButton(s.resetSave,
            icon: Icons.check_rounded, loading: _busy, onPressed: _save),
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
