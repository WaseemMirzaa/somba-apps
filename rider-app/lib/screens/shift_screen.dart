import 'dart:async';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../l10n/shift_strings.dart';
import '../l10n/strings.dart';
import '../services/shift_models.dart';
import '../services/shift_store.dart';
import '../theme/app_theme.dart';
import '../widgets/ui.dart';

/// Route name, so a test (or a sign-out) can tell this screen from the shell.
const kShiftRoute = 'rider/shift';

String _clock(DateTime t, Strings s) {
  try {
    return DateFormat.Hm(s.lang).format(t);
  } catch (_) {
    return '${t.hour.toString().padLeft(2, '0')}:${t.minute.toString().padLeft(2, '0')}';
  }
}

String _day(DateTime t, Strings s) {
  try {
    return DateFormat.MMMEd(s.lang).format(t);
  } catch (_) {
    return t.toIso8601String().substring(0, 10);
  }
}

bool _sameDay(DateTime a, DateTime b) => a.year == b.year && a.month == b.month && a.day == b.day;

/// "today, 08:02" or "Mon, Mar 9, 08:02".
String _when(DateTime t, DateTime now, Strings s) => _sameDay(t, now) ? s.whenToday(_clock(t, s)) : '${_day(t, s)}, ${_clock(t, s)}';

/// Shift & attendance: where the rider stands (off shift, on shift, on break), the clock buttons, and the last 7 days.
class ShiftScreen extends StatefulWidget {
  const ShiftScreen({super.key});
  @override
  State<ShiftScreen> createState() => _ShiftScreenState();
}

class _ShiftScreenState extends State<ShiftScreen> {
  final _store = ShiftStore.instance;
  Timer? _tick;

  @override
  void initState() {
    super.initState();
    unawaited(_store.load());
    // Hours of an open shift grow with the clock: only the screen redraws, nothing is asked of the server.
    _tick = Timer.periodic(const Duration(seconds: 30), (_) {
      if (mounted) setState(() {});
    });
  }

  @override
  void dispose() {
    _tick?.cancel();
    super.dispose();
  }

  Future<void> _run(Future<void> Function() action, String done) async {
    try {
      await action();
      if (mounted) showSnack(context, done);
    } catch (e) {
      if (mounted) showSnack(context, Strings.current.errorText(e));
    }
  }

  Future<void> _confirmEnd() async {
    final s = Strings.of(context);
    final yes = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(s.shiftEndTitle),
        content: Text(s.shiftEndBody),
        actions: [
          TextButton(key: const ValueKey('shift-end-cancel'), onPressed: () => Navigator.of(ctx).pop(false), child: Text(s.cancel)),
          FilledButton(
            key: const ValueKey('shift-end-confirm'),
            style: FilledButton.styleFrom(backgroundColor: AppColors.danger),
            onPressed: () => Navigator.of(ctx).pop(true),
            child: Text(s.shiftEnd),
          ),
        ],
      ),
    );
    if (yes == true && mounted) await _run(_store.clockOut, Strings.current.shiftDoneEnd);
  }

  @override
  Widget build(BuildContext context) {
    final s = Strings.of(context);
    return Scaffold(
      appBar: backAppBar(context, s.shiftTitle),
      body: ListenableBuilder(
        listenable: _store,
        builder: (context, _) {
          final sum = _store.summary;
          if (sum == null) {
            if (_store.loadError != null) return _LoadFailed(onRetry: _store.load);
            return const Center(child: CircularProgressIndicator());
          }
          final now = DateTime.now();
          return RefreshIndicator(
            onRefresh: _store.load,
            child: ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
              children: [
                _StatusCard(sum: sum, now: now),
                const SizedBox(height: 12),
                _Actions(
                  sum: sum,
                  busy: _store.busy,
                  onStart: () => _run(_store.clockIn, s.shiftDoneStart),
                  onEnd: _confirmEnd,
                  onToggleBreak: () => sum.status == ShiftStatus.onBreak ? _run(_store.endBreak, s.shiftDoneBreakEnd) : _run(_store.startBreak, s.shiftDoneBreakStart),
                ),
                if (_store.loadError != null) ...[
                  const SizedBox(height: 8),
                  Text(s.shiftLoadFailed, key: const ValueKey('shift-stale'), style: const TextStyle(color: AppColors.muted, fontSize: 12.5)),
                ],
                const SizedBox(height: 20),
                _WeekCard(sum: sum, now: now),
                const SizedBox(height: 16),
                if (sum.shifts.isEmpty)
                  SurfaceCard(key: const ValueKey('shift-empty'), child: Text(s.shiftHistoryEmpty, style: const TextStyle(color: AppColors.muted)))
                else
                  for (final sh in sum.shifts) Padding(padding: const EdgeInsets.only(bottom: 10), child: _ShiftRow(shift: sh, now: now)),
              ],
            ),
          );
        },
      ),
    );
  }
}

