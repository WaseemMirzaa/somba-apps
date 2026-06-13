import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../../core/theme/app_theme.dart';
import '../../core/widgets/common_widgets.dart';
import '../../data/models/batch.dart';
import 'tasks_controller.dart';

class TasksTab extends GetView<TasksController> {
  const TasksTab({super.key});

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const SizedBox(height: 12),
            _Header(controller: controller),
            const SizedBox(height: 12),
            _OnlineCard(controller: controller),
            const SizedBox(height: 12),
            Expanded(
              child: Obx(() {
                if (!controller.session.online.value) {
                  return const _OfflineState();
                }
                final batch = controller.tasks.activeBatch.value;
                final pickups = controller.tasks.pickupTasks;
                if (batch == null && pickups.isEmpty) {
                  return const _EmptyFeed();
                }
                return ListView(
                  padding: const EdgeInsets.only(bottom: 24),
                  children: [
                    if (batch != null) ...[
                      SectionTitle(text: 'tasks_delivery_section'.tr),
                      _BatchCard(
                        batch: batch,
                        onTap: () => controller.openBatch(batch),
                      ),
                      const SizedBox(height: 16),
                    ],
                    if (pickups.isNotEmpty) ...[
                      SectionTitle(text: 'tasks_pickups_section'.tr),
                      for (final task in pickups) ...[
                        TaskTile(
                          task: task,
                          onTap: () => controller.openTask(task),
                        ),
                        const SizedBox(height: 10),
                      ],
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

class _Header extends StatelessWidget {
  final TasksController controller;

  const _Header({required this.controller});

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: Obx(
            () => Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'tasks_greeting'.trParams({
                    'name':
                        controller.session.rider.value?.name.split(' ').first ??
                            '',
                  }),
                  style: const TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.w800,
                    color: AppColors.text,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  'tasks_subtitle'.tr,
                  style: const TextStyle(
                    fontSize: 13,
                    color: AppColors.textMuted,
                  ),
                ),
              ],
            ),
          ),
        ),
        Obx(() {
          final unread = controller.tasks.unreadNotifications;
          // Touch the list so Obx rebuilds when notifications change.
          controller.tasks.notifications.length;
          return Stack(
            children: [
              IconButton.filledTonal(
                style: IconButton.styleFrom(
                  backgroundColor: AppColors.surface,
                  side: const BorderSide(color: AppColors.border),
                ),
                onPressed: controller.openNotifications,
                icon: const Icon(
                  Icons.notifications_outlined,
                  color: AppColors.text,
                ),
              ),
              if (unread > 0)
                Positioned(
                  right: 6,
                  top: 6,
                  child: Container(
                    padding: const EdgeInsets.all(4),
                    decoration: const BoxDecoration(
                      color: AppColors.accent,
                      shape: BoxShape.circle,
                    ),
                    child: Text(
                      '$unread',
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 9,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ),
                ),
            ],
          );
        }),
      ],
    );
  }
}

class _OnlineCard extends StatelessWidget {
  final TasksController controller;

  const _OnlineCard({required this.controller});

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
        child: Obx(() {
          final online = controller.session.online.value;
          return Row(
            children: [
              Container(
                width: 10,
                height: 10,
                decoration: BoxDecoration(
                  color: online ? AppColors.success : AppColors.textMuted,
                  shape: BoxShape.circle,
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  online ? 'tasks_online'.tr : 'tasks_offline'.tr,
                  style: const TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w700,
                    color: AppColors.text,
                  ),
                ),
              ),
              Switch(
                value: online,
                activeTrackColor: AppColors.success,
                onChanged: controller.setOnline,
              ),
            ],
          );
        }),
      ),
    );
  }
}

class _OfflineState extends StatelessWidget {
  const _OfflineState();

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              width: 88,
              height: 88,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: AppColors.textMuted.withValues(alpha: 0.1),
                shape: BoxShape.circle,
              ),
              child: const Icon(
                Icons.power_settings_new,
                size: 42,
                color: AppColors.textMuted,
              ),
            ),
            const SizedBox(height: 20),
            Text(
              'tasks_go_online_title'.tr,
              textAlign: TextAlign.center,
              style: const TextStyle(
                fontSize: 17,
                fontWeight: FontWeight.w800,
                color: AppColors.text,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              'tasks_go_online_body'.tr,
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 13.5, color: AppColors.textMuted),
            ),
          ],
        ),
      ),
    );
  }
}

class _EmptyFeed extends StatelessWidget {
  const _EmptyFeed();

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(
              Icons.task_alt,
              size: 56,
              color: AppColors.success,
            ),
            const SizedBox(height: 16),
            Text(
              'tasks_empty_title'.tr,
              style: const TextStyle(
                fontSize: 17,
                fontWeight: FontWeight.w800,
                color: AppColors.text,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              'tasks_empty_body'.tr,
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 13.5, color: AppColors.textMuted),
            ),
          ],
        ),
      ),
    );
  }
}

class _BatchCard extends StatelessWidget {
  final Batch batch;
  final VoidCallback onTap;

  const _BatchCard({required this.batch, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Card(
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: BorderSide(color: AppColors.accent.withValues(alpha: 0.35)),
      ),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  const LeadingIcon(
                    icon: Icons.local_shipping_outlined,
                    color: AppColors.accent,
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          batch.id,
                          style: const TextStyle(
                            fontSize: 15,
                            fontWeight: FontWeight.w800,
                            color: AppColors.text,
                          ),
                        ),
                        const SizedBox(height: 3),
                        Text(
                          batch.zone,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            fontSize: 12.5,
                            color: AppColors.textMuted,
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 8),
                  AppChip(label: 'type_delivery'.tr, color: AppColors.accent),
                ],
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  const Icon(Icons.flag_outlined,
                      size: 16, color: AppColors.textMuted),
                  const SizedBox(width: 6),
                  Text(
                    'tasks_batch_stops'.trParams({
                      'done': '${batch.resolvedCount}',
                      'total': '${batch.totalStops}',
                    }),
                    style: const TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      color: AppColors.text,
                    ),
                  ),
                  const Spacer(),
                  const Icon(Icons.chevron_right, color: AppColors.textMuted),
                ],
              ),
              const SizedBox(height: 8),
              ClipRRect(
                borderRadius: BorderRadius.circular(6),
                child: LinearProgressIndicator(
                  value: batch.totalStops == 0
                      ? 0
                      : batch.resolvedCount / batch.totalStops,
                  minHeight: 6,
                  backgroundColor: AppColors.background,
                  color: AppColors.accent,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
