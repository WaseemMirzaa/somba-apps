import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../../core/theme/app_theme.dart';
import 'first_password_controller.dart';

class FirstPasswordScreen extends GetView<FirstPasswordController> {
  const FirstPasswordScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text('fp_title'.tr)),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Center(
                child: LeadingShield(),
              ),
              const SizedBox(height: 18),
              Text(
                'fp_subtitle'.tr,
                textAlign: TextAlign.center,
                style:
                    const TextStyle(fontSize: 14, color: AppColors.textMuted),
              ),
              const SizedBox(height: 28),
              Obx(
                () => TextField(
                  controller: controller.newCtrl,
                  obscureText: controller.obscure.value,
                  decoration: InputDecoration(
                    labelText: 'fp_new'.tr,
                    prefixIcon: const Icon(Icons.lock_outline),
                    suffixIcon: IconButton(
                      onPressed: controller.toggleObscure,
                      icon: Icon(
                        controller.obscure.value
                            ? Icons.visibility_outlined
                            : Icons.visibility_off_outlined,
                      ),
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 16),
              Obx(
                () => TextField(
                  controller: controller.confirmCtrl,
                  obscureText: controller.obscure.value,
                  decoration: InputDecoration(
                    labelText: 'fp_confirm'.tr,
                    prefixIcon: const Icon(Icons.lock_reset_outlined),
                  ),
                ),
              ),
              const SizedBox(height: 10),
              Text(
                'fp_rule_length'.tr,
                style:
                    const TextStyle(fontSize: 12.5, color: AppColors.textMuted),
              ),
              Obx(
                () => controller.errorKey.value.isEmpty
                    ? const SizedBox(height: 24)
                    : Padding(
                        padding: const EdgeInsets.symmetric(vertical: 10),
                        child: Text(
                          controller.errorKey.value.tr,
                          style: const TextStyle(
                            color: AppColors.danger,
                            fontSize: 13,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
              ),
              FilledButton(
                onPressed: controller.submit,
                child: Text('fp_button'.tr),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class LeadingShield extends StatelessWidget {
  const LeadingShield({super.key});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 72,
      height: 72,
      decoration: BoxDecoration(
        color: AppColors.primary.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(20),
      ),
      child: const Icon(
        Icons.shield_outlined,
        color: AppColors.primary,
        size: 36,
      ),
    );
  }
}
