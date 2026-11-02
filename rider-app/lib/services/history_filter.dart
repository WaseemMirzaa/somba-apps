import 'models.dart';

/// The Done list's search and date filter: a finished task by its order reference, a finished transfer run by its
/// reference (TR-0042) or by the order reference of any parcel inside it, and both by the day they ended.

/// "som-12 " matches "SOM-1234": case, spaces and a leading "#" are ignored.
String _norm(String s) => s.toLowerCase().replaceAll(RegExp(r'[\s#]'), '');

/// Does [reference] contain what the rider typed? An empty query matches everything.
bool matchesReference(String reference, String query) {
  final q = _norm(query);
  return q.isEmpty || _norm(reference).contains(q);
}

/// Is [date] on one of the days from [from] to [to], both included (either may be open)? A task with no date matches
/// only when no day is asked for.
bool inDayRange(DateTime? date, DateTime? from, DateTime? to) {
  if (from == null && to == null) return true;
  if (date == null) return false;
  final day = DateTime(date.year, date.month, date.day);
  if (from != null && day.isBefore(DateTime(from.year, from.month, from.day))) return false;
  if (to != null && day.isAfter(DateTime(to.year, to.month, to.day))) return false;
  return true;
}

/// The finished tasks that match the search and fall in the date range.
List<DeliveryTaskDto> filterFinishedTasks(List<DeliveryTaskDto> tasks, {String query = '', DateTime? from, DateTime? to}) =>
    tasks.where((t) => matchesReference(t.orderReference, query) && inDayRange(t.finishedAt, from, to)).toList();

/// When a run ended: closed, else every parcel received, else when it left.
DateTime? runFinishedAt(TransferRun r) => r.closedAt ?? r.arrivedAt ?? r.dispatchedAt ?? r.createdAt;

/// The finished runs that match the search (by run reference or by a parcel's order reference, [parcelsOf] gives the
/// parcels) and fall in the date range.
List<TransferRun> filterFinishedRuns(List<TransferRun> runs, List<DeliveryTaskDto> Function(TransferRun run) parcelsOf, {String query = '', DateTime? from, DateTime? to}) =>
    runs.where((r) => (matchesReference(r.reference, query) || parcelsOf(r).any((t) => matchesReference(t.orderReference, query))) && inDayRange(runFinishedAt(r), from, to)).toList();
