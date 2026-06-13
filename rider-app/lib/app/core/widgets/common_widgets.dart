import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../../data/models/rider_task.dart';
import '../theme/app_theme.dart';

extension TaskStatusX on TaskStatus {
  Color get color {
    switch (this) {
      case TaskStatus.assigned:
        return AppColors.primary;
      case TaskStatus.inProgress:
        return AppColors.warning;
      case TaskStatus.toWarehouse:
        return AppColors.warning;
      case TaskStatus.completed:
        return AppColors.success;
      case TaskStatus.failed:
        return AppColors.danger;
    }
  }

  String get labelKey {
    switch (this) {
      case TaskStatus.assigned:
        return 'status_assigned';
      case TaskStatus.inProgress:
        return 'status_in_progress';
      case TaskStatus.toWarehouse:
        return 'status_to_warehouse';
      case TaskStatus.completed:
        return 'status_completed';
      case TaskStatus.failed:
        return 'status_failed';
    }
  }
}

extension TaskTypeX on TaskType {
  Color get color =>
      this == TaskType.pickup ? AppColors.primary : AppColors.accent;

  String get labelKey =>
      this == TaskType.pickup ? 'type_pickup' : 'type_delivery';

  IconData get icon =>
      this == TaskType.pickup ? Icons.storefront_outlined : Icons.inventory_2_outlined;
}

/// Small rounded pill used for statuses and task types.
class AppChip extends StatelessWidget {
  final String label;
  final Color color;

  const AppChip({super.key, required this.label, required this.color});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Text(
        label,
        style: TextStyle(
          color: color,
          fontSize: 12,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}

class StatusChip extends StatelessWidget {
  final TaskStatus status;

  const StatusChip({super.key, required this.status});

  @override
  Widget build(BuildContext context) {
    return AppChip(label: status.labelKey.tr, color: status.color);
  }
}

class TypeChip extends StatelessWidget {
  final TaskType type;

  const TypeChip({super.key, required this.type});

  @override
  Widget build(BuildContext context) {
    return AppChip(label: type.labelKey.tr, color: type.color);
  }
}

/// Circular tinted icon used as a tile leading.
class LeadingIcon extends StatelessWidget {
  final IconData icon;
  final Color color;

  const LeadingIcon({super.key, required this.icon, required this.color});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 44,
      height: 44,
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Icon(icon, color: color, size: 22),
    );
  }
}

class SectionTitle extends StatelessWidget {
  final String text;

  const SectionTitle({super.key, required this.text});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10, top: 4),
      child: Text(
        text,
        style: const TextStyle(
          fontSize: 14,
          fontWeight: FontWeight.w700,
          color: AppColors.textMuted,
          letterSpacing: 0.4,
        ),
      ),
    );
  }
}

/// Icon + label + value row used in detail screens.
class InfoRow extends StatelessWidget {
  final IconData icon;
  final String label;
  final String value;

  const InfoRow({
    super.key,
    required this.icon,
    required this.label,
    required this.value,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 18, color: AppColors.textMuted),
          const SizedBox(width: 10),
          SizedBox(
            width: 110,
            child: Text(
              label,
              style: const TextStyle(fontSize: 13, color: AppColors.textMuted),
            ),
          ),
          Expanded(
            child: Text(
              value,
              style: const TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w600,
                color: AppColors.text,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Card tile for a pickup or delivery task in lists.
class TaskTile extends StatelessWidget {
  final RiderTask task;
  final VoidCallback? onTap;
  final String? trailingText;

  const TaskTile({
    super.key,
    required this.task,
    this.onTap,
    this.trailingText,
  });

  @override
  Widget build(BuildContext context) {
    return Card(
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Row(
            children: [
              LeadingIcon(icon: task.type.icon, color: task.type.color),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            task.partyName,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              fontSize: 15,
                              fontWeight: FontWeight.w700,
                              color: AppColors.text,
                            ),
                          ),
                        ),
                        const SizedBox(width: 8),
                        TypeChip(type: task.type),
                      ],
                    ),
                    const SizedBox(height: 6),
                    Text(
                      '${task.commune} · '
                      '${'tasks_km'.trParams({'km': task.distanceKm.toStringAsFixed(1)})} · '
                      '${'tasks_parcels'.trParams({'count': '${task.parcels.length}'})}',
                      style: const TextStyle(
                        fontSize: 12.5,
                        color: AppColors.textMuted,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        StatusChip(status: task.status),
                        const Spacer(),
                        if (trailingText != null)
                          Text(
                            trailingText!,
                            style: const TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w600,
                              color: AppColors.textMuted,
                            ),
                          )
                        else
                          const Icon(
                            Icons.chevron_right,
                            color: AppColors.textMuted,
                          ),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
