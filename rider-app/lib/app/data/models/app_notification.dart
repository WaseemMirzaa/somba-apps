enum NotificationType { taskAssigned, batchReady, announcement }

class AppNotification {
  final String id;
  final NotificationType type;
  final String titleKey;
  final String bodyKey;
  final Map<String, String> params;
  final DateTime time;
  bool read;

  AppNotification({
    required this.id,
    required this.type,
    required this.titleKey,
    required this.bodyKey,
    this.params = const {},
    required this.time,
    this.read = false,
  });
}
