import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';

import '../../core/theme/app_theme.dart';
import '../../core/widgets/common_widgets.dart';
import 'warehouse_controller.dart';

class WarehouseScreen extends GetView<WarehouseController> {
  const WarehouseScreen({super.key});

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
      appBar: AppBar(title: Text('wh_title'.tr)),
      body: SafeArea(
        child: Column(
          children: [
            Expanded(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(16),
                  child: GoogleMap(
                    initialCameraPosition: CameraPosition(
                      target: controller.tasks.warehouse.position,
                      zoom: 13,
                    ),
                    onMapCreated: controller.onMapCreated,
                    markers: {
                      Marker(
                        markerId: MarkerId(task.id),
                        position: task.position,
                        icon: BitmapDescriptor.defaultMarkerWithHue(
                          BitmapDescriptor.hueAzure,
                        ),
                        infoWindow: InfoWindow(title: task.partyName),
                      ),
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
                    },
                    polylines: {
                      Polyline(
                        polylineId: const PolylineId('to_warehouse'),
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
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
              child: Card(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          const LeadingIcon(
                            icon: Icons.warehouse_outlined,
                            color: AppColors.warning,
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  controller.tasks.warehouse.name,
                                  style: const TextStyle(
                                    fontSize: 15,
                                    fontWeight: FontWeight.w800,
                                    color: AppColors.text,
                                  ),
                                ),
                                const SizedBox(height: 3),
                                Text(
                                  'wh_route_info'.trParams({
                                    'count': '${task.parcels.length}',
                                  }),
                                  style: const TextStyle(
                                    fontSize: 12.5,
                                    color: AppColors.textMuted,
                                  ),
                                ),
                              ],
                            ),
                          ),
                          StatusChip(status: task.status),
                        ],
                      ),
                      const SizedBox(height: 16),
                      FilledButton.icon(
                        onPressed: controller.checkIn,
                        icon: const Icon(Icons.warehouse_outlined),
                        label: Text('wh_checkin'.tr),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
