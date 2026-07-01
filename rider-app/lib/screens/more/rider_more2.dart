import 'package:flutter/material.dart';
import '../../data/mock_tasks.dart';
import '../../theme/app_theme.dart';
import '../../widgets/ui.dart';

// ---------------- Batch overview (RF-07) ----------------
class BatchOverviewScreen extends StatelessWidget {
  const BatchOverviewScreen({super.key});
  @override
  Widget build(BuildContext context) {
    final stops = mockTasks;
    final items = stops.fold<int>(0, (s, t) => s + t.items);
    return Scaffold(
      appBar: backAppBar(context, 'Batch BAT-204'),
      body: ListView(padding: const EdgeInsets.fromLTRB(16, 8, 16, 24), children: [
        Container(
          padding: const EdgeInsets.all(18),
          decoration: BoxDecoration(gradient: AppColors.brandGradient, borderRadius: BorderRadius.circular(22)),
          child: Row(children: [
            _hstat('${stops.length}', 'Stops'),
            _hdiv(),
            _hstat('12.4', 'km'),
            _hdiv(),
            _hstat('$items', 'Items'),
          ]),
        ),
        const SizedBox(height: 16),
        const Text('Stops in order', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
        const SizedBox(height: 10),
        ...List.generate(stops.length, (i) {
          final t = stops[i];
          final done = i == 0;
          return Padding(padding: const EdgeInsets.only(bottom: 12), child: SurfaceCard(padding: const EdgeInsets.all(14), child: Row(children: [
            Container(height: 30, width: 30, alignment: Alignment.center,
              decoration: BoxDecoration(color: done ? AppColors.primary : AppColors.background, shape: BoxShape.circle, border: Border.all(color: done ? AppColors.primary : AppColors.line)),
              child: done ? const Icon(Icons.check_rounded, color: Colors.white, size: 16) : Text('${i + 1}', style: const TextStyle(fontWeight: FontWeight.w800, color: AppColors.muted, fontSize: 13))),
            const SizedBox(width: 12),
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(t.customer, style: TextStyle(fontWeight: FontWeight.w800, fontSize: 14, decoration: done ? TextDecoration.lineThrough : null, color: done ? AppColors.muted : AppColors.ink)),
              Text('${t.typeLabel} · ${t.distanceKm} km', style: const TextStyle(color: AppColors.muted, fontSize: 12.5)),
            ])),
            Pill('${t.items} item${t.items > 1 ? 's' : ''}', color: AppColors.primary.withValues(alpha: 0.12), textColor: AppColors.primary, fontSize: 10.5),
          ])));
        }),
        const SizedBox(height: 4),
        PrimaryButton('Start batch',
            icon: Icons.play_arrow_rounded,
            onPressed: () {
              ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Batch BAT-204 started')));
              Navigator.maybePop(context);
            }),
      ]),
    );
  }

  Widget _hstat(String v, String l) => Expanded(child: Column(children: [
        Text(v, style: const TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.w800)),
        Text(l, style: TextStyle(color: Colors.white.withValues(alpha: 0.85), fontSize: 11.5)),
      ]));
  Widget _hdiv() => Container(width: 1, height: 28, color: Colors.white.withValues(alpha: 0.25));
}

// ---------------- Zone / availability (RF-03/04) ----------------
class ZoneScreen extends StatelessWidget {
  const ZoneScreen({super.key});
  @override
  Widget build(BuildContext context) {
    const zones = [
      ('Gombe', 'Very high demand', 0.95, AppColors.danger),
      ('Limete', 'High demand', 0.7, AppColors.accent),
      ('Ngaliema', 'Medium demand', 0.45, AppColors.info),
      ('Kalamu', 'Low demand', 0.2, AppColors.primary),
    ];
    return Scaffold(
      appBar: backAppBar(context, 'Zones & demand'),
      body: ListView(padding: const EdgeInsets.fromLTRB(16, 8, 16, 24), children: [
        SurfaceCard(child: Row(children: [
          Container(height: 44, width: 44, decoration: BoxDecoration(color: AppColors.primary.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(12)), child: const Icon(Icons.my_location_rounded, color: AppColors.primary)),
          const SizedBox(width: 12),
          const Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('Current zone · Gombe', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 14.5)),
            Text('You are online here', style: TextStyle(color: AppColors.muted, fontSize: 12.5)),
          ])),
          Pill('Online', color: AppColors.primary.withValues(alpha: 0.14), textColor: AppColors.primary),
        ])),
        const SizedBox(height: 16),
        const Text('Live demand', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
        const SizedBox(height: 10),
        ...zones.map((z) => Padding(padding: const EdgeInsets.only(bottom: 12), child: SurfaceCard(padding: const EdgeInsets.all(14), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Container(height: 10, width: 10, decoration: BoxDecoration(color: z.$4, shape: BoxShape.circle)),
            const SizedBox(width: 8),
            Text(z.$1, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14)),
            const Spacer(),
            Text(z.$2, style: TextStyle(color: z.$4, fontWeight: FontWeight.w700, fontSize: 12)),
          ]),
          const SizedBox(height: 8),
          ClipRRect(borderRadius: BorderRadius.circular(100), child: LinearProgressIndicator(value: z.$3, minHeight: 8, backgroundColor: AppColors.line, color: z.$4)),
        ])))),
        const SizedBox(height: 4),
        PrimaryButton('Move to high-demand zone',
            icon: Icons.trending_up_rounded,
            onPressed: () => ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Rerouting you toward Gombe…')))),
      ]),
    );
  }
}
