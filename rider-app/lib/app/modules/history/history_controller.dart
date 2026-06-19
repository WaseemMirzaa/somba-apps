import 'package:get/get.dart';
import 'package:intl/intl.dart';

import '../../core/services/task_service.dart';
import '../../data/models/rider_task.dart';

class HistoryGroup {
  final String label;
  final List<RiderTask> items;

  const HistoryGroup({required this.label, required this.items});
}

class HistoryController extends GetxController {
  final TaskService tasks = Get.find<TaskService>();

  List<HistoryGroup> get groups {
    final sorted = tasks.history.toList()
      ..sort((a, b) {
        final ta = a.completedAt ?? DateTime(2000);
        final tb = b.completedAt ?? DateTime(2000);
        return tb.compareTo(ta);
      });
    final byDay = <String, List<RiderTask>>{};
    for (final t in sorted) {
      final label = _dayLabel(t.completedAt ?? DateTime.now());
      byDay.putIfAbsent(label, () => []).add(t);
    }
    return byDay.entries
        .map((e) => HistoryGroup(label: e.key, items: e.value))
        .toList();
  }

  String _dayLabel(DateTime date) {
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final day = DateTime(date.year, date.month, date.day);
    if (day == today) return 'history_today'.tr;
    if (day == today.subtract(const Duration(days: 1))) {
      return 'history_yesterday'.tr;
    }
    final locale = Get.locale?.languageCode ?? 'fr';
    return DateFormat('EEEE d MMMM', locale).format(date).capitalizeFirst ??
        '';
  }

  String timeOf(RiderTask task) {
    final at = task.completedAt;
    if (at == null) return '';
    return DateFormat.Hm().format(at);
  }
}
