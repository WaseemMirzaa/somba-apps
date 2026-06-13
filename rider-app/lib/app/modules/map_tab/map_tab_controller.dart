import 'package:get/get.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';

import '../../core/services/session_service.dart';
import '../../core/services/task_service.dart';
import '../../core/theme/app_theme.dart';
import '../../data/models/batch.dart';
import '../../data/models/rider_task.dart';
import '../../routes/app_routes.dart';

class MapTabController extends GetxController {
  final SessionService session = Get.find<SessionService>();
  final TaskService tasks = Get.find<TaskService>();

  GoogleMapController? mapController;

  void onMapCreated(GoogleMapController controller) {
    mapController = controller;
  }

  /// First task that is actively in progress, otherwise the first assignment.
  RiderTask? get activeTask {
    final all = <RiderTask>[
      ...tasks.pickupTasks,
      ...?tasks.activeBatch.value?.orderedStops,
    ];
    for (final t in all) {
      if (t.status == TaskStatus.inProgress ||
          t.status == TaskStatus.toWarehouse) {
        return t;
      }
    }
    for (final t in all) {
      if (t.status == TaskStatus.assigned) return t;
    }
    return null;
  }

  Set<Marker> buildMarkers() {
    final markers = <Marker>{
      Marker(
        markerId: const MarkerId('rider'),
        position: tasks.riderPosition,
        icon:
            BitmapDescriptor.defaultMarkerWithHue(BitmapDescriptor.hueViolet),
        infoWindow: InfoWindow(title: 'map_you'.tr),
      ),
      Marker(
        markerId: const MarkerId('warehouse'),
        position: tasks.warehouse.position,
        icon:
            BitmapDescriptor.defaultMarkerWithHue(BitmapDescriptor.hueOrange),
        infoWindow: InfoWindow(title: tasks.warehouse.name),
      ),
    };
    for (final t in tasks.pickupTasks) {
      markers.add(
        Marker(
          markerId: MarkerId(t.id),
          position: t.position,
          icon: BitmapDescriptor.defaultMarkerWithHue(
            BitmapDescriptor.hueAzure,
          ),
          infoWindow: InfoWindow(title: t.partyName, snippet: t.commune),
        ),
      );
    }
    final batch = tasks.activeBatch.value;
    if (batch != null) {
      for (var i = 0; i < batch.orderedStops.length; i++) {
        final s = batch.orderedStops[i];
        markers.add(
          Marker(
            markerId: MarkerId(s.id),
            position: s.position,
            icon: BitmapDescriptor.defaultMarkerWithHue(
              BitmapDescriptor.hueRed,
            ),
            infoWindow: InfoWindow(
              title: '${i + 1}. ${s.partyName}',
              snippet: s.commune,
            ),
          ),
        );
      }
    }
    return markers;
  }

  Set<Polyline> buildPolylines() {
    final batch = tasks.activeBatch.value;
    if (batch != null && batch.status == BatchStatus.inProgress) {
      return {
        Polyline(
          polylineId: const PolylineId('batch_route'),
          points: batch.plannedRoute,
          color: AppColors.accent,
          width: 4,
        ),
      };
    }
    final active = activeTask;
    if (active == null) return {};
    return {
      Polyline(
        polylineId: const PolylineId('active_route'),
        points: [tasks.riderPosition, active.position],
        color: AppColors.primary,
        width: 4,
      ),
    };
  }

  void openActive() {
    final active = activeTask;
    if (active == null) return;
    if (active.type == TaskType.pickup) {
      Get.toNamed(AppRoutes.task(active.id));
    } else {
      final batch = tasks.activeBatch.value;
      if (batch != null) Get.toNamed(AppRoutes.batch(batch.id));
    }
  }
}
