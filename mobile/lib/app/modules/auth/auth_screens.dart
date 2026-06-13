import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../../core/theme/app_theme.dart';
import '../../routes/app_routes.dart';
import 'auth_controller.dart';

class _AuthScaffold extends StatelessWidget {
  final String title;
  final List<Widget> children;

  const _AuthScaffold({required this.title, required this.children});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(),
      backgroundColor: AppColors.surface,
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(24),
          children: [
            const CircleAvatar(
              radius: 32,
              backgroundColor: AppColors.primaryLight,
              child:
                  Icon(Icons.shopping_bag, size: 32, color: AppColors.brandRed),
            ),
            const SizedBox(height: 20),
            Text(
              title,
              textAlign: TextAlign.center,
              style: const TextStyle(
                  fontSize: 24, fontWeight: FontWeight.w800, color: AppColors.ink),
            ),
            const SizedBox(height: 24),
            ...children,
          ],
        ),
      ),
    );
  }
}

class _ErrorBanner extends StatelessWidget {
  const _ErrorBanner();

  @override
  Widget build(BuildContext context) {
    final controller = Get.find<AuthController>();
    return Obx(() {
      final message = controller.error.value;
      if (message == null) return const SizedBox.shrink();
      return Container(
        margin: const EdgeInsets.only(bottom: 16),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: AppColors.brandRedLight,
          borderRadius: BorderRadius.circular(12),
        ),
        child: Text(message,
            style: const TextStyle(color: AppColors.danger, fontSize: 13)),
      );
    });
  }
}

class _SubmitButton extends StatelessWidget {
  final String label;
  final VoidCallback onPressed;

  const _SubmitButton({required this.label, required this.onPressed});

  @override
  Widget build(BuildContext context) {
    final controller = Get.find<AuthController>();
    return Obx(
      () => FilledButton(
        onPressed: controller.loading.value ? null : onPressed,
        child: controller.loading.value
            ? const SizedBox(
                width: 22,
                height: 22,
                child: CircularProgressIndicator(strokeWidth: 2.5))
            : Text(label),
      ),
    );
  }
}

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _phone = TextEditingController();
  final _password = TextEditingController();

  @override
  void dispose() {
    _phone.dispose();
    _password.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final controller = Get.find<AuthController>();
    return _AuthScaffold(
      title: 'login'.tr,
      children: [
        const _ErrorBanner(),
        TextField(
          controller: _phone,
          keyboardType: TextInputType.phone,
          decoration: InputDecoration(
            labelText: 'phone_number'.tr,
            hintText: '+243 991 234 567',
            prefixIcon: const Icon(Icons.phone_outlined),
          ),
        ),
        const SizedBox(height: 14),
        TextField(
          controller: _password,
          obscureText: true,
          decoration: InputDecoration(
            labelText: 'password'.tr,
            prefixIcon: const Icon(Icons.lock_outline),
          ),
        ),
        Align(
          alignment: Alignment.centerRight,
          child: TextButton(
            onPressed: () => Get.toNamed(AppRoutes.forgot),
            child: Text('forgot_password'.tr),
          ),
        ),
        _SubmitButton(
          label: 'login'.tr,
          onPressed: () => controller.login(_phone.text, _password.text),
        ),
        const SizedBox(height: 10),
        Text(
          'demo_credentials'.tr,
          textAlign: TextAlign.center,
          style: const TextStyle(fontSize: 12, color: AppColors.muted),
        ),
        const SizedBox(height: 16),
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text('no_account_yet'.tr,
                style: const TextStyle(color: AppColors.muted)),
            TextButton(
              onPressed: () => Get.offNamed(AppRoutes.register),
              child: Text('register'.tr),
            ),
          ],
        ),
        TextButton(
          onPressed: () => Get.offAllNamed(AppRoutes.shell),
          child: Text('continue_as_guest'.tr),
        ),
      ],
    );
  }
}

class RegisterScreen extends StatefulWidget {
  const RegisterScreen({super.key});

  @override
  State<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends State<RegisterScreen> {
  final _name = TextEditingController();
  final _phone = TextEditingController();
  final _email = TextEditingController();
  final _password = TextEditingController();

  @override
  void dispose() {
    _name.dispose();
    _phone.dispose();
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final controller = Get.find<AuthController>();
    return _AuthScaffold(
      title: 'register'.tr,
      children: [
        const _ErrorBanner(),
        TextField(
          controller: _name,
          decoration: InputDecoration(
            labelText: 'full_name'.tr,
            prefixIcon: const Icon(Icons.person_outline),
          ),
        ),
        const SizedBox(height: 14),
        TextField(
          controller: _phone,
          keyboardType: TextInputType.phone,
          decoration: InputDecoration(
            labelText: 'phone_number'.tr,
            hintText: '+243 991 234 567',
            prefixIcon: const Icon(Icons.phone_outlined),
          ),
        ),
        const SizedBox(height: 14),
        TextField(
          controller: _email,
          keyboardType: TextInputType.emailAddress,
          decoration: InputDecoration(
            labelText: 'email_optional'.tr,
            prefixIcon: const Icon(Icons.mail_outline),
          ),
        ),
        const SizedBox(height: 14),
        TextField(
          controller: _password,
          obscureText: true,
          decoration: InputDecoration(
            labelText: 'password'.tr,
            prefixIcon: const Icon(Icons.lock_outline),
          ),
        ),
        const SizedBox(height: 20),
        _SubmitButton(
          label: 'continue'.tr,
          onPressed: () => controller.startRegistration(
              _name.text, _phone.text, _email.text, _password.text),
        ),
        const SizedBox(height: 16),
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text('already_have_account'.tr,
                style: const TextStyle(color: AppColors.muted)),
            TextButton(
              onPressed: () => Get.offNamed(AppRoutes.login),
              child: Text('login'.tr),
            ),
          ],
        ),
      ],
    );
  }
}

