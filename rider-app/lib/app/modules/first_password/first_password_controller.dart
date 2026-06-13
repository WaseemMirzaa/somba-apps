import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../../core/services/session_service.dart';
import '../../core/theme/app_theme.dart';
import '../../routes/app_routes.dart';

class FirstPasswordController extends GetxController {
  final SessionService session = Get.find<SessionService>();

  final newCtrl = TextEditingController();
  final confirmCtrl = TextEditingController();
  final RxBool obscure = true.obs;
  final RxString errorKey = ''.obs;

  void toggleObscure() => obscure.toggle();

  void submit() {
    final pass = newCtrl.text;
    final confirm = confirmCtrl.text;
    if (pass.length < 6) {
      errorKey.value = 'fp_rule_length';
      return;
    }
    if (pass != confirm) {
      errorKey.value = 'fp_error_match';
      return;
    }
    errorKey.value = '';
    Get.snackbar(
      'fp_success_title'.tr,
      'fp_success_body'.tr,
      backgroundColor: AppColors.success,
      colorText: Colors.white,
      duration: const Duration(seconds: 2),
    );
    Get.offAllNamed(
      session.kycApproved.value ? AppRoutes.shell : AppRoutes.kyc,
    );
  }

  @override
  void onClose() {
    newCtrl.dispose();
    confirmCtrl.dispose();
    super.onClose();
  }
}

class FirstPasswordBinding extends Bindings {
  @override
  void dependencies() {
    Get.lazyPut(() => FirstPasswordController());
  }
}
