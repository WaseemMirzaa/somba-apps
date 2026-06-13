import 'package:google_maps_flutter/google_maps_flutter.dart';

import 'rider_task.dart';

enum BatchStatus { assigned, inProgress, completed }

class Batch {
  final String id;
  final String zone;
  BatchStatus status;
  final List<RiderTask> orderedStops;
  final List<LatLng> plannedRoute;

  Batch({
    required this.id,
    required this.zone,
    required this.status,
    required this.orderedStops,
    required this.plannedRoute,
  });

  int get totalStops => orderedStops.length;

  int get completedCount =>
      orderedStops.where((s) => s.status == TaskStatus.completed).length;

  int get failedCount =>
      orderedStops.where((s) => s.status == TaskStatus.failed).length;

  int get resolvedCount => completedCount + failedCount;

  RiderTask? get nextPendingStop =>
      orderedStops.where((s) => s.isPending).firstOrNull;
}