class OtpScreen extends StatefulWidget {
  const OtpScreen({super.key});

  @override
  State<OtpScreen> createState() => _OtpScreenState();
}

class _OtpScreenState extends State<OtpScreen> {
  final _code = TextEditingController();

  @override
  void dispose() {
    _code.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final controller = Get.find<AuthController>();
    return _AuthScaffold(
      title: 'otp_title'.tr,
      children: [
        Text(
          '${'otp_sent_to'.tr} ${controller.session.pendingPhone}',
          textAlign: TextAlign.center,
          style: const TextStyle(color: AppColors.muted),
        ),
        const SizedBox(height: 20),
        const _ErrorBanner(),
        TextField(
          controller: _code,
          keyboardType: TextInputType.number,
          maxLength: 6,
          textAlign: TextAlign.center,
          style: const TextStyle(
              fontSize: 24, fontWeight: FontWeight.w800, letterSpacing: 12),
          decoration: const InputDecoration(counterText: '', hintText: '••••••'),
        ),
        const SizedBox(height: 20),
        _SubmitButton(
          label: 'verify'.tr,
          onPressed: () => controller.verifyOtp(_code.text),
        ),
        TextButton(
          onPressed: () => Get.snackbar('otp_title'.tr, 'otp_resent'.tr,
              snackPosition: SnackPosition.BOTTOM),
          child: Text('otp_resend'.tr),
        ),
      ],
    );
  }
}

class ForgotPasswordScreen extends StatefulWidget {
  const ForgotPasswordScreen({super.key});

  @override
  State<ForgotPasswordScreen> createState() => _ForgotPasswordScreenState();
}

class _ForgotPasswordScreenState extends State<ForgotPasswordScreen> {
  final _phone = TextEditingController();

  @override
  void dispose() {
    _phone.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final controller = Get.find<AuthController>();
    return _AuthScaffold(
      title: 'reset_password'.tr,
      children: [
        Text('reset_password_hint'.tr,
            textAlign: TextAlign.center,
            style: const TextStyle(color: AppColors.muted)),
        const SizedBox(height: 20),
        const _ErrorBanner(),
        TextField(
          controller: _phone,
          keyboardType: TextInputType.phone,
          decoration: InputDecoration(
            labelText: 'phone_number'.tr,
            prefixIcon: const Icon(Icons.phone_outlined),
          ),
        ),
        const SizedBox(height: 20),
        _SubmitButton(
          label: 'send_code'.tr,
          onPressed: () => controller.startPasswordReset(_phone.text),
        ),
      ],
    );
  }
}

class ResetPasswordScreen extends StatefulWidget {
  const ResetPasswordScreen({super.key});

  @override
  State<ResetPasswordScreen> createState() => _ResetPasswordScreenState();
}

class _ResetPasswordScreenState extends State<ResetPasswordScreen> {
  final _password = TextEditingController();
  final _confirm = TextEditingController();
  String? _error;

  @override
  void dispose() {
    _password.dispose();
    _confirm.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final controller = Get.find<AuthController>();
    return _AuthScaffold(
      title: 'reset_password'.tr,
      children: [
        if (_error != null)
          Container(
            margin: const EdgeInsets.only(bottom: 16),
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: AppColors.brandRedLight,
              borderRadius: BorderRadius.circular(12),
            ),
            child: Text(_error!,
                style:
                    const TextStyle(color: AppColors.danger, fontSize: 13)),
          ),
        TextField(
          controller: _password,
          obscureText: true,
          decoration: InputDecoration(
            labelText: 'new_password'.tr,
            prefixIcon: const Icon(Icons.lock_outline),
          ),
        ),
        const SizedBox(height: 14),
        TextField(
          controller: _confirm,
          obscureText: true,
          decoration: InputDecoration(
            labelText: 'confirm_password'.tr,
            prefixIcon: const Icon(Icons.lock_outline),
          ),
        ),
        const SizedBox(height: 20),
        FilledButton(
          onPressed: () {
            if (_password.text.isEmpty) {
              setState(() => _error = 'field_required'.tr);
            } else if (_password.text != _confirm.text) {
              setState(() => _error = 'password_mismatch'.tr);
            } else {
              controller.completeReset();
            }
          },
          child: Text('save'.tr),
        ),
      ],
    );
  }
}
