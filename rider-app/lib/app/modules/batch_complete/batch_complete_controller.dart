import 'package:get/get.dart';

import '../../core/services/task_service.dart';
import '../../data/models/batch.dart';
import '../../routes/app_routes.dart';

class BatchCompleteController extends GetxController {
  final TaskService tasks = Get.find<TaskService>();

  Batch? batch;

  @override
  void onInit() {
    super.onInit();
    final id = Get.parameters['id'] ?? '';
    final active = tasks.activeBatch.value;
    batch = (active != null && active.id == id) ? active : null;
  }

  void backToTasks() {
    tasks.archiveBatch();
    Get.offAllNamed(AppRoutes.shell);
  }
}

class BatchCompleteBinding extends Bindings {
  @override
  void dependencies() {
    Get.lazyPut(() => BatchCompleteController());
  }
}
