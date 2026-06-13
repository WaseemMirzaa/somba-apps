import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../../core/theme/app_theme.dart';
import '../../core/widgets/common_widgets.dart';
import '../../data/models/app_notification.dart';
import 'notifications_controller.dart';

class NotificationsScreen extends GetView<NotificationsController> {
  const NotificationsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text('notif_title'.tr)),
      body: SafeArea(
        child: Obx(() {
          final items = controller.tasks.notifications;
          if (items.isEmpty) {
            return Center(
              child: Text(
                'notif_empty'.tr,
                style: const TextStyle(color: AppColors.textMuted),
              ),
            );
          }
          return ListView.separated(
            padding: const EdgeInsets.all(16),
            itemCount: items.length,
            separatorBuilder: (_, _) => const SizedBox(height: 10),
            itemBuilder: (context, index) {
              final n = items[index];
              return Card(
                child: Padding(
                  padding: const EdgeInsets.all(14),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      LeadingIcon(icon: _icon(n.type), color: _color(n.type)),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                Expanded(
                                  child: Text(
                                    n.titleKey.tr,
                                    style: const TextStyle(
                                      fontSize: 14.5,
                                      fontWeight: FontWeight.w700,
                                      color: AppColors.text,
                                    ),
                                  ),
                                ),
                                Text(
                                  controller.relativeTime(n),
                                  style: const TextStyle(
                                    fontSize: 11.5,
                                    color: AppColors.textMuted,
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: 4),
                            Text(
                              n.bodyKey.trParams(n.params),
                              style: const TextStyle(
                                fontSize: 13,
                                color: AppColors.textMuted,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              );
            },
          );
        }),
      ),
    );
  }

  IconData _icon(NotificationType type) {
    switch (type) {
      case NotificationType.taskAssigned:
        return Icons.assignment_turned_in_outlined;
      case NotificationType.batchReady:
        return Icons.local_shipping_outlined;
      case NotificationType.announcement:
        return Icons.campaign_outlined;
    }
  }

  Color _color(NotificationType type) {
    switch (type) {
      case NotificationType.taskAssigned:
        return AppColors.primary;
      case NotificationType.batchReady:
        return AppColors.accent;
      case NotificationType.announcement:
        return AppColors.warning;
    }
  }
}
