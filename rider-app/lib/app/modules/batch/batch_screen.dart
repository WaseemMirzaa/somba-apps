import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';

import '../../core/theme/app_theme.dart';
import '../../core/widgets/common_widgets.dart';
import '../../data/models/batch.dart';
import '../../data/models/rider_task.dart';
import '../../routes/app_routes.dart';
import 'batch_controller.dart';

class BatchScreen extends GetView<BatchController> {
  const BatchScreen({super.key});

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
      appBar: AppBar(
        title: Text(batch.id),
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: 16),
            child: Center(
              child: AppChip(
                label: 'type_delivery'.tr,
                color: AppColors.accent,
              ),
            ),
          ),
        ],
      ),
      body: SafeArea(
        child: Column(
          children: [
            Expanded(
              child: Obx(() {
                controller.tasks.activeBatch.value;
                return ListView(
                  padding: const EdgeInsets.all(16),
                  children: [
                    ClipRRect(
                      borderRadius: BorderRadius.circular(16),
                      child: SizedBox(
                        height: 230,
                        child: GoogleMap(
                          initialCameraPosition: CameraPosition(
                            target: controller.tasks.warehouse.position,
                            zoom: 12,
                          ),
                          onMapCreated: controller.onMapCreated,
                          markers: _markers(batch),
                          polylines: {
                            Polyline(
                              polylineId: const PolylineId('planned'),
                              points: batch.plannedRoute,
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
                        padding: const EdgeInsets.all(14),
                        child: Row(
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
                                    batch.zone,
                                    style: const TextStyle(
                                      fontSize: 14,
                                      fontWeight: FontWeight.w700,
                                      color: AppColors.text,
                                    ),
                                  ),
                                  const SizedBox(height: 3),
                                  Text(
                                    'tasks_batch_stops'.trParams({
                                      'done': '${batch.resolvedCount}',
                                      'total': '${batch.totalStops}',
                                    }),
                                    style: const TextStyle(
                                      fontSize: 12.5,
                                      color: AppColors.textMuted,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(height: 16),
                    SectionTitle(text: 'batch_stops_title'.tr),
                    for (var i = 0; i < batch.orderedStops.length; i++) ...[
                      _StopTile(index: i + 1, stop: batch.orderedStops[i]),
                      const SizedBox(height: 10),
                    ],
                  ],
                );
              }),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 16),
              child: Obx(() {
                controller.tasks.activeBatch.value;
                final allDone = batch.nextPendingStop == null;
                return FilledButton.icon(
                  style: FilledButton.styleFrom(
                    backgroundColor: AppColors.accent,
                  ),
                  onPressed: controller.startRoute,
                  icon: Icon(
                    allDone ? Icons.flag_outlined : Icons.play_arrow,
                  ),
                  label: Text(
                    allDone
                        ? 'batch_view_summary'.tr
                        : batch.status == BatchStatus.inProgress
                            ? 'batch_resume_route'.tr
                            : 'batch_start_route'.tr,
                  ),
                );
              }),
            ),
          ],
        ),
      ),
    );
  }

  Set<Marker> _markers(Batch batch) {
    final markers = <Marker>{
      Marker(
        markerId: const MarkerId('warehouse'),
        position: controller.tasks.warehouse.position,
        icon:
            BitmapDescriptor.defaultMarkerWithHue(BitmapDescriptor.hueOrange),
        infoWindow: InfoWindow(title: controller.tasks.warehouse.name),
      ),
    };
    for (var i = 0; i < batch.orderedStops.length; i++) {
      final s = batch.orderedStops[i];
      markers.add(
        Marker(
          markerId: MarkerId(s.id),
          position: s.position,
          icon: BitmapDescriptor.defaultMarkerWithHue(
            s.status == TaskStatus.completed
                ? BitmapDescriptor.hueGreen
                : BitmapDescriptor.hueRed,
          ),
          infoWindow: InfoWindow(
            title: '${i + 1}. ${s.partyName}',
            snippet: s.commune,
          ),
        ),
      );
    }
    return markers;
  }
}

class _StopTile extends StatelessWidget {
  final int index;
  final RiderTask stop;

  const _StopTile({required this.index, required this.stop});

  @override
  Widget build(BuildContext context) {
    final resolved = !stop.isPending;
    return Card(
      child: InkWell(
        onTap: resolved ? null : () => Get.toNamed(AppRoutes.stop(stop.id)),
        borderRadius: BorderRadius.circular(16),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Row(
            children: [
              Container(
                width: 34,
                height: 34,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: stop.status.color.withValues(alpha: 0.12),
                  shape: BoxShape.circle,
                ),
                child: Text(
                  '$index',
                  style: TextStyle(
                    color: stop.status.color,
                    fontWeight: FontWeight.w800,
                    fontSize: 14,
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      stop.partyName,
                      style: const TextStyle(
                        fontSize: 14.5,
                        fontWeight: FontWeight.w700,
                        color: AppColors.text,
                      ),
                    ),
                    const SizedBox(height: 3),
                    Text(
                      '${stop.commune} · ${stop.addressText}',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontSize: 12,
                        color: AppColors.textMuted,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              StatusChip(status: stop.status),
            ],
          ),
        ),
      ),
    );
  }
}
