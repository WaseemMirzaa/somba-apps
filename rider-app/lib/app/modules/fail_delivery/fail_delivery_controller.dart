import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../../core/services/task_service.dart';
import '../../data/models/rider_task.dart';
import '../pod/pod_controller.dart' show advanceAfterStop;

class FailDeliveryController extends GetxController {
  final TaskService tasks = Get.find<TaskService>();

  RiderTask? stop;
  final noteCtrl = TextEditingController();
  final RxString reasonKey = 'fail_reason_absent'.obs;
  final RxBool photoAttached = false.obs;

  static const reasonKeys = [
    'fail_reason_absent',
    'fail_reason_wrong_address',
    'fail_reason_refused',
    'fail_reason_unreachable',
  ];

  @override
  void onInit() {
    super.onInit();
    stop = tasks.taskById(Get.parameters['id'] ?? '');
  }

  void setReason(String? key) {
    if (key != null) reasonKey.value = key;
  }

  void attachPhoto() => photoAttached.value = true;

  void confirm() {
    final s = stop;
    if (s == null) return;
    tasks.failStop(s, reasonKey.value, noteCtrl.text.trim());
    advanceAfterStop(tasks);
  }

  @override
  void onClose() {
    noteCtrl.dispose();
    super.onClose();
  }
}

class FailDeliveryBinding extends Bindings {
  @override
  void dependencies() {
    Get.lazyPut(() => FailDeliveryController());
  }
}
