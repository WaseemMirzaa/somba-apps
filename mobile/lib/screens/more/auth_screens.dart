import 'package:flutter/material.dart';
import '../../theme/app_theme.dart';
import '../../widgets/kit.dart';

class _AuthScaffold extends StatelessWidget {
  final String title;
  final String subtitle;
  final List<Widget> children;
  const _AuthScaffold({required this.title, required this.subtitle, required this.children});

  @override
  Widget build(BuildContext context) {
    final top = MediaQuery.of(context).padding.top;
    return Scaffold(
      body: ListView(
        padding: EdgeInsets.zero,
        children: [
          Container(
            padding: EdgeInsets.fromLTRB(24, top + 40, 24, 40),
            decoration: const BoxDecoration(
              gradient: AppColors.brandGradient,
              borderRadius: BorderRadius.vertical(bottom: Radius.circular(32)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  height: 54,
                  width: 54,
                  decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(16)),
                  child: const Center(child: Text('S', style: TextStyle(color: AppColors.primary, fontWeight: FontWeight.w800, fontSize: 26, fontFamily: 'PlusJakartaSans'))),
                ),
                const SizedBox(height: 18),
                Text(title, style: const TextStyle(color: Colors.white, fontSize: 26, fontWeight: FontWeight.w800, fontFamily: 'PlusJakartaSans', letterSpacing: -0.5)),
                const SizedBox(height: 6),
                Text(subtitle, style: TextStyle(color: Colors.white.withValues(alpha: 0.9), fontSize: 14)),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 24, 20, 24),
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: children),
          ),
        ],
      ),
    );
  }
}

class LoginScreen extends StatelessWidget {
  const LoginScreen({super.key});
  @override
  Widget build(BuildContext context) {
    return _AuthScaffold(
      title: 'Welcome back',
      subtitle: 'Sign in to continue shopping on Somba',
      children: [
        const AppField(label: 'Phone or email', hint: '+243 970 000 000', icon: Icons.person_outline_rounded),
        const SizedBox(height: 16),
        const AppField(label: 'Password', hint: '••••••••', icon: Icons.lock_outline_rounded, obscure: true),
        const SizedBox(height: 10),
        Align(
          alignment: Alignment.centerRight,
          child: TextButton(onPressed: () {}, child: const Text('Forgot password?')),
        ),
        const SizedBox(height: 8),
        const PrimaryButton('Sign in', icon: Icons.login_rounded),
        const SizedBox(height: 16),
        Row(children: const [
          Expanded(child: Divider()),
          Padding(padding: EdgeInsets.symmetric(horizontal: 12), child: Text('or', style: TextStyle(color: AppColors.muted))),
          Expanded(child: Divider()),
        ]),
        const SizedBox(height: 16),
        OutlinedButton.icon(onPressed: () {}, icon: const Icon(Icons.g_mobiledata_rounded, size: 28), label: const Text('Continue with Google')),
        const SizedBox(height: 20),
        Center(
          child: RichText(
            text: const TextSpan(style: TextStyle(color: AppColors.muted, fontSize: 13.5), children: [
              TextSpan(text: "New here?  "),
              TextSpan(text: 'Create an account', style: TextStyle(color: AppColors.primary, fontWeight: FontWeight.w700)),
            ]),
          ),
        ),
      ],
    );
  }
}

class RegisterScreen extends StatelessWidget {
  const RegisterScreen({super.key});
  @override
  Widget build(BuildContext context) {
    return _AuthScaffold(
      title: 'Create account',
      subtitle: 'Join Somba&Teka in under a minute',
      children: [
        const AppField(label: 'Full name', hint: 'Marie Dubois', icon: Icons.badge_outlined),
        const SizedBox(height: 16),
        const AppField(label: 'Phone number', hint: '+243 970 000 000', icon: Icons.phone_outlined, keyboard: TextInputType.phone),
        const SizedBox(height: 16),
        const AppField(label: 'Email', hint: 'marie@email.com', icon: Icons.mail_outline_rounded, keyboard: TextInputType.emailAddress),
        const SizedBox(height: 16),
        const AppField(label: 'Password', hint: 'Create a password', icon: Icons.lock_outline_rounded, obscure: true),
        const SizedBox(height: 14),
        Row(children: [
          const Icon(Icons.check_box_rounded, color: AppColors.primary, size: 20),
          const SizedBox(width: 8),
          Expanded(child: RichText(text: const TextSpan(style: TextStyle(color: AppColors.muted, fontSize: 12.5), children: [
            TextSpan(text: 'I agree to the '),
            TextSpan(text: 'Terms & Privacy Policy', style: TextStyle(color: AppColors.primary, fontWeight: FontWeight.w700)),
          ]))),
        ]),
        const SizedBox(height: 18),
        const PrimaryButton('Create account', icon: Icons.arrow_forward_rounded),
      ],
    );
  }
}

class OtpScreen extends StatelessWidget {
  const OtpScreen({super.key});
  @override
  Widget build(BuildContext context) {
    return _AuthScaffold(
      title: 'Verify your number',
      subtitle: 'Enter the 6-digit code sent to +243 970 000 000',
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: List.generate(6, (i) {
            final filled = i < 3;
            return Container(
              height: 58,
              width: 48,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: AppColors.surface,
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: filled ? AppColors.primary : AppColors.line, width: filled ? 1.8 : 1.2),
              ),
              child: Text(filled ? '${i + 1}' : '', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 22)),
            );
          }),
        ),
        const SizedBox(height: 22),
        const PrimaryButton('Verify', icon: Icons.verified_rounded),
        const SizedBox(height: 16),
        Center(
          child: RichText(text: const TextSpan(style: TextStyle(color: AppColors.muted, fontSize: 13.5), children: [
            TextSpan(text: "Didn't get it?  "),
            TextSpan(text: 'Resend in 0:24', style: TextStyle(color: AppColors.primary, fontWeight: FontWeight.w700)),
          ])),
        ),
      ],
    );
  }
}

class ForgotScreen extends StatelessWidget {
  const ForgotScreen({super.key});
  @override
  Widget build(BuildContext context) {
    return _AuthScaffold(
      title: 'Reset password',
      subtitle: "We'll send a reset link to your email",
      children: const [
        AppField(label: 'Email', hint: 'marie@email.com', icon: Icons.mail_outline_rounded, keyboard: TextInputType.emailAddress),
        SizedBox(height: 20),
        PrimaryButton('Send reset link', icon: Icons.send_rounded),
      ],
    );
  }
}
