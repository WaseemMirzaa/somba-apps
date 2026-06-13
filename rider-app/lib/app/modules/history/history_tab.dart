import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../../core/theme/app_theme.dart';
import '../../core/widgets/common_widgets.dart';
import 'history_controller.dart';

class HistoryTab extends GetView<HistoryController> {
  const HistoryTab({super.key});

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const SizedBox(height: 16),
            Text(
              'history_title'.tr,
              style: const TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.w800,
                color: AppColors.text,
              ),
            ),
            const SizedBox(height: 12),
            Expanded(
              child: Obx(() {
                // Track the list so groups recompute on changes.
                controller.tasks.history.length;
                final groups = controller.groups;
                if (groups.isEmpty) {
                  return Center(
                    child: Text(
                      'history_empty'.tr,
                      style: const TextStyle(color: AppColors.textMuted),
                    ),
                  );
                }
                return ListView(
                  padding: const EdgeInsets.only(bottom: 24),
                  children: [
                    for (final group in groups) ...[
                      SectionTitle(text: group.label),
                      for (final task in group.items) ...[
                        TaskTile(
                          task: task,
                          trailingText: controller.timeOf(task),
                        ),
                        const SizedBox(height: 10),
                      ],
                      const SizedBox(height: 8),
                    ],
                  ],
                );
              }),
            ),
          ],
        ),
      ),
    );
  }
}
