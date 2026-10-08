import 'dart:async';
import 'package:flutter/material.dart';
import '../../services/rider_store.dart';
import 'package:flutter/foundation.dart' show kDebugMode;
import '../../theme/app_theme.dart';
import '../../widgets/ui.dart';

// ---------------- Splash ----------------
class SplashScreen extends StatefulWidget {
  final VoidCallback onDone;
  const SplashScreen({super.key, required this.onDone});
  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen> {
  Timer? _t;
  @override
  void initState() {
    super.initState();
    _t = Timer(const Duration(milliseconds: 1200), widget.onDone);
  }

  @override
  void dispose() {
    _t?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Container(
        decoration: const BoxDecoration(gradient: AppColors.brandGradient),
        child: Center(
          child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
            Container(
              height: 92,
              width: 92,
              decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(26), boxShadow: AppShadow.floating),
              child: const Icon(Icons.two_wheeler_rounded, color: AppColors.primary, size: 52),
            ),
            const SizedBox(height: 22),
            const Text('Somba&Teka',
                style: TextStyle(color: Colors.white, fontSize: 27, fontWeight: FontWeight.w800, fontFamily: 'PlusJakartaSans', letterSpacing: -0.6)),
            const SizedBox(height: 6),
            Text('Rider partner', style: TextStyle(color: Colors.white.withValues(alpha: 0.9), fontSize: 14, fontWeight: FontWeight.w600)),
            const SizedBox(height: 34),
            SizedBox(
              height: 22,
              width: 22,
              child: CircularProgressIndicator(strokeWidth: 2.4, valueColor: AlwaysStoppedAnimation(Colors.white.withValues(alpha: 0.9))),
            ),
          ]),
        ),
      ),
    );
  }
}

// ---------------- Login ----------------
class RiderLoginScreen extends StatefulWidget {
  final VoidCallback? onSignedIn;
  const RiderLoginScreen({super.key, this.onSignedIn});
  @override
  State<RiderLoginScreen> createState() => _RiderLoginScreenState();
}

class _RiderLoginScreenState extends State<RiderLoginScreen> {
  final _id = TextEditingController();
  final _pass = TextEditingController();
  bool _loading = false;
  String? _error;

  @override
  void dispose() {
    _id.dispose();
    _pass.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_id.text.trim().isEmpty || _pass.text.isEmpty) {
      setState(() => _error = 'Enter your email and password');
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      await RiderStore.instance.login(_id.text.trim(), _pass.text);
      if (!mounted) return;
      widget.onSignedIn?.call();
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final top = MediaQuery.of(context).padding.top;
    return Scaffold(
      body: ListView(padding: EdgeInsets.zero, children: [
        Container(
          padding: EdgeInsets.fromLTRB(24, top + 52, 24, 44),
          decoration: const BoxDecoration(gradient: AppColors.brandGradient, borderRadius: BorderRadius.vertical(bottom: Radius.circular(32))),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Container(
                height: 56,
                width: 56,
                decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(16)),
                child: const Icon(Icons.two_wheeler_rounded, color: AppColors.primary, size: 32)),
            const SizedBox(height: 18),
            const Text('Welcome back',
                style: TextStyle(color: Colors.white, fontSize: 27, fontWeight: FontWeight.w800, fontFamily: 'PlusJakartaSans', letterSpacing: -0.5)),
            const SizedBox(height: 6),
            Text('Sign in to start your shift', style: TextStyle(color: Colors.white.withValues(alpha: 0.9), fontSize: 14)),
          ]),
        ),
        Padding(
          padding: const EdgeInsets.all(20),
          child: Column(children: [
            RiderField(fieldKey: const ValueKey('rider-email'), label: 'Email', hint: 'you@somba.app', icon: Icons.mail_outline_rounded, controller: _id, keyboard: TextInputType.emailAddress),
            const SizedBox(height: 16),
            RiderField(fieldKey: const ValueKey('rider-password'), label: 'Password', hint: 'Enter your password', icon: Icons.lock_outline_rounded, obscure: true, controller: _pass),
            if (_error != null)
              Padding(
                padding: const EdgeInsets.only(top: 10),
                child: Align(alignment: Alignment.centerLeft, child: Text(_error!, key: const ValueKey('login-error'), style: const TextStyle(color: AppColors.danger, fontSize: 12.5, fontWeight: FontWeight.w600))),
              ),
            const SizedBox(height: 6),
            Align(
              alignment: Alignment.centerRight,
              child: TextButton(
                onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => ForgotPasswordScreen(initialEmail: _id.text.trim()))),
                style: TextButton.styleFrom(foregroundColor: AppColors.primary),
                child: const Text('Forgot password?', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
              ),
            ),
            const SizedBox(height: 8),
            SizedBox(
              width: double.infinity,
              child: FilledButton(
                key: const ValueKey('rider-signin'),
                onPressed: _loading ? null : _submit,
                child: _loading
                    ? const SizedBox(height: 22, width: 22, child: CircularProgressIndicator(strokeWidth: 2.4, color: Colors.white))
                    : const Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                        Text('Sign in'),
                        SizedBox(width: 8),
                        Icon(Icons.arrow_forward_rounded, size: 20),
                      ]),
              ),
            ),
            const SizedBox(height: 18),
            const Row(children: [
              Icon(Icons.shield_outlined, size: 16, color: AppColors.muted),
              SizedBox(width: 6),
              Expanded(child: Text('Rider accounts are created by the Somba&Teka fleet team.', style: TextStyle(color: AppColors.muted, fontSize: 12, height: 1.3))),
            ]),
          ]),
        ),
      ]),
    );
  }
}

