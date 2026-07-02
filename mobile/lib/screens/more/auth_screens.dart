import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../theme/app_theme.dart';
import '../../l10n/strings.dart';
import '../../widgets/brand_logo.dart';

// ================= Splash =================
class CustomerSplashScreen extends StatefulWidget {
  final VoidCallback onDone;
  const CustomerSplashScreen({super.key, required this.onDone});
  @override
  State<CustomerSplashScreen> createState() => _CustomerSplashScreenState();
}

class _CustomerSplashScreenState extends State<CustomerSplashScreen> with SingleTickerProviderStateMixin {
  Timer? _t;
  late final AnimationController _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 900))..forward();

  @override
  void initState() {
    super.initState();
    // Longer, clearly visible splash.
    _t = Timer(const Duration(milliseconds: 2800), widget.onDone);
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
              scale: Tween(begin: 0.85, end: 1.0).animate(CurvedAnimation(parent: _c, curve: Curves.easeOutBack)),
              child: Column(mainAxisSize: MainAxisSize.min, children: [
                const BrandLogo(size: 116, radius: 30),
                const SizedBox(height: 24),
                const Text('Somba&Teka',
                    style: TextStyle(color: Colors.white, fontSize: 30, fontWeight: FontWeight.w800, fontFamily: 'PlusJakartaSans', letterSpacing: -0.6)),
                const SizedBox(height: 8),
                Text(tr(context, 'Shop everything, delivered'), style: TextStyle(color: Colors.white.withValues(alpha: 0.9), fontSize: 14.5, fontWeight: FontWeight.w600)),
                const SizedBox(height: 40),
                SizedBox(height: 26, width: 26, child: CircularProgressIndicator(strokeWidth: 2.6, valueColor: AlwaysStoppedAnimation(Colors.white.withValues(alpha: 0.9)))),
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
  /// When true the logo/title/card group is vertically centered on the page
  /// (used by the shorter flows: OTP, verify email, forgot & reset password).
  final bool centered;
  const _AuthPage({required this.title, required this.subtitle, required this.form, this.showBack = false, this.centered = false});

  @override
  Widget build(BuildContext context) {
    final top = MediaQuery.of(context).padding.top;
    final content = <Widget>[
      const Center(child: BrandLogo(size: 78, radius: 22)),
      const SizedBox(height: 18),
      Text(title, textAlign: TextAlign.center,
          style: const TextStyle(color: Colors.white, fontSize: 26, fontWeight: FontWeight.w800, fontFamily: 'PlusJakartaSans', letterSpacing: -0.5)),
      const SizedBox(height: 6),
      Text(subtitle, textAlign: TextAlign.center, style: TextStyle(color: Colors.white.withValues(alpha: 0.92), fontSize: 14)),
      const SizedBox(height: 24),
      GlassCard(child: form),
    ];
    return Scaffold(
      body: AuthBackdrop(
        child: SafeArea(
          child: Stack(children: [
            if (showBack)
              Positioned(
                left: 8, top: 4,
                child: Material(
                  color: Colors.white.withValues(alpha: 0.2),
                  shape: const CircleBorder(),
                  child: InkWell(
                    customBorder: const CircleBorder(),
                    onTap: () => Navigator.of(context).maybePop(),
                    child: const Padding(padding: EdgeInsets.all(9), child: Icon(Icons.arrow_back_rounded, color: Colors.white, size: 22)),
                  ),
                ),
              ),
            if (centered)
              Center(
                child: SingleChildScrollView(
                  padding: EdgeInsets.fromLTRB(22, top + 56, 22, 30),
                  child: Column(mainAxisSize: MainAxisSize.min, children: content),
                ),
              )
            else
              ListView(
                padding: EdgeInsets.fromLTRB(22, top + (showBack ? 8 : 40), 22, 30),
                children: content,
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
    OutlineInputBorder b(Color c, [double w = 1]) =>
        OutlineInputBorder(borderRadius: BorderRadius.circular(16), borderSide: BorderSide(color: c, width: w));
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(label, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 12.5, color: AppColors.inkSoft)),
      const SizedBox(height: 6),
      TextField(
        controller: controller,
        obscureText: obscure,
        keyboardType: keyboard,
        inputFormatters: formatters,
        decoration: InputDecoration(
          hintText: hint,
          prefixIcon: prefix ?? Icon(icon, size: 20),
          filled: true,
          fillColor: AppColors.background,
          enabledBorder: b(error != null ? AppColors.danger : AppColors.line),
          focusedBorder: b(error != null ? AppColors.danger : AppColors.primary, 1.6),
          border: b(AppColors.line),
          contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
        ),
      ),
      if (error != null) Padding(
        padding: const EdgeInsets.only(top: 5, left: 4),
        child: Text(error!, style: const TextStyle(color: AppColors.danger, fontSize: 11.5, fontWeight: FontWeight.w600)),
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

  bool _validEmail(String s) => RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$').hasMatch(s);

  void _signIn() {
    setState(() {
      _emailErr = _email.text.trim().isEmpty ? 'Enter your email' : (!_validEmail(_email.text.trim()) ? 'Enter a valid email' : null);
      _passErr = _pass.text.isEmpty ? 'Enter your password' : (_pass.text.length < 4 ? 'Password is too short' : null);
    });
    if (_emailErr != null || _passErr != null) return;
    setState(() => _loading = true);
    Future.delayed(const Duration(milliseconds: 700), () {
      if (!mounted) return;
      setState(() => _loading = false);
      widget.onAuthed?.call();
    });
  }

  void _social(String name) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('${tr(context, 'Signing in with')} $name…')));
    Future.delayed(const Duration(milliseconds: 600), () => widget.onAuthed?.call());
  }

  @override
  Widget build(BuildContext context) {
    return _AuthPage(
      title: tr(context, 'Welcome back'),
      subtitle: tr(context, 'Sign in to continue shopping on Somba&Teka'),
      form: Column(children: [
        _GlassField(label: tr(context, 'Email'), hint: 'marie@email.com', icon: Icons.mail_outline_rounded, controller: _email, keyboard: TextInputType.emailAddress, error: _emailErr),
        const SizedBox(height: 14),
        _GlassField(label: tr(context, 'Password'), hint: '••••••••', icon: Icons.lock_outline_rounded, obscure: true, controller: _pass, error: _passErr),
        Align(
          alignment: Alignment.centerRight,
          child: TextButton(
            onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const ForgotScreen())),
            style: TextButton.styleFrom(foregroundColor: AppColors.primary),
            child: Text(tr(context, 'Forgot password?'), style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 12.5)),
          ),
        ),
        const SizedBox(height: 4),
        AuthButton(tr(context, 'Sign in'), icon: Icons.login_rounded, loading: _loading, onPressed: _signIn),
        const SizedBox(height: 18),
        Row(children: [
          const Expanded(child: Divider(color: AppColors.line)),
          Padding(padding: const EdgeInsets.symmetric(horizontal: 12), child: Text(tr(context, 'or continue with'), style: const TextStyle(color: AppColors.muted, fontSize: 12))),
          const Expanded(child: Divider(color: AppColors.line)),
        ]),
        const SizedBox(height: 16),
        Row(mainAxisAlignment: MainAxisAlignment.center, children: [
          _socialBtn(bg: Colors.white, border: AppColors.line, child: const GoogleGMark(size: 22), onTap: () => _social('Google')),
          const SizedBox(width: 16),
          _socialBtn(bg: Colors.black, child: const Icon(Icons.apple, color: Colors.white, size: 26), onTap: () => _social('Apple')),
          const SizedBox(width: 16),
          _socialBtn(bg: const Color(0xFF1877F2), child: const Icon(Icons.facebook, color: Colors.white, size: 26), onTap: () => _social('Facebook')),
        ]),
        const SizedBox(height: 16),
        TextButton(onPressed: () => widget.onAuthed?.call(), child: Text(tr(context, 'Continue as guest'), style: const TextStyle(fontWeight: FontWeight.w700))),
        Center(
          child: GestureDetector(
            onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => RegisterScreen(onAuthed: widget.onAuthed))),
            child: RichText(text: TextSpan(style: const TextStyle(color: AppColors.muted, fontSize: 13.5), children: [
              TextSpan(text: "${tr(context, 'New here?')}  "),
              TextSpan(text: tr(context, 'Create an account'), style: const TextStyle(color: AppColors.primary, fontWeight: FontWeight.w700)),
            ])),
          ),
        ),
      ]),
    );
  }

  Widget _socialBtn({required Color bg, Color? border, required Widget child, required VoidCallback onTap}) => Material(
        color: bg,
        shape: CircleBorder(side: border != null ? BorderSide(color: border) : BorderSide.none),
        elevation: 3,
        shadowColor: Colors.black.withValues(alpha: 0.2),
        child: InkWell(
          customBorder: const CircleBorder(),
          onTap: onTap,
          child: SizedBox(height: 52, width: 52, child: Center(child: child)),
        ),
      );
}

// ============ Register ============
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
  bool _agree = true;
  bool _hasPhoto = false;
  String? _nameErr, _phoneErr, _emailErr, _passErr, _confirmErr;

  static const _codes = [
    ('🇨🇩', '+243', 'DR Congo'),
    ('🇫🇷', '+33', 'France'),
    ('🇺🇸', '+1', 'USA'),
    ('🇬🇧', '+44', 'UK'),
    ('🇳🇬', '+234', 'Nigeria'),
    ('🇰🇪', '+254', 'Kenya'),
    ('🇿🇦', '+27', 'South Africa'),
  ];

  @override
  void dispose() {
    for (final c in [_name, _phone, _email, _pass, _confirm]) {
      c.dispose();
    }
    super.dispose();
  }

  bool _validEmail(String s) => RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$').hasMatch(s);

  void _submit() {
    setState(() {
      _nameErr = _name.text.trim().isEmpty ? tr(context, 'Enter your full name') : null;
      _phoneErr = _phone.text.trim().length < 6 ? tr(context, 'Enter a valid phone number') : null;
      _emailErr = !_validEmail(_email.text.trim()) ? tr(context, 'Enter a valid email') : null;
      _passErr = _pass.text.length < 6 ? tr(context, 'Use at least 6 characters') : null;
      _confirmErr = _confirm.text != _pass.text ? tr(context, 'Passwords do not match') : null;
    });
    if ([_nameErr, _phoneErr, _emailErr, _passErr, _confirmErr].any((e) => e != null)) return;
    if (!_agree) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(tr(context, 'Please accept the Terms & Privacy Policy'))));
      return;
    }
    Navigator.push(context, MaterialPageRoute(builder: (_) => OtpScreen(
      phone: '$_dial ${_phone.text.trim()}',
      onAuthed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => VerifyEmailScreen(onVerified: () {
        Navigator.of(context).popUntil((r) => r.isFirst);
        widget.onAuthed?.call();
      }))),
    )));
  }

  void _pickPhoto() {
    setState(() => _hasPhoto = true);
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(tr(context, 'Profile photo added (optional)'))));
  }

  void _pickCode() {
    showModalBottomSheet(
      context: context,
      builder: (_) => SafeArea(child: Column(mainAxisSize: MainAxisSize.min, children: [
        Padding(padding: const EdgeInsets.all(16), child: Text(tr(context, 'Select country code'), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16))),
        ..._codes.map((c) => ListTile(
          leading: Text(c.$1, style: const TextStyle(fontSize: 22)),
          title: Text(c.$3),
          trailing: Text(c.$2, style: const TextStyle(fontWeight: FontWeight.w700, color: AppColors.primary)),
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
    return _AuthPage(
      title: tr(context, 'Create account'),
      subtitle: tr(context, 'Join Somba&Teka in under a minute'),
      showBack: true,
      form: Column(children: [
        // Optional profile picture.
        Center(
          child: GestureDetector(
            onTap: _pickPhoto,
            child: Stack(children: [
              CircleAvatar(
                radius: 38,
                backgroundColor: AppColors.primary.withValues(alpha: 0.12),
                child: _hasPhoto
                    ? const Icon(Icons.person_rounded, color: AppColors.primary, size: 40)
                    : const Icon(Icons.add_a_photo_rounded, color: AppColors.primary, size: 26),
              ),
              Positioned(right: 0, bottom: 0, child: Container(
                height: 26, width: 26,
                decoration: BoxDecoration(color: AppColors.primary, shape: BoxShape.circle, border: Border.all(color: Colors.white, width: 2)),
                child: const Icon(Icons.camera_alt_rounded, color: Colors.white, size: 13),
              )),
            ]),
          ),
        ),
        const SizedBox(height: 4),
        Center(child: Text(tr(context, 'Add a photo (optional)'), style: const TextStyle(color: AppColors.muted, fontSize: 11.5))),
        const SizedBox(height: 16),
        _GlassField(label: tr(context, 'Full name'), hint: 'Marie Dubois', icon: Icons.person_outline_rounded, controller: _name, error: _nameErr),
        const SizedBox(height: 14),
        _GlassField(
          label: tr(context, 'Phone number'), hint: '970 000 000', icon: Icons.phone_outlined,
          controller: _phone, keyboard: TextInputType.phone, error: _phoneErr,
          formatters: [FilteringTextInputFormatter.digitsOnly],
          prefix: GestureDetector(
            onTap: _pickCode,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 12),
              alignment: Alignment.center,
              width: 78,
              child: Row(mainAxisSize: MainAxisSize.min, children: [
                Text(_dial, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
                const Icon(Icons.arrow_drop_down_rounded, size: 20, color: AppColors.muted),
              ]),
            ),
          ),
        ),
        const SizedBox(height: 14),
        _GlassField(label: tr(context, 'Email'), hint: 'marie@email.com', icon: Icons.mail_outline_rounded, controller: _email, keyboard: TextInputType.emailAddress, error: _emailErr),
        const SizedBox(height: 14),
        _GlassField(label: tr(context, 'Password'), hint: tr(context, 'Create a password'), icon: Icons.lock_outline_rounded, obscure: true, controller: _pass, error: _passErr),
        const SizedBox(height: 14),
        _GlassField(label: tr(context, 'Confirm password'), hint: tr(context, 'Re-enter password'), icon: Icons.lock_reset_rounded, obscure: true, controller: _confirm, error: _confirmErr),
        const SizedBox(height: 14),
        GestureDetector(
          onTap: () => setState(() => _agree = !_agree),
          child: Row(children: [
            Icon(_agree ? Icons.check_box_rounded : Icons.check_box_outline_blank_rounded, color: AppColors.primary, size: 22),
            const SizedBox(width: 8),
            Expanded(child: RichText(text: TextSpan(style: const TextStyle(color: AppColors.muted, fontSize: 12.5), children: [
              TextSpan(text: '${tr(context, 'I agree to the')} '),
              TextSpan(text: tr(context, 'Terms & Privacy Policy'), style: const TextStyle(color: AppColors.primary, fontWeight: FontWeight.w700)),
            ]))),
          ]),
        ),
        const SizedBox(height: 18),
        AuthButton(tr(context, 'Create account'), icon: Icons.arrow_forward_rounded, onPressed: _submit),
      ]),
    );
  }
}

// ============ OTP ============
class OtpScreen extends StatefulWidget {
  final VoidCallback? onAuthed;
  final String? phone;
  const OtpScreen({super.key, this.onAuthed, this.phone});
  @override
  State<OtpScreen> createState() => _OtpScreenState();
}

class _OtpScreenState extends State<OtpScreen> {
  final List<TextEditingController> _c = List.generate(6, (_) => TextEditingController());
  final List<FocusNode> _f = List.generate(6, (_) => FocusNode());
  Timer? _timer;
  int _seconds = 30;
  String? _error;

  @override
  void initState() {
    super.initState();
    _startTimer();
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

  void _verify() {
    if (_code.length < 6 || _c.any((c) => c.text.isEmpty)) {
      setState(() => _error = tr(context, 'Enter the full 6-digit code'));
      return;
    }
    setState(() => _error = null);
    widget.onAuthed?.call();
  }

  @override
  Widget build(BuildContext context) {
    return _AuthPage(
      title: tr(context, 'Verify your number'),
      subtitle: '${tr(context, 'Enter the 6-digit code sent to')} ${widget.phone ?? '+243 970 000 000'}',
      showBack: true,
      centered: true,
      form: Column(children: [
        Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: List.generate(6, (i) {
          return SizedBox(
            width: 46,
            child: TextField(
              controller: _c[i],
              focusNode: _f[i],
              textAlign: TextAlign.center,
              keyboardType: TextInputType.number,
              maxLength: 1,
              style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 22),
              inputFormatters: [FilteringTextInputFormatter.digitsOnly],
              decoration: InputDecoration(
                counterText: '',
                filled: true,
                fillColor: AppColors.background,
                contentPadding: const EdgeInsets.symmetric(vertical: 16),
                enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide(color: _error != null ? AppColors.danger : AppColors.line)),
                focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: const BorderSide(color: AppColors.primary, width: 1.7)),
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(14)),
              ),
              onChanged: (v) {
                if (v.isNotEmpty && i < 5) _f[i + 1].requestFocus();
                if (v.isEmpty && i > 0) _f[i - 1].requestFocus();
                setState(() {});
              },
            ),
          );
        })),
        if (_error != null) Padding(
          padding: const EdgeInsets.only(top: 8),
          child: Text(_error!, style: const TextStyle(color: AppColors.danger, fontSize: 12, fontWeight: FontWeight.w600)),
        ),
        const SizedBox(height: 18),
        AuthButton(tr(context, 'Verify'), icon: Icons.verified_rounded, onPressed: _verify),
        const SizedBox(height: 14),
        Center(
          child: _seconds > 0
              ? Text('${tr(context, 'Resend code in')} 0:${_seconds.toString().padLeft(2, '0')}', style: const TextStyle(color: AppColors.muted, fontSize: 13, fontWeight: FontWeight.w600))
              : TextButton.icon(
                  onPressed: () {
                    _startTimer();
                    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(tr(context, 'New code sent'))));
                  },
                  icon: const Icon(Icons.refresh_rounded, size: 18),
                  style: TextButton.styleFrom(foregroundColor: AppColors.primary),
                  label: Text(tr(context, 'Resend code'), style: const TextStyle(fontWeight: FontWeight.w700)),
                ),
        ),
      ]),
    );
  }
}

