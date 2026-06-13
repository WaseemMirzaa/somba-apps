import 'dart:ui';

import 'package:get/get.dart';

import '../../core/services/session_service.dart';
import '../../core/services/task_service.dart';
import '../../routes/app_routes.dart';

class ProfileController extends GetxController {
  final SessionService session = Get.find<SessionService>();
  final TaskService tasks = Get.find<TaskService>();

  void setLanguage(String code) => session.setLocale(Locale(code));

  void logout() {
    session.logout();
    tasks.reset();
    Get.offAllNamed(AppRoutes.login);
  }
}
