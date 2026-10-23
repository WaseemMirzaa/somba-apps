/// Which part of the app a tapped notification opens: the Deliveries tab (Active or Available, with the task to
/// show) or Profile, where the notification list is.
class RiderFocus {
  const RiderFocus.deliveries(this.deliveriesTab, {this.taskId}) : tab = deliveriesIndex;
  const RiderFocus.profile()
      : tab = profileIndex,
        deliveriesTab = null,
        taskId = null;

  static const deliveriesIndex = 0;
  static const profileIndex = 2;

  /// Deliveries sub-tabs.
  static const active = 0;
  static const available = 1;

  /// Bottom-bar tab.
  final int tab;

  /// Deliveries sub-tab (null for Profile).
  final int? deliveriesTab;
  final String? taskId;

  @override
  bool operator ==(Object other) => other is RiderFocus && other.tab == tab && other.deliveriesTab == deliveriesTab && other.taskId == taskId;
  @override
  int get hashCode => Object.hash(tab, deliveriesTab, taskId);
  @override
  String toString() => 'RiderFocus(tab $tab, deliveries $deliveriesTab, task $taskId)';
}

/// The screen for a notification. A push carries `view` (`available` for a new delivery, `active` once it is the
/// rider's); in the in-app list it is worked out from whether the task is already the rider's ([isMine]).
RiderFocus riderFocusFor(String type, {String? entityId, String? view, required bool Function(String taskId) isMine}) {
  switch (type) {
    case 'task':
      final mine = view == 'active' || (view == null && entityId != null && isMine(entityId));
      return RiderFocus.deliveries(mine ? RiderFocus.active : RiderFocus.available, taskId: entityId);
    case 'delivery':
    case 'order':
      return RiderFocus.deliveries(RiderFocus.active, taskId: entityId);
    default:
      return const RiderFocus.profile();
  }
}
