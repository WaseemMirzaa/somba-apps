import 'package:get/get.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';

import '../../core/services/task_service.dart';
import '../../core/utils/map_utils.dart';
import '../../data/models/rider_task.dart';
import '../../routes/app_routes.dart';

class TaskDetailController extends GetxController {
  final TaskService tasks = Get.find<TaskService>();

  RiderTask? task;
  GoogleMapController? mapController;

  @override
  void onInit() {
    super.onInit();
    final id = Get.parameters['id'] ?? '';
    task = tasks.taskById(id);
  }

  List<LatLng> get routePoints {
    final t = task;
    if (t == null) return const [];
    return [tasks.riderPosition, t.position];
  }

  void onMapCreated(GoogleMapController controller) {
    mapController = controller;
    MapUtils.fit(controller, routePoints);
  }

  /// "Navigate": just refocuses the camera on the route in this prototype.
  void navigate() => MapUtils.fit(mapController, routePoints);

  void arrived() {
    final t = task;
    if (t == null) return;
    if (t.status == TaskStatus.assigned) {
      t.status = TaskStatus.inProgress;
      tasks.refreshTasks();
    }
    Get.toNamed(AppRoutes.taskProof(t.id));
  }
}

class TaskDetailBinding extends Bindings {
  @override
  void dependencies() {
    Get.lazyPut(() => TaskDetailController());
  }
}
