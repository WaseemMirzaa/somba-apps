import 'package:flutter/material.dart';
import '../theme/app_theme.dart';
import '../widgets/ui.dart';

class EarningsScreen extends StatelessWidget {
  const EarningsScreen({super.key});

  static const _week = [
    ('Mon', 62.0),
    ('Tue', 78.0),
    ('Wed', 54.0),
    ('Thu', 90.0),
    ('Fri', 72.0),
    ('Sat', 108.0),
    ('Sun', 84.0),
  ];

  @override
  Widget build(BuildContext context) {
    final top = MediaQuery.of(context).padding.top;
    final maxVal = _week.map((e) => e.$2).reduce((a, b) => a > b ? a : b);

    return ListView(
      padding: EdgeInsets.only(top: top + 12, bottom: 120),
      children: [
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 20),
          child: Text('Earnings', style: Theme.of(context).textTheme.headlineSmall),
        ),
        const SizedBox(height: 14),
        // Hero balance card
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: Container(
            padding: const EdgeInsets.all(22),
            decoration: BoxDecoration(gradient: AppColors.brandGradient, borderRadius: BorderRadius.circular(24), boxShadow: AppShadow.soft),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(children: [
                  Text("Today's earnings", style: TextStyle(color: Colors.white.withValues(alpha: 0.9), fontSize: 13.5, fontWeight: FontWeight.w600)),
                  const Spacer(),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                    decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.2), borderRadius: BorderRadius.circular(100)),
                    child: const Row(mainAxisSize: MainAxisSize.min, children: [
                      Icon(Icons.trending_up_rounded, color: Colors.white, size: 15),
                      SizedBox(width: 4),
                      Text('+18%', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 12)),
                    ]),
                  ),
                ]),
                const SizedBox(height: 8),
                const Text('\$84.00', style: TextStyle(color: Colors.white, fontSize: 40, fontWeight: FontWeight.w800, letterSpacing: -1, fontFamily: 'Sora')),
                const SizedBox(height: 4),
                Text('12 deliveries · COD collected \$420', style: TextStyle(color: Colors.white.withValues(alpha: 0.9), fontSize: 12.5)),
                const SizedBox(height: 18),
                Row(children: [
                  _heroStat('12', 'Trips'),
                  _heroDivider(),
                  _heroStat('\$7.0', 'Avg/trip'),
                  _heroDivider(),
                  _heroStat('4.9★', 'Rating'),
                ]),
              ],
            ),
          ),
        ),
        const SectionHeader('This week'),
        // Weekly bar chart
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: SurfaceCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(children: [
                  const Text('Total', style: TextStyle(color: AppColors.muted, fontSize: 13, fontWeight: FontWeight.w600)),
                  const Spacer(),
                  Text('\$${_week.map((e) => e.$2).reduce((a, b) => a + b).toStringAsFixed(0)}',
                      style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 18, color: AppColors.primary)),
                ]),
                const SizedBox(height: 16),
                SizedBox(
                  height: 150,
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: _week.map((d) {
                      final isBest = d.$2 == maxVal;
                      return Expanded(
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.end,
                          children: [
                            Text('\$${d.$2.toStringAsFixed(0)}',
                                style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: isBest ? AppColors.primary : AppColors.faint)),
                            const SizedBox(height: 4),
                            Container(
                              width: 16,
                              height: 110 * (d.$2 / maxVal),
                              decoration: BoxDecoration(
                                gradient: isBest ? AppColors.brandGradient : null,
                                color: isBest ? null : AppColors.primary.withValues(alpha: 0.16),
                                borderRadius: BorderRadius.circular(100),
                              ),
                            ),
                            const SizedBox(height: 6),
                            Text(d.$1, style: const TextStyle(fontSize: 10.5, color: AppColors.muted, fontWeight: FontWeight.w600)),
                          ],
                        ),
                      );
                    }).toList(),
                  ),
                ),
              ],
            ),
          ),
        ),
        const SectionHeader('Payout history'),
        ...[
          ('This week', 'Payout on Mon', 548.0, true),
          ('Last week', 'Paid · Jun 24', 612.0, false),
          ('Jun 6 – 12', 'Paid · Jun 17', 471.0, false),
        ].map((h) => Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
              child: SurfaceCard(
                padding: const EdgeInsets.all(14),
                child: Row(children: [
                  Container(
                    height: 44,
                    width: 44,
                    decoration: BoxDecoration(color: AppColors.primary.withValues(alpha: 0.10), borderRadius: BorderRadius.circular(14)),
                    child: Icon(h.$4 ? Icons.schedule_rounded : Icons.check_circle_rounded, color: AppColors.primary),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text(h.$1, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14.5)),
                      Text(h.$2, style: const TextStyle(color: AppColors.muted, fontSize: 12.5)),
                    ]),
                  ),
                  Text('\$${h.$3.toStringAsFixed(0)}', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
                ]),
              ),
            )),
      ],
    );
  }

  Widget _heroStat(String v, String l) => Expanded(
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(v, style: const TextStyle(color: Colors.white, fontSize: 17, fontWeight: FontWeight.w800)),
          Text(l, style: TextStyle(color: Colors.white.withValues(alpha: 0.85), fontSize: 11.5)),
        ]),
      );

  Widget _heroDivider() => Container(width: 1, height: 28, color: Colors.white.withValues(alpha: 0.25));
}
