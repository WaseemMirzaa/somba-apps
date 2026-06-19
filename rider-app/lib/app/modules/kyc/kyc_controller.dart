import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../../core/services/session_service.dart';
import '../../routes/app_routes.dart';

class KycController extends GetxController {
  final SessionService session = Get.find<SessionService>();

  final idCtrl = TextEditingController();
  final plateCtrl = TextEditingController();
  final RxString vehicleKey = 'vehicle_motorcycle'.obs;
  final RxBool idDocAttached = false.obs;
  final RxBool photoAttached = false.obs;
  final RxBool submitted = false.obs;
  final RxString errorKey = ''.obs;

  static const vehicleKeys = [
    'vehicle_motorcycle',
    'vehicle_car',
    'vehicle_bicycle',
  ];

  void attachIdDoc() => idDocAttached.value = true;

  void attachPhoto() => photoAttached.value = true;

  void setVehicle(String? key) {
    if (key != null) vehicleKey.value = key;
  }

  void submit() {
    if (idCtrl.text.trim().isEmpty ||
        plateCtrl.text.trim().isEmpty ||
        !idDocAttached.value ||
        !photoAttached.value) {
      errorKey.value = 'kyc_error_fields';
      return;
    }
    errorKey.value = '';
    submitted.value = true;
  }

  /// Mock approval: in the prototype, review succeeds instantly.
  void continueToApp() {
    session.kycApproved.value = true;
    Get.offAllNamed(AppRoutes.shell);
  }

  @override
  void onClose() {
    idCtrl.dispose();
    plateCtrl.dispose();
    super.onClose();
  }
}

class KycBinding extends Bindings {
  @override
  void dependencies() {
    Get.lazyPut(() => KycController());
  }
}
