import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';

import '../../core/theme/app_theme.dart';
import '../../core/widgets/common_widgets.dart';
import 'map_tab_controller.dart';

class MapTab extends GetView<MapTabController> {
  const MapTab({super.key});

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: [
        Positioned.fill(
          child: Obx(
            () => GoogleMap(
              initialCameraPosition: CameraPosition(
                target: controller.tasks.riderPosition,
                zoom: 12,
              ),
              onMapCreated: controller.onMapCreated,
              markers: controller.buildMarkers(),
              polylines: controller.buildPolylines(),
              myLocationButtonEnabled: false,
              zoomControlsEnabled: false,
            ),
          ),
        ),
        Positioned(
          left: 16,
          right: 16,
          bottom: 16,
          child: SafeArea(
            child: Obx(() {
              // Touch observables so this card refreshes with the feed.
              controller.tasks.pickupTasks.length;
              controller.tasks.activeBatch.value;
              final active = controller.activeTask;
              if (active == null) {
                return Card(
                  child: Padding(
                    padding: const EdgeInsets.all(14),
                    child: Row(
                      children: [
                        const Icon(Icons.explore_outlined,
                            color: AppColors.textMuted),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Text(
                            'map_no_active'.tr,
                            style: const TextStyle(
                              fontSize: 13.5,
                              color: AppColors.textMuted,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                );
              }
              return Card(
                child: InkWell(
                  onTap: controller.openActive,
                  borderRadius: BorderRadius.circular(16),
                  child: Padding(
                    padding: const EdgeInsets.all(14),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'map_active_task'.tr,
                          style: const TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w700,
                            color: AppColors.textMuted,
                            letterSpacing: 0.4,
                          ),
                        ),
                        const SizedBox(height: 8),
                        Row(
                          children: [
                            LeadingIcon(
                              icon: active.type.icon,
                              color: active.type.color,
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    active.partyName,
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: const TextStyle(
                                      fontSize: 15,
                                      fontWeight: FontWeight.w700,
                                      color: AppColors.text,
                                    ),
                                  ),
                                  const SizedBox(height: 3),
                                  Text(
                                    '${active.commune} · '
                                    '${'tasks_km'.trParams({
                                          'km': active.distanceKm
                                              .toStringAsFixed(1),
                                        })}',
                                    style: const TextStyle(
                                      fontSize: 12.5,
                                      color: AppColors.textMuted,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                            const SizedBox(width: 8),
                            StatusChip(status: active.status),
                          ],
                        ),
                      ],
                    ),
                  ),
                ),
              );
            }),
          ),
        ),
      ],
    );
  }
}