// ============ Email verification ============
class VerifyEmailScreen extends StatelessWidget {
  final VoidCallback? onVerified;
  const VerifyEmailScreen({super.key, this.onVerified});
  @override
  Widget build(BuildContext context) {
    return _AuthPage(
      title: tr(context, 'Verify your email'),
      subtitle: tr(context, 'We sent a confirmation link to marie@email.com'),
      showBack: true,
      centered: true,
      form: Column(children: [
        Container(
          padding: const EdgeInsets.all(20),
          decoration: BoxDecoration(color: AppColors.primary.withValues(alpha: 0.08), borderRadius: BorderRadius.circular(18)),
          child: Column(children: [
            const Icon(Icons.mark_email_read_rounded, color: AppColors.primary, size: 46),
            const SizedBox(height: 12),
            Text(tr(context, 'Check your inbox'), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
            const SizedBox(height: 6),
            Text(tr(context, 'Tap the link in the email to activate your account, then continue to start shopping.'),
                textAlign: TextAlign.center, style: const TextStyle(color: AppColors.muted, fontSize: 13, height: 1.4)),
          ]),
        ),
        const SizedBox(height: 18),
        AuthButton(tr(context, "I've verified — continue"), icon: Icons.check_circle_rounded,
            onPressed: () => onVerified != null ? onVerified!() : Navigator.maybePop(context)),
        const SizedBox(height: 10),
        TextButton.icon(
          onPressed: () => ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(tr(context, 'Verification email resent')))),
          icon: const Icon(Icons.refresh_rounded, size: 18),
          style: TextButton.styleFrom(foregroundColor: AppColors.primary),
          label: Text(tr(context, 'Resend email'), style: const TextStyle(fontWeight: FontWeight.w700)),
        ),
      ]),
    );
  }
}

