import 'package:flutter/material.dart';
import '../l10n/strings.dart';
import '../services/rider_store.dart';
import '../theme/app_theme.dart';
import '../widgets/ui.dart';

/// Earnings and cash to hand over, computed by the server from finished deliveries.
class EarningsScreen extends StatelessWidget {
  const EarningsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final store = RiderStore.instance;
    final top = MediaQuery.of(context).padding.top;
    return ListenableBuilder(
      listenable: store,
      builder: (context, _) {
        final s = Strings.of(context);
        final e = store.earnings;
        return RefreshIndicator(
          onRefresh: store.refresh,
          child: ListView(padding: EdgeInsets.zero, children: [
            Container(
              padding: EdgeInsets.fromLTRB(20, top + 22, 20, 26),
              decoration: const BoxDecoration(gradient: AppColors.brandGradient, borderRadius: BorderRadius.vertical(bottom: Radius.circular(26))),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(s.yourEarnings, style: TextStyle(color: Colors.white.withValues(alpha: 0.9), fontSize: 14)),
                const SizedBox(height: 6),
                Text(s.usd(e.earningsUsd), key: const ValueKey('earnings-total'), style: const TextStyle(color: Colors.white, fontSize: 38, fontWeight: FontWeight.w800)),
                Text(e.delivered == 1 ? s.fromDeliveriesOne(e.delivered) : s.fromDeliveriesMany(e.delivered), style: TextStyle(color: Colors.white.withValues(alpha: 0.85), fontSize: 13)),
              ]),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 110),
              child: Column(children: [
                Row(children: [
                  Expanded(child: _tile(Icons.check_circle_rounded, AppColors.success, '${e.delivered}', s.delivered)),
                  const SizedBox(width: 12),
                  Expanded(child: _tile(Icons.two_wheeler_rounded, AppColors.primary, '${e.active}', s.inProgress)),
                ]),
                const SizedBox(height: 12),
                SurfaceCard(
                  child: Row(children: [
                    Container(
                      height: 46,
                      width: 46,
                      decoration: BoxDecoration(color: AppColors.accent.withValues(alpha: 0.16), borderRadius: BorderRadius.circular(14)),
                      child: const Icon(Icons.payments_rounded, color: Color(0xFF92610A)),
                    ),
                    const SizedBox(width: 14),
                    Expanded(
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text(s.usd(e.codCollectedUsd), key: const ValueKey('cod-total'), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 19)),
                        Text(s.cashCollected, style: const TextStyle(color: AppColors.muted, fontSize: 12.5)),
                      ]),
                    ),
                  ]),
                ),
                const SizedBox(height: 12),
                SurfaceCard(
                  child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    const Icon(Icons.info_outline_rounded, color: AppColors.muted, size: 20),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        s.cashNote,
                        key: const ValueKey('cash-note'),
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

  Widget _tile(IconData icon, Color color, String value, String label) => SurfaceCard(
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
