import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';

import '../../core/services/task_service.dart';
import '../../core/theme/app_theme.dart';
import '../../core/utils/map_utils.dart';
import '../../data/models/rider_task.dart';
import '../../routes/app_routes.dart';

class WarehouseController extends GetxController {
  final TaskService tasks = Get.find<TaskService>();

  RiderTask? task;
  GoogleMapController? mapController;

  @override
  void onInit() {
    super.onInit();
    task = tasks.taskById(Get.parameters['id'] ?? '');
  }

  List<LatLng> get routePoints {
    final t = task;
    if (t == null) return const [];
    return [t.position, tasks.warehouse.position];
  }

  void onMapCreated(GoogleMapController controller) {
    mapController = controller;
    MapUtils.fit(controller, routePoints);
  }

  void checkIn() {
    final t = task;
    if (t == null) return;
    Get.dialog(
      AlertDialog(
        shape:
            RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        icon: const Icon(
          Icons.check_circle,
          color: AppColors.success,
          size: 52,
        ),
        title: Text('wh_success_title'.tr),
        content: Text(
          'wh_success_body'.trParams({'id': t.id}),
          textAlign: TextAlign.center,
        ),
        actions: [
          SizedBox(
            width: double.infinity,
            child: FilledButton(
              onPressed: () {
                Get.back();
                tasks.completePickup(t);
                Get.offAllNamed(AppRoutes.shell);
              },
              child: Text('wh_back_to_tasks'.tr),
            ),
          ),
        ],
      ),
      barrierDismissible: false,
    );
  }
}

class WarehouseBinding extends Bindings {
  @override
  void dependencies() {
    Get.lazyPut(() => WarehouseController());
  }
}