// ============ Forgot password ============
class ForgotScreen extends StatefulWidget {
  const ForgotScreen({super.key});
  @override
  State<ForgotScreen> createState() => _ForgotScreenState();
}

class _ForgotScreenState extends State<ForgotScreen> {
  final _email = TextEditingController();
  String? _err;
  @override
  void dispose() {
    _email.dispose();
    super.dispose();
  }

  void _send() {
    final ok = RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$').hasMatch(_email.text.trim());
    setState(() => _err = ok ? null : tr(context, 'Enter a valid email'));
    if (!ok) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(tr(context, 'Reset link sent to your email'))));
    Navigator.push(context, MaterialPageRoute(builder: (_) => const ResetPasswordScreen()));
  }

  @override
  Widget build(BuildContext context) {
    return _AuthPage(
      title: tr(context, 'Reset password'),
      subtitle: tr(context, "We'll send a reset link to your email"),
      showBack: true,
      centered: true,
      form: Column(children: [
        _GlassField(label: tr(context, 'Email'), hint: 'marie@email.com', icon: Icons.mail_outline_rounded, controller: _email, keyboard: TextInputType.emailAddress, error: _err),
        const SizedBox(height: 20),
        AuthButton(tr(context, 'Send reset link'), icon: Icons.send_rounded, onPressed: _send),
      ]),
    );
  }
}

