import 'dart:async';
import 'package:flutter/material.dart';
import '../../theme/app_theme.dart';
import '../../widgets/rider_brand.dart';

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
    _t = Timer(const Duration(milliseconds: 1600), widget.onDone);
  }

  @override
  void dispose() {
    _t?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: RiderAuthBackdrop(
        child: Center(
          child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
            const RiderBrandLogo(size: 96, radius: 28),
            const SizedBox(height: 22),
            const Text('Somba&Teka',
                style: TextStyle(color: Colors.white, fontSize: 27, fontWeight: FontWeight.w800, fontFamily: 'PlusJakartaSans', letterSpacing: -0.6)),
            const SizedBox(height: 6),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 5),
              decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.18), borderRadius: BorderRadius.circular(100)),
              child: Row(mainAxisSize: MainAxisSize.min, children: [
                const Icon(Icons.two_wheeler_rounded, color: Colors.white, size: 16),
                const SizedBox(width: 6),
                Text('Rider partner', style: TextStyle(color: Colors.white.withValues(alpha: 0.95), fontSize: 13.5, fontWeight: FontWeight.w700)),
              ]),
            ),
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

// ---------------- Login / First password ----------------
class RiderLoginScreen extends StatefulWidget {
  /// When null the screen is preview-only (gallery); otherwise fires on sign-in.
  final VoidCallback? onSignedIn;
  const RiderLoginScreen({super.key, this.onSignedIn});
  @override
  State<RiderLoginScreen> createState() => _RiderLoginScreenState();
}

class _RiderLoginScreenState extends State<RiderLoginScreen> {
  final _id = TextEditingController(text: 'RDR-001');
  final _pass = TextEditingController();
  bool _loading = false;

  @override
  void dispose() {
    _id.dispose();
    _pass.dispose();
    super.dispose();
  }

  void _submit() {
    setState(() => _loading = true);
    Future.delayed(const Duration(milliseconds: 700), () {
      if (!mounted) return;
      setState(() => _loading = false);
      widget.onSignedIn?.call();
    });
  }

  @override
  Widget build(BuildContext context) {
    return RiderAuthPage(
      title: 'Welcome back',
      subtitle: 'Sign in to start your shift',
      form: Column(children: [
        RiderField(label: 'Rider ID', hint: 'RDR-001', icon: Icons.badge_outlined, controller: _id),
        const SizedBox(height: 16),
        RiderField(label: 'Password', hint: 'Enter your password', icon: Icons.lock_outline_rounded, obscure: true, controller: _pass),
        Align(
          alignment: Alignment.centerRight,
          child: TextButton(
            onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const ForgotPasswordScreen())),
            style: TextButton.styleFrom(foregroundColor: AppColors.primary),
            child: const Text('Forgot password?', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
          ),
        ),
        const SizedBox(height: 4),
        RiderAuthButton('Sign in', icon: Icons.arrow_forward_rounded, loading: _loading, onPressed: _submit),
        const SizedBox(height: 16),
        Row(children: [
          const Icon(Icons.shield_outlined, size: 16, color: AppColors.muted),
          const SizedBox(width: 6),
          Expanded(
              child: Text('Your account is created by the Somba&Teka fleet team.',
                  style: TextStyle(color: AppColors.muted, fontSize: 12, height: 1.3))),
        ]),
      ]),
    );
  }
}

// ---------------- Forgot password ----------------
class ForgotPasswordScreen extends StatelessWidget {
  const ForgotPasswordScreen({super.key});
  @override
  Widget build(BuildContext context) {
    return RiderAuthPage(
      title: 'Reset password',
      subtitle: 'We will send a reset code to your registered phone',
      showBack: true,
      centered: true,
      form: Column(children: [
        const RiderField(label: 'Rider ID', hint: 'RDR-001', icon: Icons.badge_outlined),
        const SizedBox(height: 20),
        RiderAuthButton('Send reset code',
            icon: Icons.send_rounded,
            onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const OtpScreen()))),
      ]),
    );
  }
}

// ---------------- OTP verification ----------------
class OtpScreen extends StatefulWidget {
  const OtpScreen({super.key});
  @override
  State<OtpScreen> createState() => _OtpScreenState();
}

class _OtpScreenState extends State<OtpScreen> {
  int _filled = 4;
  @override
  Widget build(BuildContext context) {
    return RiderAuthPage(
      title: 'Verify code',
      subtitle: 'We sent a code to your phone ending •• 82',
      showBack: true,
      centered: true,
      form: Column(children: [
        Row(mainAxisAlignment: MainAxisAlignment.spaceEvenly, children: List.generate(4, (i) {
          final active = i < _filled;
          return Container(
            height: 64,
            width: 58,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: AppColors.background,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: active ? AppColors.primary : AppColors.line, width: active ? 1.6 : 1),
            ),
            child: Text(active ? '•' : '', style: const TextStyle(fontSize: 30, fontWeight: FontWeight.w800, color: AppColors.primary)),
          );
        })),
        const SizedBox(height: 18),
        TextButton.icon(
          onPressed: () => setState(() => _filled = 4),
          icon: const Icon(Icons.refresh_rounded, size: 18),
          style: TextButton.styleFrom(foregroundColor: AppColors.primary),
          label: const Text('Resend code', style: TextStyle(fontWeight: FontWeight.w700)),
        ),
        const SizedBox(height: 10),
        RiderAuthButton('Verify & continue',
            icon: Icons.check_rounded, onPressed: () => Navigator.popUntil(context, (r) => r.isFirst)),
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
  const RiderField({super.key, required this.label, required this.hint, required this.icon, this.obscure = false, this.controller});
  @override
  Widget build(BuildContext context) {
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(label, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13, color: AppColors.inkSoft)),
      const SizedBox(height: 6),
      TextField(
        controller: controller,
        obscureText: obscure,
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