class _LoadFailed extends StatelessWidget {
  const _LoadFailed({required this.onRetry});
  final Future<void> Function() onRetry;

  @override
  Widget build(BuildContext context) {
    final s = Strings.of(context);
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Text(s.shiftLoadFailed, key: const ValueKey('shift-load-failed'), textAlign: TextAlign.center, style: const TextStyle(color: AppColors.muted)),
          const SizedBox(height: 12),
          OutlinedButton(key: const ValueKey('shift-retry'), onPressed: onRetry, child: Text(s.shiftRetry)),
        ]),
      ),
    );
  }
}

/// Current status: the pill, when the shift started (or when the last one ended) and the hours so far.
class _StatusCard extends StatelessWidget {
  const _StatusCard({required this.sum, required this.now});
  final ShiftSummary sum;
  final DateTime now;

  @override
  Widget build(BuildContext context) {
    final s = Strings.of(context);
    final cur = sum.current;
    final last = sum.lastShift;
    final (label, bg, fg) = switch (sum.status) {
      ShiftStatus.off => (s.shiftStatusOff, AppColors.line, AppColors.inkSoft),
      ShiftStatus.on => (s.shiftStatusOn, AppColors.success, Colors.white),
      ShiftStatus.onBreak => (s.shiftStatusBreak, AppColors.accent, AppColors.ink),
    };
    final detail = cur != null
        ? s.shiftStarted(_when(cur.startedAt, now, s))
        : last?.endedAt != null
            ? s.shiftLastEnded(_when(last!.endedAt!, now, s))
            : s.shiftNotClocked;
    return SurfaceCard(
      key: const ValueKey('shift-status'),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Container(
          height: 44,
          width: 44,
          decoration: BoxDecoration(color: AppColors.primary.withValues(alpha: 0.10), borderRadius: BorderRadius.circular(12)),
          child: Icon(sum.onShift ? Icons.timer_rounded : Icons.timer_off_rounded, color: AppColors.primary),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(s.shiftCurrent, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14.5)),
            const SizedBox(height: 2),
            Text(detail, key: const ValueKey('shift-detail'), style: const TextStyle(color: AppColors.muted, fontSize: 12.5, height: 1.3)),
            if (cur != null) ...[
              const SizedBox(height: 6),
              Text(s.shiftWorked(formatDuration(cur.workedAt(now))), key: const ValueKey('shift-worked'), style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
              if (cur.breakMinutes > 0) Text(s.shiftBreaks(formatDuration(cur.breakMinutes)), style: const TextStyle(color: AppColors.muted, fontSize: 12.5)),
            ],
          ]),
        ),
        const SizedBox(width: 8),
        Pill(label, key: const ValueKey('shift-pill'), color: bg, textColor: fg),
      ]),
    );
  }
}

/// Off shift: Start shift. On shift: Take a break / End break and End shift. Label-only buttons, one filled at a time.
class _Actions extends StatelessWidget {
  const _Actions({required this.sum, required this.busy, required this.onStart, required this.onEnd, required this.onToggleBreak});
  final ShiftSummary sum;
  final bool busy;
  final VoidCallback onStart, onEnd, onToggleBreak;

