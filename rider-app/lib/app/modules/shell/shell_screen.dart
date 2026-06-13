import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../history/history_tab.dart';
import '../map_tab/map_tab.dart';
import '../profile/profile_tab.dart';
import '../tasks/tasks_tab.dart';
import 'shell_controller.dart';

class ShellScreen extends GetView<ShellController> {
  const ShellScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Obx(
      () => Scaffold(
        body: IndexedStack(
          index: controller.tabIndex.value,
          children: const [
            TasksTab(),
            MapTab(),
            HistoryTab(),
            ProfileTab(),
          ],
        ),
        bottomNavigationBar: NavigationBar(
          selectedIndex: controller.tabIndex.value,
          onDestinationSelected: controller.changeTab,
          destinations: [
            NavigationDestination(
              icon: const Icon(Icons.assignment_outlined),
              selectedIcon: const Icon(Icons.assignment),
              label: 'tab_tasks'.tr,
            ),
            NavigationDestination(
              icon: const Icon(Icons.map_outlined),
              selectedIcon: const Icon(Icons.map),
              label: 'tab_map'.tr,
            ),
            NavigationDestination(
              icon: const Icon(Icons.history_outlined),
              selectedIcon: const Icon(Icons.history),
              label: 'tab_history'.tr,
            ),
            NavigationDestination(
              icon: const Icon(Icons.person_outline),
              selectedIcon: const Icon(Icons.person),
              label: 'tab_profile'.tr,
            ),
          ],
        ),
      ),
    );
  }
}
