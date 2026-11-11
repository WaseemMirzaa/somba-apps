import 'package:flutter/material.dart';
import '../l10n/strings.dart';
import '../services/rider_store.dart';
import '../theme/app_theme.dart';
import '../widgets/ui.dart';

/// The rider's work (tasks done today, this week, all time; completed, in progress, failed, success rate, completed by type)
/// all computed by the server. Riders are salaried: there is no pay on this screen.
class WorkScreen extends StatelessWidget {
  const WorkScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final store = RiderStore.instance;
    final top = MediaQuery.of(context).padding.top;
    return ListenableBuilder(
      listenable: store,
      builder: (context, _) {
        final s = Strings.of(context);
        final e = store.stats;
        return RefreshIndicator(
          onRefresh: store.refresh,
          child: ListView(padding: EdgeInsets.zero, children: [
            Container(
              padding: EdgeInsets.fromLTRB(20, top + 22, 20, 26),
              decoration: const BoxDecoration(gradient: AppColors.brandGradient, borderRadius: BorderRadius.vertical(bottom: Radius.circular(26))),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(s.navWork, style: TextStyle(color: Colors.white.withValues(alpha: 0.9), fontSize: 14)),
                const SizedBox(height: 6),
                Text('${e.completedToday}', key: const ValueKey('work-today'), style: const TextStyle(color: Colors.white, fontSize: 38, fontWeight: FontWeight.w800)),
                Text(s.workTodaySub, key: const ValueKey('work-today-sub'), style: const TextStyle(color: Colors.white, fontSize: 14, fontWeight: FontWeight.w600)),
                const SizedBox(height: 4),
                Text(s.workWeekAll(e.completedLast7Days, e.completed), key: const ValueKey('work-week-all'), style: TextStyle(color: Colors.white.withValues(alpha: 0.85), fontSize: 13)),
              ]),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 110),
              child: Column(children: [
                Row(children: [
                  Expanded(child: _tile(Icons.check_circle_rounded, AppColors.success, '${e.completed}', s.workCompleted, key: const ValueKey('work-completed'))),
                  const SizedBox(width: 12),
                  Expanded(child: _tile(Icons.two_wheeler_rounded, AppColors.primary, '${e.active}', s.inProgress, key: const ValueKey('work-active'))),
                ]),
                const SizedBox(height: 12),
                Row(children: [
                  Expanded(child: _tile(Icons.cancel_rounded, AppColors.danger, '${e.failed}', s.workFailed, key: const ValueKey('work-failed'))),
                  const SizedBox(width: 12),
                  Expanded(child: _tile(Icons.percent_rounded, AppColors.info, e.successRate == null ? '—' : '${e.successRate}%', s.workSuccessRate, key: const ValueKey('work-success-rate'))),
                ]),
                const SizedBox(height: 12),
                if (e.byKind.isNotEmpty) ...[
                  SurfaceCard(
                    key: const ValueKey('work-by-kind'),
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text(s.workByKind, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14.5)),
                      const SizedBox(height: 10),
                      for (final k in e.byKind)
                        Padding(
                          key: ValueKey('work-kind-${k.kind}'),
                          padding: const EdgeInsets.symmetric(vertical: 5),
                          child: Row(children: [
                            Expanded(child: Text(_kindLabel(s, k.kind), style: const TextStyle(fontSize: 13.5))),
                            const SizedBox(width: 12),
                            Text('${k.count}', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13.5)),
                          ]),
                        ),
                    ]),
                  ),
                  const SizedBox(height: 12),
                ],
                SurfaceCard(
                  child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    const Icon(Icons.info_outline_rounded, color: AppColors.muted, size: 20),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        s.workSalaryNote,
                        key: const ValueKey('work-salary-note'),
                        style: const TextStyle(color: AppColors.muted, fontSize: 12.5, height: 1.4),
                      ),
                    ),
                  ]),
                ),
              ]),
            ),
          ]),
        );
      },
    );
  }

  static String _kindLabel(Strings s, String kind) => s.has('kind_$kind') ? s.t('kind_$kind') : kind.replaceAll('_', ' ');

  Widget _tile(IconData icon, Color color, String value, String label, {Key? key}) => SurfaceCard(
        key: key,
        child: Row(children: [
          Container(height: 42, width: 42, decoration: BoxDecoration(color: color.withValues(alpha: 0.14), borderRadius: BorderRadius.circular(12)), child: Icon(icon, color: color)),
          const SizedBox(width: 12),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(value, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 20)),
              Text(label, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(color: AppColors.muted, fontSize: 12.5)),
            ]),
          ),
        ]),
      );
}
