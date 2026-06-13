import 'package:get/get.dart';

import '../../core/services/task_service.dart';
import '../../data/models/app_notification.dart';

class NotificationsController extends GetxController {
  final TaskService tasks = Get.find<TaskService>();

  @override
  void onReady() {
    super.onReady();
    tasks.markNotificationsRead();
  }

  String relativeTime(AppNotification n) {
    final diff = DateTime.now().difference(n.time);
    if (diff.inMinutes < 60) {
      return 'time_min_ago'.trParams({'m': '${diff.inMinutes}'});
    }
    if (diff.inHours < 24) {
      return 'time_hours_ago'.trParams({'h': '${diff.inHours}'});
    }
    return 'time_days_ago'.trParams({'d': '${diff.inDays}'});
  }
}

class NotificationsBinding extends Bindings {
  @override
  void dependencies() {
    Get.lazyPut(() => NotificationsController());
  }
}
