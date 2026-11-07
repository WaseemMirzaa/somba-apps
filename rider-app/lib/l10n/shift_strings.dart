// Typed accessors for the shift texts (shift_messages.dart).
import 'strings.dart';

extension ShiftStrings on Strings {
  String get shiftTitle => t('shift_title');
  String get shiftEntrySub => t('shift_entry_sub');
  String get shiftCurrent => t('shift_current');
  String get shiftStatusOff => t('shift_status_off');
  String get shiftStatusOn => t('shift_status_on');
  String get shiftStatusBreak => t('shift_status_break');
  String get shiftNotClocked => t('shift_not_clocked');
  String shiftStarted(Object? when) => t('shift_started', {'when': when});
  String shiftLastEnded(Object? when) => t('shift_last_ended', {'when': when});
  String shiftWorked(Object? time) => t('shift_worked', {'time': time});
  String shiftBreaks(Object? time) => t('shift_breaks', {'time': time});
  String get shiftStart => t('shift_start');
  String get shiftEnd => t('shift_end');
  String get shiftBreakStart => t('shift_break_start');
  String get shiftBreakEnd => t('shift_break_end');
  String get shiftEndTitle => t('shift_end_title');
  String get shiftEndBody => t('shift_end_body');
  String get shiftDoneStart => t('shift_done_start');
  String get shiftDoneEnd => t('shift_done_end');
  String get shiftDoneBreakStart => t('shift_done_break_start');
  String get shiftDoneBreakEnd => t('shift_done_break_end');
  String get shiftWeek => t('shift_week');
  String get shiftStatShifts => t('shift_stat_shifts');
  String get shiftStatHours => t('shift_stat_hours');
  String get shiftHistoryEmpty => t('shift_history_empty');
  String shiftInOut(Object? timeIn, Object? timeOut) => t('shift_in_out', {'in': timeIn, 'out': timeOut});
  String shiftInProgress(Object? timeIn) => t('shift_in_progress', {'in': timeIn});
  String shiftBreakLine(Object? time) => t('shift_break_line', {'time': time});
  String get shiftAutoClosed => t('shift_auto_closed');
  String get shiftLoadFailed => t('shift_load_failed');
  String get shiftRetry => t('shift_retry');
}
