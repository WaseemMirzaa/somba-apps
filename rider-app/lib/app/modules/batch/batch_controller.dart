import 'package:get/get.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';

import '../../core/services/task_service.dart';
import '../../core/utils/map_utils.dart';
import '../../data/models/batch.dart';
import '../../routes/app_routes.dart';

class BatchController extends GetxController {
  final TaskService tasks = Get.find<TaskService>();

  Batch? batch;
  GoogleMapController? mapController;

  @override
  void onInit() {
    super.onInit();
    final id = Get.parameters['id'] ?? '';
    final active = tasks.activeBatch.value;
    batch = (active != null && active.id == id) ? active : null;
  }

  void onMapCreated(GoogleMapController controller) {
    mapController = controller;
    final b = batch;
    if (b != null) MapUtils.fit(controller, b.plannedRoute);
  }

  void startRoute() {
    final b = batch;
    if (b == null) return;
    if (b.status == BatchStatus.assigned) {
      b.status = BatchStatus.inProgress;
      tasks.activeBatch.refresh();
    }
    final next = b.nextPendingStop;
    if (next == null) {
      Get.toNamed(AppRoutes.batchDone(b.id));
    } else {
      Get.toNamed(AppRoutes.stop(next.id));
    }
  }
}

class BatchBinding extends Bindings {
  @override
  void dependencies() {
    Get.lazyPut(() => BatchController());
  }
}
