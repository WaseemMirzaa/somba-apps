import 'package:get/get.dart';

import '../../core/services/session_service.dart';
import '../../routes/app_routes.dart';

class SplashController extends GetxController {
  final SessionService session = Get.find<SessionService>();

  @override
  void onReady() {
    super.onReady();
    Future.delayed(const Duration(milliseconds: 1500), () {
      Get.offAllNamed(session.isLoggedIn ? AppRoutes.shell : AppRoutes.login);
    });
  }
}

class SplashBinding extends Bindings {
  @override
  void dependencies() {
    Get.lazyPut(() => SplashController());
  }
}