  @override
  Widget build(BuildContext context) {
    final s = Strings.of(context);
    if (!sum.onShift) {
      // PrimaryButton's label does not shrink: at large text a French label would overflow, so this one scales down.
      return SizedBox(
        width: double.infinity,
        child: FilledButton(
          key: const ValueKey('shift-start'),
          onPressed: busy ? null : onStart,
          child: busy ? const ButtonSpinner() : ButtonLabel(s.shiftStart),
        ),
      );
    }
    final onBreak = sum.status == ShiftStatus.onBreak;
    return Row(children: [
      Expanded(
        child: OutlinedButton(
          key: const ValueKey('shift-break'),
          onPressed: busy ? null : onToggleBreak,
          child: ButtonLabel(onBreak ? s.shiftBreakEnd : s.shiftBreakStart),
        ),
      ),
      const SizedBox(width: 12),
      Expanded(
        child: FilledButton(
          key: const ValueKey('shift-end'),
          style: FilledButton.styleFrom(backgroundColor: AppColors.danger),
          onPressed: busy ? null : onEnd,
          child: busy ? const ButtonSpinner() : ButtonLabel(s.shiftEnd),
        ),
      ),
    ]);
  }
}

/// The last 7 days in two numbers: shifts and hours.
class _WeekCard extends StatelessWidget {
  const _WeekCard({required this.sum, required this.now});
  final ShiftSummary sum;
  final DateTime now;

  @override
  Widget build(BuildContext context) {
    final s = Strings.of(context);
    Widget stat(String value, String label, Key key) => Expanded(
          child: Column(children: [
            FittedBox(fit: BoxFit.scaleDown, child: Text(value, key: key, style: const TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.w800))),
            const SizedBox(height: 2),
            Text(label, style: TextStyle(color: Colors.white.withValues(alpha: 0.85), fontSize: 12)),
          ]),
        );
    return Container(
      key: const ValueKey('shift-week'),
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(gradient: AppColors.brandGradient, borderRadius: BorderRadius.circular(22)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(s.shiftWeek, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 14.5)),
        const SizedBox(height: 12),
        Row(children: [
          stat('${sum.shifts.length}', s.shiftStatShifts, const ValueKey('shift-count')),
          Container(width: 1, height: 28, color: Colors.white.withValues(alpha: 0.25)),
          stat(formatDuration(sum.minutesLast7DaysAt(now)), s.shiftStatHours, const ValueKey('shift-hours')),
        ]),
      ]),
    );
  }
}

/// One shift of the last 7 days: the day, in and out, the hours worked, the break and how it ended.
class _ShiftRow extends StatelessWidget {
  const _ShiftRow({required this.shift, required this.now});
  final ShiftDto shift;
  final DateTime now;

  @override
  Widget build(BuildContext context) {
    final s = Strings.of(context);
    final times = shift.endedAt == null
        ? s.shiftInProgress(_clock(shift.startedAt, s))
        : s.shiftInOut(_clock(shift.startedAt, s), _clock(shift.endedAt!, s));
    return SurfaceCard(
      key: ValueKey('shift-${shift.id}'),
      padding: const EdgeInsets.all(14),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(_day(shift.startedAt, s), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14)),
            const SizedBox(height: 2),
            Text(times, style: const TextStyle(color: AppColors.inkSoft, fontSize: 13, fontWeight: FontWeight.w600)),
            if (shift.breakMinutes > 0) Text(s.shiftBreakLine(formatDuration(shift.breakMinutes)), style: const TextStyle(color: AppColors.muted, fontSize: 12.5)),
            if (shift.closedAutomatically) Text(s.shiftAutoClosed, key: const ValueKey('shift-auto'), style: const TextStyle(color: AppColors.muted, fontSize: 12.5)),
          ]),
        ),
        const SizedBox(width: 8),
        Text(formatDuration(shift.workedAt(now)), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14)),
      ]),
    );
  }
}
