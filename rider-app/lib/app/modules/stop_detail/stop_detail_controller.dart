import 'package:get/get.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';

import '../../core/services/task_service.dart';
import '../../core/utils/map_utils.dart';
import '../../data/models/rider_task.dart';
import '../../routes/app_routes.dart';

class StopDetailController extends GetxController {
  final TaskService tasks = Get.find<TaskService>();

  RiderTask? stop;
  GoogleMapController? mapController;

  @override
  void onInit() {
    super.onInit();
    stop = tasks.taskById(Get.parameters['id'] ?? '');
  }

  List<LatLng> get routePoints {
    final s = stop;
    if (s == null) return const [];
    return [tasks.warehouse.position, s.position];
  }

  void onMapCreated(GoogleMapController controller) {
    mapController = controller;
    MapUtils.fit(controller, routePoints);
  }

  void arrived() {
    final s = stop;
    if (s == null) return;
    if (s.status == TaskStatus.assigned) {
      s.status = TaskStatus.inProgress;
      tasks.activeBatch.refresh();
    }
    Get.toNamed(AppRoutes.stopPod(s.id));
  }

  void deliveryFailed() {
    final s = stop;
    if (s == null) return;
    Get.toNamed(AppRoutes.stopFail(s.id));
  }
}

class StopDetailBinding extends Bindings {
  @override
  void dependencies() {
    Get.lazyPut(() => StopDetailController());
  }
}
