/// Which part of the app a tapped notification opens: the Deliveries tab (Active or Done, with the task to show),
/// Profile, where the notification list is, or the support screen (a ticket thread when the notice names one).
class RiderFocus {
  const RiderFocus.deliveries(this.deliveriesTab, {this.taskId})
      : tab = deliveriesIndex,
        supportOpen = false,
        supportId = null;
  const RiderFocus.profile()
      : tab = profileIndex,
        deliveriesTab = null,
        taskId = null,
        supportOpen = false,
        supportId = null;

  /// The support screen on top of Profile, straight into ticket [id] when given.
  const RiderFocus.support([String? id])
      : tab = profileIndex,
        deliveriesTab = null,
        taskId = null,
        supportOpen = true,
        supportId = id;

  static const deliveriesIndex = 0;
  static const profileIndex = 2;

  /// Deliveries sub-tabs.
  static const active = 0;
  static const done = 1;

  /// Bottom-bar tab.
  final int tab;

  /// Deliveries sub-tab (null for Profile and Support).
  final int? deliveriesTab;
  final String? taskId;

  /// Open the support screen (with [supportId] open when set).
  final bool supportOpen;
  final String? supportId;

  @override
  bool operator ==(Object other) =>
      other is RiderFocus &&
      other.tab == tab &&
      other.deliveriesTab == deliveriesTab &&
      other.taskId == taskId &&
      other.supportOpen == supportOpen &&
      other.supportId == supportId;
  @override
  int get hashCode => Object.hash(tab, deliveriesTab, taskId, supportOpen, supportId);
  @override
  String toString() => 'RiderFocus(tab $tab, deliveries $deliveriesTab, task $taskId, support $supportOpen/$supportId)';
}

/// The screen for a notification. Tasks are assigned by the warehouse, so a task notice ("New task assigned to you")
/// always opens the Active list; a support notice opens the ticket (links like `/rider/support/<id>`).
RiderFocus riderFocusFor(String type, {String? entityId}) {
  switch (type) {
    case 'task':
    case 'delivery':
    case 'run':
    case 'order':
      return RiderFocus.deliveries(RiderFocus.active, taskId: entityId);
    case 'support':
      return RiderFocus.support(entityId);
    default:
      return const RiderFocus.profile();
  }
}
