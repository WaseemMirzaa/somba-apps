import 'package:get/get.dart';

import '../history/history_controller.dart';
import '../map_tab/map_tab_controller.dart';
import '../profile/profile_controller.dart';
import '../tasks/tasks_controller.dart';

class ShellController extends GetxController {
  final RxInt tabIndex = 0.obs;

  void changeTab(int index) => tabIndex.value = index;
}

class ShellBinding extends Bindings {
  @override
  void dependencies() {
    Get.lazyPut(() => ShellController());
    Get.lazyPut(() => TasksController());
    Get.lazyPut(() => MapTabController());
    Get.lazyPut(() => HistoryController());
    Get.lazyPut(() => ProfileController());
  }
}
