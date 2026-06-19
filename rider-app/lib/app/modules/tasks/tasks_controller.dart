import 'package:get/get.dart';

import '../../core/services/session_service.dart';
import '../../core/services/task_service.dart';
import '../../data/models/batch.dart';
import '../../data/models/rider_task.dart';
import '../../routes/app_routes.dart';

class TasksController extends GetxController {
  final SessionService session = Get.find<SessionService>();
  final TaskService tasks = Get.find<TaskService>();

  void setOnline(bool value) => session.setOnline(value);

  void openNotifications() => Get.toNamed(AppRoutes.notifications);

  void openTask(RiderTask task) => Get.toNamed(AppRoutes.task(task.id));

  void openBatch(Batch batch) => Get.toNamed(AppRoutes.batch(batch.id));
}
