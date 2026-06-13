import 'package:get/get.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';

import '../../data/mock/mock_data.dart';
import '../../data/models/app_notification.dart';
import '../../data/models/batch.dart';
import '../../data/models/rider_task.dart';
import '../../data/models/warehouse.dart';

/// In-memory mock "backend" for tasks, batches, history and notifications.
class TaskService extends GetxService {
  final RxList<RiderTask> pickupTasks = <RiderTask>[].obs;
  final Rxn<Batch> activeBatch = Rxn<Batch>();
  final RxList<RiderTask> history = <RiderTask>[].obs;
  final RxList<AppNotification> notifications = <AppNotification>[].obs;

  LatLng get riderPosition => MockData.riderPosition;
  Warehouse get warehouse => MockData.warehouse;

  @override
  void onInit() {
    super.onInit();
    reset();
  }

  /// Re-seeds all mock data (fresh session).
  void reset() {
    pickupTasks.assignAll(MockData.buildPickupTasks());
    activeBatch.value = MockData.buildBatch();
    history.assignAll(MockData.buildHistory());
    notifications.assignAll(MockData.buildNotifications());
  }

  RiderTask? taskById(String id) {
    for (final t in pickupTasks) {
      if (t.id == id) return t;
    }
    final batch = activeBatch.value;
    if (batch != null) {
      for (final s in batch.orderedStops) {
        if (s.id == id) return s;
      }
    }
    for (final t in history) {
      if (t.id == id) return t;
    }
    return null;
  }

  int get unreadNotifications => notifications.where((n) => !n.read).length;

  void markNotificationsRead() {
    for (final n in notifications) {
      n.read = true;
    }
    notifications.refresh();
  }

  void refreshTasks() {
    pickupTasks.refresh();
    activeBatch.refresh();
  }

  /// Pickup checked in at the warehouse: completed, moved to history.
  void completePickup(RiderTask task) {
    task.status = TaskStatus.completed;
    task.completedAt = DateTime.now();
    pickupTasks.remove(task);
    history.insert(0, task);
    history.refresh();
  }

  void completeStop(RiderTask stop) {
    stop.status = TaskStatus.completed;
    stop.completedAt = DateTime.now();
    activeBatch.refresh();
  }

  void failStop(RiderTask stop, String reasonKey, String note) {
    stop.status = TaskStatus.failed;
    stop.completedAt = DateTime.now();
    stop.failReasonKey = reasonKey;
    stop.failNote = note;
    activeBatch.refresh();
  }

  /// Moves all resolved batch stops to history and clears the active batch.
  void archiveBatch() {
    final batch = activeBatch.value;
    if (batch == null) return;
    for (final stop in batch.orderedStops.reversed) {
      if (!stop.isPending) {
        history.insert(0, stop);
      }
    }
    history.refresh();
    activeBatch.value = null;
  }
}
