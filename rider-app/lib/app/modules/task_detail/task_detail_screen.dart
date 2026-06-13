import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';

import '../../core/theme/app_theme.dart';
import '../../core/widgets/common_widgets.dart';
import '../../data/models/rider_task.dart';
import 'task_detail_controller.dart';

class TaskDetailScreen extends GetView<TaskDetailController> {
  const TaskDetailScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final task = controller.task;
    if (task == null) {
      return Scaffold(
        appBar: AppBar(),
        body: Center(child: Text('common_not_found'.tr)),
      );
    }
    return Scaffold(
      appBar: AppBar(
        title: Text(task.id),
        actions: const [
          Padding(
            padding: EdgeInsets.only(right: 16),
            child: Center(child: TypeChip(type: TaskType.pickup)),
          ),
        ],
      ),
      body: SafeArea(
        child: Column(
          children: [
            Expanded(
              child: ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  ClipRRect(
                    borderRadius: BorderRadius.circular(16),
                    child: SizedBox(
                      height: 240,
                      child: GoogleMap(
                        initialCameraPosition: CameraPosition(
                          target: task.position,
                          zoom: 13,
                        ),
                        onMapCreated: controller.onMapCreated,
                        markers: {
                          Marker(
                            markerId: const MarkerId('rider'),
                            position: controller.tasks.riderPosition,
                            icon: BitmapDescriptor.defaultMarkerWithHue(
                              BitmapDescriptor.hueViolet,
                            ),
                            infoWindow: InfoWindow(title: 'map_you'.tr),
                          ),
                          Marker(
                            markerId: MarkerId(task.id),
                            position: task.position,
                            icon: BitmapDescriptor.defaultMarkerWithHue(
                              BitmapDescriptor.hueAzure,
                            ),
                            infoWindow: InfoWindow(title: task.partyName),
                          ),
                        },
                        polylines: {
                          Polyline(
                            polylineId: const PolylineId('route'),
                            points: controller.routePoints,
                            color: AppColors.primary,
                            width: 4,
                          ),
                        },
                        myLocationButtonEnabled: false,
                        zoomControlsEnabled: false,
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Expanded(
                                child: Text(
                                  'task_seller'.tr,
                                  style: const TextStyle(
                                    fontSize: 13,
                                    fontWeight: FontWeight.w700,
                                    color: AppColors.textMuted,
                                  ),
                                ),
                              ),
                              Obx(() {
                                controller.tasks.pickupTasks.length;
                                return StatusChip(status: task.status);
                              }),
                            ],
                          ),
                          const SizedBox(height: 8),
                          Text(
                            task.partyName,
                            style: const TextStyle(
                              fontSize: 17,
                              fontWeight: FontWeight.w800,
                              color: AppColors.text,
                            ),
                          ),
                          const SizedBox(height: 12),
                          InfoRow(
                            icon: Icons.place_outlined,
                            label: 'task_address'.tr,
                            value: '${task.addressText}, ${task.commune}',
                          ),
                          InfoRow(
                            icon: Icons.route_outlined,
                            label: 'task_distance'.tr,
                            value: 'tasks_km'.trParams({
                              'km': task.distanceKm.toStringAsFixed(1),
                            }),
                          ),
                          InfoRow(
                            icon: Icons.inventory_2_outlined,
                            label: 'task_parcels'.tr,
                            value: '${task.parcels.length}',
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),
                  SectionTitle(text: 'task_parcels'.tr),
                  for (final parcel in task.parcels) ...[
                    Card(
                      child: ListTile(
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(16),
                        ),
                        leading: const LeadingIcon(
                          icon: Icons.qr_code_2,
                          color: AppColors.primary,
                        ),
                        title: Text(
                          parcel.description,
                          style: const TextStyle(
                            fontWeight: FontWeight.w700,
                            fontSize: 14,
                          ),
                        ),
                        subtitle: Text(
                          '${parcel.barcode} · ${parcel.orderId}',
                          style: const TextStyle(
                            fontSize: 12,
                            color: AppColors.textMuted,
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(height: 10),
                  ],
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 16),
              child: Row(
                children: [
                  Expanded(
                    child: OutlinedButton.icon(
                      style: OutlinedButton.styleFrom(
                        minimumSize: const Size.fromHeight(52),
                      ),
                      onPressed: controller.navigate,
                      icon: const Icon(Icons.navigation_outlined),
                      label: Text('task_navigate'.tr),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    flex: 2,
                    child: FilledButton.icon(
                      onPressed: controller.arrived,
                      icon: const Icon(Icons.storefront_outlined),
                      label: Text('task_arrived'.tr),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
