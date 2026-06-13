import 'package:google_maps_flutter/google_maps_flutter.dart';

import 'parcel.dart';

enum TaskType { pickup, delivery }

enum TaskStatus { assigned, inProgress, toWarehouse, completed, failed }

class RiderTask {
  final String id;
  final TaskType type;
  TaskStatus status;
  final String partyName;
  final String addressText;
  final String commune;
  final LatLng position;
  final double distanceKm;
  final List<Parcel> parcels;
  final String otp;
  DateTime? completedAt;
  String? failReasonKey;
  String? failNote;

  RiderTask({
    required this.id,
    required this.type,
    required this.status,
    required this.partyName,
    required this.addressText,
    required this.commune,
    required this.position,
    required this.distanceKm,
    required this.parcels,
    this.otp = '4321',
    this.completedAt,
    this.failReasonKey,
    this.failNote,
  });

  bool get allParcelsScanned => parcels.every((p) => p.scanned);

  bool get isPending =>
      status == TaskStatus.assigned || status == TaskStatus.inProgress;
}
