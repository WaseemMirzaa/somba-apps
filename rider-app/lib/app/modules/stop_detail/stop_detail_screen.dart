import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';

import '../../core/theme/app_theme.dart';
import '../../core/widgets/common_widgets.dart';
import '../../data/models/rider_task.dart';
import 'stop_detail_controller.dart';

class StopDetailScreen extends GetView<StopDetailController> {
  const StopDetailScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final stop = controller.stop;
    if (stop == null) {
      return Scaffold(
        appBar: AppBar(),
        body: Center(child: Text('common_not_found'.tr)),
      );
    }
    return Scaffold(
      appBar: AppBar(
        title: Text(stop.id),
        actions: const [
          Padding(
            padding: EdgeInsets.only(right: 16),
            child: Center(child: TypeChip(type: TaskType.delivery)),
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
                      height: 220,
                      child: GoogleMap(
                        initialCameraPosition: CameraPosition(
                          target: stop.position,
                          zoom: 13,
                        ),
                        onMapCreated: controller.onMapCreated,
                        markers: {
                          Marker(
                            markerId: const MarkerId('warehouse'),
                            position: controller.tasks.warehouse.position,
                            icon: BitmapDescriptor.defaultMarkerWithHue(
                              BitmapDescriptor.hueOrange,
                            ),
                            infoWindow: InfoWindow(
                              title: controller.tasks.warehouse.name,
                            ),
                          ),
                          Marker(
                            markerId: MarkerId(stop.id),
                            position: stop.position,
                            icon: BitmapDescriptor.defaultMarkerWithHue(
                              BitmapDescriptor.hueRed,
                            ),
                            infoWindow: InfoWindow(title: stop.partyName),
                          ),
                        },
                        polylines: {
                          Polyline(
                            polylineId: const PolylineId('segment'),
                            points: controller.routePoints,
                            color: AppColors.accent,
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
                                  'stop_customer'.tr,
                                  style: const TextStyle(
                                    fontSize: 13,
                                    fontWeight: FontWeight.w700,
                                    color: AppColors.textMuted,
                                  ),
                                ),
                              ),
                              Obx(() {
                                controller.tasks.activeBatch.value;
                                return StatusChip(status: stop.status);
                              }),
                            ],
                          ),
                          const SizedBox(height: 8),
                          Text(
                            stop.partyName,
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
                            value: '${stop.addressText}, ${stop.commune}',
                          ),
                          InfoRow(
                            icon: Icons.route_outlined,
                            label: 'task_distance'.tr,
                            value: 'tasks_km'.trParams({
                              'km': stop.distanceKm.toStringAsFixed(1),
                            }),
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),
                  SectionTitle(text: 'stop_parcel'.tr),
                  for (final parcel in stop.parcels) ...[
                    Card(
                      child: ListTile(
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(16),
                        ),
                        leading: const LeadingIcon(
                          icon: Icons.inventory_2_outlined,
                          color: AppColors.accent,
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
              child: Column(
                children: [
                  FilledButton.icon(
                    style: FilledButton.styleFrom(
                      backgroundColor: AppColors.accent,
                    ),
                    onPressed: controller.arrived,
                    icon: const Icon(Icons.location_on_outlined),
                    label: Text('stop_arrived'.tr),
                  ),
                  TextButton(
                    style: TextButton.styleFrom(
                      foregroundColor: AppColors.danger,
                    ),
                    onPressed: controller.deliveryFailed,
                    child: Text('stop_failed_link'.tr),
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
