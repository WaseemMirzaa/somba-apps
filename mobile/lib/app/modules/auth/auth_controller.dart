import 'package:get/get.dart';

import '../../core/services/session_service.dart';
import '../../routes/app_routes.dart';

/// What the OTP screen should do after a successful verification.
enum OtpPurpose { register, resetPassword }

class AuthController extends GetxController {
  final session = Get.find<SessionService>();

  final loading = false.obs;
  final error = RxnString();

  OtpPurpose otpPurpose = OtpPurpose.register;
  String _pendingName = '';
  String _pendingEmail = '';

  /// Route to return to after a login that interrupted a flow (e.g. checkout).
  String? redirectAfterLogin;

  Future<void> login(String phone, String password) async {
    error.value = null;
    if (phone.trim().isEmpty || password.isEmpty) {
      error.value = 'field_required'.tr;
      return;
    }
    loading.value = true;
    await Future.delayed(const Duration(milliseconds: 700));
    final ok = session.login(phone.trim(), password);
    loading.value = false;
    if (!ok) {
      error.value = 'invalid_credentials'.tr;
      return;
    }
    _finish();
  }

  Future<void> startRegistration(
      String name, String phone, String email, String password) async {
    error.value = null;
    if (name.trim().isEmpty || phone.trim().isEmpty || password.isEmpty) {
      error.value = 'field_required'.tr;
      return;
    }
    loading.value = true;
    await Future.delayed(const Duration(milliseconds: 700));
    loading.value = false;
    _pendingName = name.trim();
    _pendingEmail = email.trim();
    session.pendingPhone = phone.trim();
    otpPurpose = OtpPurpose.register;
    Get.toNamed(AppRoutes.otp);
  }

  Future<void> startPasswordReset(String phone) async {
    error.value = null;
    if (phone.trim().isEmpty) {
      error.value = 'field_required'.tr;
      return;
    }
    loading.value = true;
    await Future.delayed(const Duration(milliseconds: 700));
    loading.value = false;
    session.pendingPhone = phone.trim();
    otpPurpose = OtpPurpose.resetPassword;
    Get.toNamed(AppRoutes.otp);
  }

  Future<bool> verifyOtp(String code) async {
    error.value = null;
    loading.value = true;
    await Future.delayed(const Duration(milliseconds: 700));
    loading.value = false;
    if (code != '123456') {
      error.value = 'otp_invalid'.tr;
      return false;
    }
    if (otpPurpose == OtpPurpose.register) {
      session.completeRegistration(
          _pendingName, session.pendingPhone, _pendingEmail);
      _finish();
    } else {
      Get.offNamed(AppRoutes.reset);
    }
    return true;
  }

  void completeReset() {
    Get.offAllNamed(AppRoutes.login);
    Get.snackbar('reset_password'.tr, 'password_updated'.tr,
        snackPosition: SnackPosition.BOTTOM);
  }

  void _finish() {
    final target = redirectAfterLogin;
    redirectAfterLogin = null;
    if (target != null) {
      Get.offNamedUntil(target, (route) => route.isFirst);
    } else {
      Get.offAllNamed(AppRoutes.shell);
    }
  }
}
