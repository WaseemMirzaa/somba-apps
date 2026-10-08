import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter/foundation.dart' show kDebugMode;
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

class _CustomerSplashScreenState extends State<CustomerSplashScreen> with SingleTickerProviderStateMixin {
  Timer? _t;
  late final AnimationController _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 900))..forward();

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
              scale: Tween(begin: 0.85, end: 1.0).animate(CurvedAnimation(parent: _c, curve: Curves.easeOutBack)),
              child: Column(mainAxisSize: MainAxisSize.min, children: [
                const BrandLogo(size: 116, radius: 30),
                const SizedBox(height: 24),
                const Text('Somba&Teka',
                    style: TextStyle(color: Colors.white, fontSize: 30, fontWeight: FontWeight.w800, fontFamily: 'PlusJakartaSans', letterSpacing: -0.6)),
                const SizedBox(height: 8),
                Text('Shop everything, delivered', style: TextStyle(color: Colors.white.withValues(alpha: 0.9), fontSize: 14.5, fontWeight: FontWeight.w600)),
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
  const _AuthPage({required this.title, required this.subtitle, required this.form, this.showBack = false});

  @override
  Widget build(BuildContext context) {
    final top = MediaQuery.of(context).padding.top;
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
            ListView(
              padding: EdgeInsets.fromLTRB(22, top + (showBack ? 8 : 40), 22, 30),
              children: [
                const Center(child: BrandLogo(size: 78, radius: 22)),
                const SizedBox(height: 18),
                Text(title, textAlign: TextAlign.center,
                    style: const TextStyle(color: Colors.white, fontSize: 26, fontWeight: FontWeight.w800, fontFamily: 'PlusJakartaSans', letterSpacing: -0.5)),
                const SizedBox(height: 6),
                Text(subtitle, textAlign: TextAlign.center, style: TextStyle(color: Colors.white.withValues(alpha: 0.92), fontSize: 14)),
                const SizedBox(height: 24),
                GlassCard(child: form),
              ],
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
          prefixIconConstraints: prefix != null ? const BoxConstraints(minWidth: 96, minHeight: 48) : null,
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

  Future<void> _signIn() async {
    setState(() {
      _emailErr = _email.text.trim().isEmpty ? 'Enter your email' : (!_validEmail(_email.text.trim()) ? 'Enter a valid email' : null);
      _passErr = _pass.text.isEmpty ? 'Enter your password' : null;
    });
    if (_emailErr != null || _passErr != null) return;
    setState(() => _loading = true);
    try {
      await RealtimeStore.instance.login(_email.text.trim(), _pass.text);
      if (!mounted) return;
      widget.onAuthed?.call();
    } catch (e) {
      if (!mounted) return;
      setState(() => _passErr = e.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return _AuthPage(
      title: 'Welcome back',
      subtitle: 'Sign in to continue shopping on Somba&Teka',
      form: Column(children: [
        KeyedSubtree(key: const ValueKey('login-email'), child: _GlassField(label: 'Email', hint: 'you@email.com', icon: Icons.mail_outline_rounded, controller: _email, keyboard: TextInputType.emailAddress, error: _emailErr)),
        const SizedBox(height: 14),
        KeyedSubtree(key: const ValueKey('login-password'), child: _GlassField(label: 'Password', hint: '••••••••', icon: Icons.lock_outline_rounded, obscure: true, controller: _pass, error: _passErr)),
        Align(
          alignment: Alignment.centerRight,
          child: TextButton(
            onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => ForgotScreen(initialEmail: _email.text.trim()))),
            style: TextButton.styleFrom(foregroundColor: AppColors.primary),
            child: const Text('Forgot password?', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 12.5)),
          ),
        ),
        const SizedBox(height: 4),
        AuthButton('Sign in', icon: Icons.login_rounded, loading: _loading, onPressed: _signIn),
        const SizedBox(height: 22),
        Center(
          child: GestureDetector(
            key: const ValueKey('go-register'),
            onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => RegisterScreen(onAuthed: widget.onAuthed))),
            child: RichText(text: const TextSpan(style: TextStyle(color: AppColors.muted, fontSize: 13.5), children: [
              TextSpan(text: 'New here?  '),
              TextSpan(text: 'Create an account', style: TextStyle(color: AppColors.primary, fontWeight: FontWeight.w700)),
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
  bool _agree = true;
  bool _loading = false;
  String? _nameErr, _phoneErr, _emailErr, _passErr, _confirmErr;

  static const _codes = [
    ('🇨🇩', '+243', 'DR Congo'),
    ('🇨🇬', '+242', 'Congo'),
    ('🇫🇷', '+33', 'France'),
    ('🇧🇪', '+32', 'Belgium'),
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

  Future<void> _submit() async {
    setState(() {
      _nameErr = _name.text.trim().length < 2 ? 'Enter your full name' : null;
      _phoneErr = _phone.text.trim().length < 6 ? 'Enter a valid phone number' : null;
      _emailErr = !_validEmail(_email.text.trim()) ? 'Enter a valid email' : null;
      _passErr = _pass.text.length < 8 ? 'Use at least 8 characters' : null;
      _confirmErr = _confirm.text != _pass.text ? 'Passwords do not match' : null;
    });
    if ([_nameErr, _phoneErr, _emailErr, _passErr, _confirmErr].any((e) => e != null)) return;
    if (!_agree) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Please accept the Terms & Privacy Policy')));
      return;
    }
    setState(() => _loading = true);
    try {
      final phone = '$_dial${_phone.text.trim().replaceFirst(RegExp(r'^0+'), '')}';
      await RealtimeStore.instance.register(
        email: _email.text.trim(),
        password: _pass.text,
        name: _name.text.trim(),
        phone: phone,
      );
      if (!mounted) return;
      // The account exists and is signed in. Verifying the phone and email is
      // encouraged but never blocks shopping.
      Navigator.push(
        context,
        MaterialPageRoute(builder: (_) => OtpScreen(phone: phone, onAuthed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => VerifyEmailScreen(onVerified: _finish))))),
      );
    } catch (e) {
      if (!mounted) return;
      final m = e.toString();
      setState(() {
        if (m.toLowerCase().contains('email')) {
          _emailErr = m;
        } else if (m.toLowerCase().contains('password')) {
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
    showModalBottomSheet(
      context: context,
      builder: (_) => SafeArea(
          child: Column(mainAxisSize: MainAxisSize.min, children: [
        const Padding(padding: EdgeInsets.all(16), child: Text('Select country code', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16))),
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
      title: 'Create account',
      subtitle: 'Join Somba&Teka in under a minute',
      showBack: true,
      form: Column(children: [
        KeyedSubtree(key: const ValueKey('reg-name'), child: _GlassField(label: 'Full name', hint: 'Your full name', icon: Icons.person_outline_rounded, controller: _name, error: _nameErr)),
        const SizedBox(height: 14),
        KeyedSubtree(
          key: const ValueKey('reg-phone'),
          child: _GlassField(
            label: 'Mobile number (for delivery & payments)',
            hint: '81 234 5678',
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
                  Text(_dial, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
                  const Icon(Icons.arrow_drop_down_rounded, size: 18, color: AppColors.muted),
                ]),
              ),
            ),
          ),
        ),
        const SizedBox(height: 14),
        KeyedSubtree(key: const ValueKey('reg-email'), child: _GlassField(label: 'Email', hint: 'you@email.com', icon: Icons.mail_outline_rounded, controller: _email, keyboard: TextInputType.emailAddress, error: _emailErr)),
        const SizedBox(height: 14),
        KeyedSubtree(key: const ValueKey('reg-password'), child: _GlassField(label: 'Password', hint: 'At least 8 characters', icon: Icons.lock_outline_rounded, obscure: true, controller: _pass, error: _passErr)),
        const SizedBox(height: 14),
        KeyedSubtree(key: const ValueKey('reg-confirm'), child: _GlassField(label: 'Confirm password', hint: 'Re-enter password', icon: Icons.lock_reset_rounded, obscure: true, controller: _confirm, error: _confirmErr)),
        const SizedBox(height: 14),
        GestureDetector(
          onTap: () => setState(() => _agree = !_agree),
          child: Row(children: [
            Icon(_agree ? Icons.check_box_rounded : Icons.check_box_outline_blank_rounded, color: AppColors.primary, size: 22),
            const SizedBox(width: 8),
            Expanded(
                child: RichText(
                    text: const TextSpan(style: TextStyle(color: AppColors.muted, fontSize: 12.5), children: [
              TextSpan(text: 'I agree to the '),
              TextSpan(text: 'Terms & Privacy Policy', style: TextStyle(color: AppColors.primary, fontWeight: FontWeight.w700)),
            ]))),
          ]),
        ),
        const SizedBox(height: 18),
        AuthButton('Create account', icon: Icons.arrow_forward_rounded, loading: _loading, onPressed: _submit),
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
  final List<TextEditingController> _c = List.generate(6, (_) => TextEditingController());
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
      if (mounted) setState(() => _error = e.toString());
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
      setState(() => _error = 'Enter the full 6-digit code');
      return;
    }
    setState(() {
      _error = null;
      _busy = true;
    });
    try {
      await RealtimeStore.instance.verifyPhoneOtp(_code);
      if (!mounted) return;
      widget.onAuthed?.call();
    } catch (e) {
      if (mounted) {
        setState(() {
          _busy = false;
          _error = e.toString();
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return _AuthPage(
      title: 'Verify your number',
      subtitle: 'Enter the 6-digit code sent by SMS to ${widget.phone ?? 'your phone'}',
      showBack: true,
      form: Column(children: [
        Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: List.generate(6, (i) {
              return SizedBox(
                width: 46,
                child: TextField(
                  key: ValueKey('otp-$i'),
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
        if (_error != null)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Text(_error!, key: const ValueKey('otp-error'), style: const TextStyle(color: AppColors.danger, fontSize: 12, fontWeight: FontWeight.w600)),
          ),
        if (_devCode != null)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Text('Dev build — code: $_devCode', key: const ValueKey('otp-dev'), style: const TextStyle(color: AppColors.muted, fontSize: 11.5)),
          ),
        const SizedBox(height: 18),
        AuthButton('Verify', icon: Icons.verified_rounded, loading: _busy, onPressed: _verify),
        const SizedBox(height: 10),
        Center(
          child: _seconds > 0
              ? Text('Resend code in 0:${_seconds.toString().padLeft(2, '0')}', style: const TextStyle(color: AppColors.muted, fontSize: 13, fontWeight: FontWeight.w600))
              : TextButton.icon(
                  onPressed: _send,
                  icon: const Icon(Icons.refresh_rounded, size: 18),
                  style: TextButton.styleFrom(foregroundColor: AppColors.primary),
                  label: const Text('Resend code', style: TextStyle(fontWeight: FontWeight.w700)),
                ),
        ),
        TextButton(
          key: const ValueKey('otp-skip'),
          onPressed: () => widget.onAuthed?.call(),
          child: const Text('Skip for now', style: TextStyle(fontWeight: FontWeight.w700)),
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
          _msg = 'Verification email sent.';
          if (kDebugMode) _devToken = dev;
        });
      }
    } catch (e) {
      if (mounted) setState(() => _msg = e.toString());
    }
  }

  Future<void> _check() async {
    setState(() => _busy = true);
    final verified = await RealtimeStore.instance.refreshEmailVerified();
    if (!mounted) return;
    setState(() {
      _busy = false;
      _msg = verified ? null : 'Not verified yet — tap the link in the email first.';
    });
    if (verified) widget.onVerified?.call();
  }

  @override
  Widget build(BuildContext context) {
    final email = RealtimeStore.instance.user?.email ?? 'your email';
    return _AuthPage(
      title: 'Verify your email',
      subtitle: 'We sent a confirmation link to $email',
      showBack: true,
      form: Column(children: [
        Container(
          padding: const EdgeInsets.all(20),
          decoration: BoxDecoration(color: AppColors.primary.withValues(alpha: 0.08), borderRadius: BorderRadius.circular(18)),
          child: const Column(children: [
            Icon(Icons.mark_email_read_rounded, color: AppColors.primary, size: 46),
            SizedBox(height: 12),
            Text('Check your inbox', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
            SizedBox(height: 6),
            Text('Tap the link in the email to confirm your address. You can keep shopping meanwhile.',
                textAlign: TextAlign.center, style: TextStyle(color: AppColors.muted, fontSize: 13, height: 1.4)),
          ]),
        ),
        if (_msg != null)
          Padding(padding: const EdgeInsets.only(top: 10), child: Text(_msg!, textAlign: TextAlign.center, style: const TextStyle(color: AppColors.muted, fontSize: 12.5))),
        if (_devToken != null)
          Padding(padding: const EdgeInsets.only(top: 6), child: SelectableText('Dev build — token: $_devToken', key: const ValueKey('email-dev'), style: const TextStyle(color: AppColors.muted, fontSize: 10.5))),
        const SizedBox(height: 18),
        AuthButton("I've verified — continue", icon: Icons.check_circle_rounded, loading: _busy, onPressed: _check),
        const SizedBox(height: 6),
        TextButton.icon(
          onPressed: _send,
          icon: const Icon(Icons.refresh_rounded, size: 18),
          style: TextButton.styleFrom(foregroundColor: AppColors.primary),
          label: const Text('Resend email', style: TextStyle(fontWeight: FontWeight.w700)),
        ),
        TextButton(
          key: const ValueKey('email-skip'),
          onPressed: () => widget.onVerified?.call(),
          child: const Text('Skip for now', style: TextStyle(fontWeight: FontWeight.w700)),
        ),
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
    final ok = RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$').hasMatch(_email.text.trim());
    setState(() => _err = ok ? null : 'Enter a valid email');
    if (!ok) return;
    setState(() => _busy = true);
    try {
      final dev = await RealtimeStore.instance.forgotPassword(_email.text.trim());
      if (!mounted) return;
      // Same message whether or not the address has an account.
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('If that email has an account, a reset link is on its way.')));
      Navigator.push(context, MaterialPageRoute(builder: (_) => ResetPasswordScreen(devToken: kDebugMode ? dev : null)));
    } catch (e) {
      if (mounted) setState(() => _err = e.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return _AuthPage(
      title: 'Reset password',
      subtitle: "We'll email you a reset link",
      showBack: true,
      form: Column(children: [
        KeyedSubtree(key: const ValueKey('forgot-email'), child: _GlassField(label: 'Email', hint: 'you@email.com', icon: Icons.mail_outline_rounded, controller: _email, keyboard: TextInputType.emailAddress, error: _err)),
        const SizedBox(height: 20),
        AuthButton('Send reset link', icon: Icons.send_rounded, loading: _busy, onPressed: _send),
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
    setState(() {
      _tokenErr = _token.text.trim().length < 20 ? 'Paste the code from the email' : null;
      _passErr = _pass.text.length < 8 ? 'Use at least 8 characters' : null;
      _confirmErr = _confirm.text != _pass.text ? 'Passwords do not match' : null;
    });
    if (_tokenErr != null || _passErr != null || _confirmErr != null) return;
    setState(() => _busy = true);
    try {
      await RealtimeStore.instance.resetPassword(_token.text.trim(), _pass.text);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Password updated — please sign in')));
      Navigator.popUntil(context, (r) => r.isFirst);
    } catch (e) {
      if (mounted) setState(() => _tokenErr = e.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return _AuthPage(
      title: 'Set a new password',
      subtitle: 'Paste the code from the email, then choose a new password',
      showBack: true,
      form: Column(children: [
        KeyedSubtree(key: const ValueKey('reset-token'), child: _GlassField(label: 'Reset code', hint: 'From the link in your email', icon: Icons.key_rounded, controller: _token, error: _tokenErr)),
        const SizedBox(height: 14),
        KeyedSubtree(key: const ValueKey('reset-password'), child: _GlassField(label: 'New password', hint: 'At least 8 characters', icon: Icons.lock_outline_rounded, obscure: true, controller: _pass, error: _passErr)),
        const SizedBox(height: 14),
        KeyedSubtree(key: const ValueKey('reset-confirm'), child: _GlassField(label: 'Confirm password', hint: 'Re-enter password', icon: Icons.lock_reset_rounded, obscure: true, controller: _confirm, error: _confirmErr)),
        const SizedBox(height: 20),
        AuthButton('Save new password', icon: Icons.check_rounded, loading: _busy, onPressed: _save),
      ]),
    );
  }
}
