import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../../core/services/task_service.dart';
import '../../core/theme/app_theme.dart';
import '../../data/models/batch.dart';
import '../../data/models/parcel.dart';
import '../../data/models/rider_task.dart';
import '../../routes/app_routes.dart';

/// Navigates after a stop is resolved: next pending stop or batch summary.
void advanceAfterStop(TaskService tasks) {
  final batch = tasks.activeBatch.value;
  if (batch == null) {
    Get.offAllNamed(AppRoutes.shell);
    return;
  }
  final next = batch.nextPendingStop;
  if (next == null) {
    batch.status = BatchStatus.completed;
    tasks.activeBatch.refresh();
    Get.offNamedUntil(
      AppRoutes.batchDone(batch.id),
      (route) => route.settings.name == AppRoutes.shell,
    );
  } else {
    Get.snackbar(
      'pod_next_title'.tr,
      'pod_next_body'.trParams({'name': next.partyName}),
      backgroundColor: AppColors.primary,
      colorText: Colors.white,
      duration: const Duration(seconds: 2),
    );
    Get.offNamedUntil(
      AppRoutes.stop(next.id),
      (route) => (route.settings.name ?? '').startsWith('/batch/'),
    );
  }
}

class PodController extends GetxController {
  final TaskService tasks = Get.find<TaskService>();

  RiderTask? stop;
  final otpCtrl = TextEditingController();
  final RxSet<String> scanning = <String>{}.obs;
  final RxString errorKey = ''.obs;

  @override
  void onInit() {
    super.onInit();
    stop = tasks.taskById(Get.parameters['id'] ?? '');
  }

  void scanParcel(Parcel parcel) {
    if (parcel.scanned || scanning.contains(parcel.id)) return;
    scanning.add(parcel.id);
    Future.delayed(const Duration(milliseconds: 900), () {
      parcel.scanned = true;
      scanning.remove(parcel.id);
      tasks.activeBatch.refresh();
    });
  }

  void confirm() {
    final s = stop;
    if (s == null) return;
    if (!s.allParcelsScanned) {
      errorKey.value = 'proof_scan_all_error';
      return;
    }
    if (otpCtrl.text.trim() != s.otp) {
      errorKey.value = 'proof_otp_error';
      return;
    }
    errorKey.value = '';
    tasks.completeStop(s);
    advanceAfterStop(tasks);
  }

  @override
  void onClose() {
    otpCtrl.dispose();
    super.onClose();
  }
}

class PodBinding extends Bindings {
  @override
  void dependencies() {
    Get.lazyPut(() => PodController());
  }
}
