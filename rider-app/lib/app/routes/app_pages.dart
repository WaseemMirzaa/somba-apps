import 'package:get/get.dart';

import '../modules/batch/batch_controller.dart';
import '../modules/batch/batch_screen.dart';
import '../modules/batch_complete/batch_complete_controller.dart';
import '../modules/batch_complete/batch_complete_screen.dart';
import '../modules/fail_delivery/fail_delivery_controller.dart';
import '../modules/fail_delivery/fail_delivery_screen.dart';
import '../modules/first_password/first_password_controller.dart';
import '../modules/first_password/first_password_screen.dart';
import '../modules/kyc/kyc_controller.dart';
import '../modules/kyc/kyc_screen.dart';
import '../modules/login/login_controller.dart';
import '../modules/login/login_screen.dart';
import '../modules/notifications/notifications_controller.dart';
import '../modules/notifications/notifications_screen.dart';
import '../modules/pickup_proof/pickup_proof_controller.dart';
import '../modules/pickup_proof/pickup_proof_screen.dart';
import '../modules/pod/pod_controller.dart';
import '../modules/pod/pod_screen.dart';
import '../modules/shell/shell_controller.dart';
import '../modules/shell/shell_screen.dart';
import '../modules/splash/splash_controller.dart';
import '../modules/splash/splash_screen.dart';
import '../modules/stop_detail/stop_detail_controller.dart';
import '../modules/stop_detail/stop_detail_screen.dart';
import '../modules/task_detail/task_detail_controller.dart';
import '../modules/task_detail/task_detail_screen.dart';
import '../modules/warehouse/warehouse_controller.dart';
import '../modules/warehouse/warehouse_screen.dart';
import 'app_routes.dart';

class AppPages {
  AppPages._();

  static final pages = <GetPage<dynamic>>[
    GetPage(
      name: AppRoutes.splash,
      page: () => const SplashScreen(),
      binding: SplashBinding(),
    ),
    GetPage(
      name: AppRoutes.login,
      page: () => const LoginScreen(),
      binding: LoginBinding(),
    ),
    GetPage(
      name: AppRoutes.firstPassword,
      page: () => const FirstPasswordScreen(),
      binding: FirstPasswordBinding(),
    ),
    GetPage(
      name: AppRoutes.kyc,
      page: () => const KycScreen(),
      binding: KycBinding(),
    ),
    GetPage(
      name: AppRoutes.shell,
      page: () => const ShellScreen(),
      binding: ShellBinding(),
    ),
    GetPage(
      name: AppRoutes.taskDetail,
      page: () => const TaskDetailScreen(),
      binding: TaskDetailBinding(),
    ),
    GetPage(
      name: AppRoutes.pickupProof,
      page: () => const PickupProofScreen(),
      binding: PickupProofBinding(),
    ),
    GetPage(
      name: AppRoutes.warehouseCheckIn,
      page: () => const WarehouseScreen(),
      binding: WarehouseBinding(),
    ),
    GetPage(
      name: AppRoutes.batchOverview,
      page: () => const BatchScreen(),
      binding: BatchBinding(),
    ),
    GetPage(
      name: AppRoutes.batchComplete,
      page: () => const BatchCompleteScreen(),
      binding: BatchCompleteBinding(),
    ),
    GetPage(
      name: AppRoutes.stopDetail,
      page: () => const StopDetailScreen(),
      binding: StopDetailBinding(),
    ),
    GetPage(
      name: AppRoutes.pod,
      page: () => const PodScreen(),
      binding: PodBinding(),
    ),
    GetPage(
      name: AppRoutes.failedDelivery,
      page: () => const FailDeliveryScreen(),
      binding: FailDeliveryBinding(),
    ),
    GetPage(
      name: AppRoutes.notifications,
      page: () => const NotificationsScreen(),
      binding: NotificationsBinding(),
    ),
  ];
}