// ---------------- Forgot / reset password (email link) ----------------
class ForgotPasswordScreen extends StatefulWidget {
  final String initialEmail;
  const ForgotPasswordScreen({super.key, this.initialEmail = ''});
  @override
  State<ForgotPasswordScreen> createState() => _ForgotPasswordScreenState();
}

class _ForgotPasswordScreenState extends State<ForgotPasswordScreen> {
  late final _email = TextEditingController(text: widget.initialEmail);
  final _token = TextEditingController();
  final _pass = TextEditingController();
  bool _sent = false;
  bool _busy = false;
  String? _msg;

  @override
  void dispose() {
    _email.dispose();
    _token.dispose();
    _pass.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    if (!RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$').hasMatch(_email.text.trim())) {
      setState(() => _msg = 'Enter a valid email');
      return;
    }
    setState(() {
      _busy = true;
      _msg = null;
    });
    try {
      final dev = await RiderStore.instance.forgotPassword(_email.text.trim());
      if (!mounted) return;
      setState(() {
        _sent = true;
        _msg = 'If that email has an account, a reset link is on its way.';
        if (kDebugMode && dev != null) _token.text = dev;
      });
    } catch (e) {
      if (mounted) setState(() => _msg = e.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _reset() async {
    if (_pass.text.length < 8) {
      setState(() => _msg = 'Use at least 8 characters');
      return;
    }
    setState(() {
      _busy = true;
      _msg = null;
    });
    try {
      await RiderStore.instance.resetPassword(_token.text, _pass.text);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Password updated — please sign in')));
      Navigator.pop(context);
    } catch (e) {
      if (mounted) setState(() => _msg = e.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: backAppBar(context, 'Reset password'),
      body: ListView(padding: const EdgeInsets.fromLTRB(20, 8, 20, 24), children: [
        Container(
          height: 64,
          width: 64,
          decoration: BoxDecoration(color: AppColors.primary.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(18)),
          child: const Icon(Icons.lock_reset_rounded, color: AppColors.primary, size: 34),
        ),
        const SizedBox(height: 16),
        const Text('Forgot your password?', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 19, fontFamily: 'PlusJakartaSans')),
        const SizedBox(height: 6),
        Text(_sent ? 'Paste the code from the email and choose a new password.' : "Enter your email and we'll send you a reset link.",
            style: const TextStyle(color: AppColors.muted, fontSize: 13.5, height: 1.4)),
        const SizedBox(height: 22),
        RiderField(fieldKey: const ValueKey('forgot-email'), label: 'Email', hint: 'you@somba.app', icon: Icons.mail_outline_rounded, controller: _email, keyboard: TextInputType.emailAddress),
        if (_sent) ...[
          const SizedBox(height: 14),
          RiderField(fieldKey: const ValueKey('reset-token'), label: 'Reset code', hint: 'From the email', icon: Icons.key_rounded, controller: _token),
          const SizedBox(height: 14),
          RiderField(fieldKey: const ValueKey('reset-password'), label: 'New password', hint: 'At least 8 characters', icon: Icons.lock_outline_rounded, obscure: true, controller: _pass),
        ],
        if (_msg != null) Padding(padding: const EdgeInsets.only(top: 12), child: Text(_msg!, key: const ValueKey('forgot-msg'), style: const TextStyle(color: AppColors.muted, fontSize: 12.5))),
        const SizedBox(height: 22),
        PrimaryButton(_busy ? '…' : (_sent ? 'Save new password' : 'Send reset link'), icon: _sent ? Icons.check_rounded : Icons.send_rounded, onPressed: _busy ? null : (_sent ? _reset : _send)),
      ]),
    );
  }
}

// ---------------- Shared labelled text field ----------------
class RiderField extends StatelessWidget {
  final String label, hint;
  final IconData icon;
  final bool obscure;
  final TextEditingController? controller;
  final TextInputType? keyboard;
  final Key? fieldKey;
  const RiderField({super.key, this.fieldKey, required this.label, required this.hint, required this.icon, this.obscure = false, this.controller, this.keyboard});
  @override
  Widget build(BuildContext context) {
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(label, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13, color: AppColors.inkSoft)),
      const SizedBox(height: 6),
      TextField(
        key: fieldKey,
        controller: controller,
        obscureText: obscure,
        keyboardType: keyboard,
        decoration: InputDecoration(
          hintText: hint,
          prefixIcon: Icon(icon, size: 20),
          filled: true,
          fillColor: AppColors.surface,
          enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: const BorderSide(color: AppColors.line)),
          focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: const BorderSide(color: AppColors.primary, width: 1.6)),
          border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: const BorderSide(color: AppColors.line)),
        ),
      ),
    ]);
  }
}
