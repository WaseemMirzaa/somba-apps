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
    final cod = stops.where((t) => t.codAmount != null).fold<double>(0, (s, t) => s + t.codAmount!);
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
            _hstat('\$${cod.toStringAsFixed(0)}', 'COD'),
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
            if (t.codAmount != null) Pill('\$${t.codAmount!.toStringAsFixed(0)}', color: AppColors.accent.withValues(alpha: 0.16), textColor: const Color(0xFFB45309), fontSize: 11),
          ])));
        }),
        const SizedBox(height: 4),
        const PrimaryButton('Start batch', icon: Icons.play_arrow_rounded),
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
        const PrimaryButton('Move to high-demand zone', icon: Icons.trending_up_rounded),
      ]),
    );
  }
}

// ---------------- COD shift summary (RF-11) ----------------
class CodSummaryScreen extends StatelessWidget {
  const CodSummaryScreen({super.key});
  @override
  Widget build(BuildContext context) {
    const rows = [
      ('TSK-8841', 'Marie Dubois', 149.90, 'Cash'),
      ('TSK-8839', 'Jean Petit', 89.00, 'Cash'),
      ('TSK-8830', 'Aline K.', 62.00, 'Airtel'),
      ('TSK-8825', 'Paul Kabeya', 119.10, 'Cash'),
    ];
    final total = rows.fold<double>(0, (s, r) => s + r.$3);
    return Scaffold(
      appBar: backAppBar(context, 'COD shift summary'),
      body: ListView(padding: const EdgeInsets.fromLTRB(16, 8, 16, 24), children: [
        Container(
          padding: const EdgeInsets.all(20),
          decoration: BoxDecoration(gradient: AppColors.cashGradient, borderRadius: BorderRadius.circular(22)),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Text('Collected today', style: TextStyle(color: Colors.white70, fontSize: 13)),
            const SizedBox(height: 4),
            Text('\$${total.toStringAsFixed(2)}', style: const TextStyle(color: Colors.white, fontSize: 36, fontWeight: FontWeight.w800, fontFamily: 'PlusJakartaSans')),
            const SizedBox(height: 4),
            Text('${rows.length} collections · deposit due by 6 PM', style: const TextStyle(color: Colors.white70, fontSize: 12.5)),
          ]),
        ),
        const SizedBox(height: 16),
        const Text('Collections', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
        const SizedBox(height: 10),
        ...rows.map((r) => Padding(padding: const EdgeInsets.only(bottom: 10), child: SurfaceCard(padding: const EdgeInsets.all(14), child: Row(children: [
          Container(height: 40, width: 40, decoration: BoxDecoration(color: (r.$4 == 'Cash' ? AppColors.accent : AppColors.info).withValues(alpha: 0.14), borderRadius: BorderRadius.circular(12)),
            child: Icon(r.$4 == 'Cash' ? Icons.payments_rounded : Icons.smartphone_rounded, color: r.$4 == 'Cash' ? const Color(0xFFB45309) : AppColors.info, size: 20)),
          const SizedBox(width: 12),
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(r.$2, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13.5)),
            Text('${r.$1} · ${r.$4}', style: const TextStyle(color: AppColors.muted, fontSize: 12)),
          ])),
          Text('\$${r.$3.toStringAsFixed(0)}', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14)),
        ])))),
        const SizedBox(height: 4),
        const PrimaryButton('Confirm hub deposit', icon: Icons.account_balance_rounded),
      ]),
    );
  }
}