// ============ Reset password ============
class ResetPasswordScreen extends StatefulWidget {
  const ResetPasswordScreen({super.key});
  @override
  State<ResetPasswordScreen> createState() => _ResetPasswordScreenState();
}

class _ResetPasswordScreenState extends State<ResetPasswordScreen> {
  final _pass = TextEditingController();
  final _confirm = TextEditingController();
  String? _passErr, _confirmErr;
  @override
  void dispose() {
    _pass.dispose();
    _confirm.dispose();
    super.dispose();
  }

  void _save() {
    setState(() {
      _passErr = _pass.text.length < 6 ? tr(context, 'Use at least 6 characters') : null;
      _confirmErr = _confirm.text != _pass.text ? tr(context, 'Passwords do not match') : null;
    });
    if (_passErr != null || _confirmErr != null) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(tr(context, 'Password updated — please sign in'))));
    Navigator.popUntil(context, (r) => r.isFirst);
  }

  @override
  Widget build(BuildContext context) {
    return _AuthPage(
      title: tr(context, 'Set a new password'),
      subtitle: tr(context, 'Choose a strong password you have not used before'),
      showBack: true,
      centered: true,
      form: Column(children: [
        _GlassField(label: tr(context, 'New password'), hint: tr(context, 'Create a password'), icon: Icons.lock_outline_rounded, obscure: true, controller: _pass, error: _passErr),
        const SizedBox(height: 14),
        _GlassField(label: tr(context, 'Confirm password'), hint: tr(context, 'Re-enter password'), icon: Icons.lock_reset_rounded, obscure: true, controller: _confirm, error: _confirmErr),
        const SizedBox(height: 20),
        AuthButton(tr(context, 'Save new password'), icon: Icons.check_rounded, onPressed: _save),
      ]),
    );
  }
}
