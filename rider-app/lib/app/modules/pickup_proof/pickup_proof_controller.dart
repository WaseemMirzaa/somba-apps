import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../../core/services/task_service.dart';
import '../../core/theme/app_theme.dart';
import '../../data/models/parcel.dart';
import '../../data/models/rider_task.dart';
import '../../routes/app_routes.dart';

class PickupProofController extends GetxController {
  final TaskService tasks = Get.find<TaskService>();

  RiderTask? task;
  final otpCtrl = TextEditingController();
  final RxSet<String> scanning = <String>{}.obs;
  final RxString errorKey = ''.obs;

  @override
  void onInit() {
    super.onInit();
    task = tasks.taskById(Get.parameters['id'] ?? '');
  }

  /// Simulates a barcode scan with a short delay.
  void scanParcel(Parcel parcel) {
    if (parcel.scanned || scanning.contains(parcel.id)) return;
    scanning.add(parcel.id);
    Future.delayed(const Duration(milliseconds: 900), () {
      parcel.scanned = true;
      scanning.remove(parcel.id);
      tasks.refreshTasks();
    });
  }

  void confirm() {
    final t = task;
    if (t == null) return;
    if (!t.allParcelsScanned) {
      errorKey.value = 'proof_scan_all_error';
      return;
    }
    if (otpCtrl.text.trim() != t.otp) {
      errorKey.value = 'proof_otp_error';
      return;
    }
    errorKey.value = '';
    t.status = TaskStatus.toWarehouse;
    tasks.refreshTasks();
    Get.snackbar(
      'proof_done_title'.tr,
      'proof_done_body'.tr,
      backgroundColor: AppColors.success,
      colorText: Colors.white,
      duration: const Duration(seconds: 2),
    );
    Get.offNamed(AppRoutes.taskWarehouse(t.id));
  }

  @override
  void onClose() {
    otpCtrl.dispose();
    super.onClose();
  }
}

class PickupProofBinding extends Bindings {
  @override
  void dependencies() {
    Get.lazyPut(() => PickupProofController());
  }
}
