import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../../core/services/session_service.dart';
import '../../core/services/task_service.dart';
import '../../data/mock/mock_data.dart';
import '../../routes/app_routes.dart';

class LoginController extends GetxController {
  final SessionService session = Get.find<SessionService>();
  final TaskService tasks = Get.find<TaskService>();

  final phoneCtrl = TextEditingController();
  final passwordCtrl = TextEditingController();
  final RxBool obscure = true.obs;
  final RxBool loading = false.obs;
  final RxString errorKey = ''.obs;

  void toggleObscure() => obscure.toggle();

  void submit() {
    if (loading.value) return;
    final phone = phoneCtrl.text.trim();
    final password = passwordCtrl.text;
    if (phone.isEmpty) {
      errorKey.value = 'login_error_phone';
      return;
    }
    if (password != 'somba123') {
      errorKey.value = 'login_error_credentials';
      return;
    }
    errorKey.value = '';
    loading.value = true;
    Future.delayed(const Duration(milliseconds: 700), () {
      tasks.reset();
      session.login(MockData.rider);
      loading.value = false;
      // Mock first-login flow: every login asks to set a new password.
      Get.offAllNamed(AppRoutes.firstPassword);
    });
  }

  @override
  void onClose() {
    phoneCtrl.dispose();
    passwordCtrl.dispose();
    super.onClose();
  }
}

class LoginBinding extends Bindings {
  @override
  void dependencies() {
    Get.lazyPut(() => LoginController());
  }
}
