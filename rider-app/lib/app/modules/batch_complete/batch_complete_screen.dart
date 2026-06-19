import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../../core/theme/app_theme.dart';
import '../../core/widgets/common_widgets.dart';
import 'batch_complete_controller.dart';

class BatchCompleteScreen extends GetView<BatchCompleteController> {
  const BatchCompleteScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final batch = controller.batch;
    if (batch == null) {
      return Scaffold(
        appBar: AppBar(),
        body: Center(child: Text('common_not_found'.tr)),
      );
    }
    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const SizedBox(height: 24),
              Container(
                width: 92,
                height: 92,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: AppColors.success.withValues(alpha: 0.12),
                  shape: BoxShape.circle,
                ),
                child: const Icon(
                  Icons.celebration_outlined,
                  color: AppColors.success,
                  size: 46,
                ),
              ),
              const SizedBox(height: 20),
              Text(
                'batch_complete_title'.tr,
                textAlign: TextAlign.center,
                style: const TextStyle(
                  fontSize: 22,
                  fontWeight: FontWeight.w800,
                  color: AppColors.text,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                'batch_complete_body'.trParams({'id': batch.id}),
                textAlign: TextAlign.center,
                style:
                    const TextStyle(fontSize: 14, color: AppColors.textMuted),
              ),
              const SizedBox(height: 28),
              Row(
                children: [
                  Expanded(
                    child: _StatCard(
                      color: AppColors.success,
                      icon: Icons.check_circle_outline,
                      value: '${batch.completedCount}',
                      label: 'batch_delivered'.tr,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: _StatCard(
                      color: AppColors.danger,
                      icon: Icons.cancel_outlined,
                      value: '${batch.failedCount}',
                      label: 'batch_failed_count'.tr,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 20),
              Expanded(
                child: ListView(
                  children: [
                    for (var i = 0; i < batch.orderedStops.length; i++) ...[
                      Card(
                        child: ListTile(
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(16),
                          ),
                          leading: Icon(
                            batch.orderedStops[i].status.color ==
                                    AppColors.success
                                ? Icons.check_circle
                                : Icons.cancel,
                            color: batch.orderedStops[i].status.color,
                          ),
                          title: Text(
                            '${i + 1}. ${batch.orderedStops[i].partyName}',
                            style: const TextStyle(
                              fontSize: 14,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                          trailing:
                              StatusChip(status: batch.orderedStops[i].status),
                        ),
                      ),
                      const SizedBox(height: 8),
                    ],
                  ],
                ),
              ),
              FilledButton.icon(
                onPressed: controller.backToTasks,
                icon: const Icon(Icons.home_outlined),
                label: Text('batch_back_home'.tr),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _StatCard extends StatelessWidget {
  final Color color;
  final IconData icon;
  final String value;
  final String label;

  const _StatCard({
    required this.color,
    required this.icon,
    required this.value,
    required this.label,
  });

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            Icon(icon, color: color, size: 26),
            const SizedBox(height: 8),
            Text(
              value,
              style: TextStyle(
                fontSize: 22,
                fontWeight: FontWeight.w800,
                color: color,
              ),
            ),
            const SizedBox(height: 2),
            Text(
              label,
              style:
                  const TextStyle(fontSize: 12, color: AppColors.textMuted),
            ),
          ],
        ),
      ),
    );
  }
}
