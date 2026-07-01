import 'package:flutter/material.dart';
import '../data/mock_tasks.dart';
import '../theme/app_theme.dart';
import '../widgets/ui.dart';

class TasksScreen extends StatefulWidget {
  final Locale locale;
  const TasksScreen({super.key, required this.locale});

  @override
  State<TasksScreen> createState() => _TasksScreenState();
}

class _TasksScreenState extends State<TasksScreen> {
  bool _online = true;

  @override
  Widget build(BuildContext context) {
    return CustomScrollView(
      slivers: [
        SliverToBoxAdapter(child: _header(context)),
        const SliverToBoxAdapter(child: SectionHeader("Today's route", actionLabel: 'Optimize')),
        SliverPadding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 120),
          sliver: SliverList.separated(
            itemCount: mockTasks.length,
            separatorBuilder: (_, __) => const SizedBox(height: 12),
            itemBuilder: (_, i) => _taskCard(context, mockTasks[i], i),
          ),
        ),
      ],
    );
  }

  Widget _header(BuildContext context) {
    final top = MediaQuery.of(context).padding.top;
    return Container(
      padding: EdgeInsets.fromLTRB(20, top + 20, 20, 22),
      decoration: const BoxDecoration(
        gradient: AppColors.brandGradient,
        borderRadius: BorderRadius.vertical(bottom: Radius.circular(28)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.all(2.5),
                decoration: BoxDecoration(shape: BoxShape.circle, border: Border.all(color: Colors.white.withValues(alpha: 0.5), width: 2)),
                child: const CircleAvatar(
                  radius: 26,
                  backgroundColor: Colors.white,
                  child: Text('JM', style: TextStyle(color: AppColors.primary, fontWeight: FontWeight.w800, fontSize: 18)),
                ),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('Jean Mukendi', style: TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.w800)),
                    const SizedBox(height: 2),
                    Row(children: [
                      Icon(Icons.star_rounded, size: 15, color: Colors.amber.shade300),
                      const SizedBox(width: 3),
                      Text('4.9 · RDR-001', style: TextStyle(color: Colors.white.withValues(alpha: 0.9), fontSize: 12.5, fontWeight: FontWeight.w600)),
                    ]),
                  ],
                ),
              ),
              // Online toggle
              GestureDetector(
                onTap: () => setState(() => _online = !_online),
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 200),
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                  decoration: BoxDecoration(
                    color: _online ? Colors.white : Colors.white.withValues(alpha: 0.2),
                    borderRadius: BorderRadius.circular(100),
                  ),
                  child: Row(children: [
                    Container(width: 8, height: 8, decoration: BoxDecoration(color: _online ? AppColors.primary : Colors.white, shape: BoxShape.circle)),
                    const SizedBox(width: 6),
                    Text(_online ? 'On duty' : 'Off',
                        style: TextStyle(color: _online ? AppColors.primary : Colors.white, fontWeight: FontWeight.w800, fontSize: 12.5)),
                  ]),
                ),
              ),
            ],
          ),
          const SizedBox(height: 18),
          Container(
            padding: const EdgeInsets.symmetric(vertical: 14),
            decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.16), borderRadius: BorderRadius.circular(18)),
            child: Row(children: [
              _stat('${mockTasks.length}', 'Active'),
              _divider(),
              _stat('\$84', 'Earned'),
              _divider(),
              _stat('12.4', 'km'),
            ]),
          ),
        ],
      ),
    );
  }

  Widget _stat(String v, String l) => Expanded(
        child: Column(children: [
          Text(v, style: const TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.w800)),
          const SizedBox(height: 2),
          Text(l, style: TextStyle(color: Colors.white.withValues(alpha: 0.85), fontSize: 12)),
        ]),
      );

  Widget _divider() => Container(width: 1, height: 30, color: Colors.white.withValues(alpha: 0.25));

  Widget _taskCard(BuildContext context, RiderTask t, int i) {
    return SurfaceCard(
      onTap: () => _showTaskDetail(context, t),
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                height: 46,
                width: 46,
                decoration: BoxDecoration(color: t.color.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(14)),
                child: Icon(t.icon, color: t.color, size: 22),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(children: [
                      Pill(t.typeLabel, color: t.color.withValues(alpha: 0.14), textColor: t.color, fontSize: 10.5),
                      const SizedBox(width: 6),
                      Text(t.id, style: const TextStyle(color: AppColors.faint, fontSize: 11.5, fontWeight: FontWeight.w600)),
                    ]),
                    const SizedBox(height: 5),
                    Text(t.customer, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
                  ],
                ),
              ),
              // Step number
              Container(
                height: 26,
                width: 26,
                alignment: Alignment.center,
                decoration: BoxDecoration(color: AppColors.background, shape: BoxShape.circle, border: Border.all(color: AppColors.line)),
                child: Text('${i + 1}', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 12, color: AppColors.muted)),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Row(children: [
            const Icon(Icons.location_on_rounded, size: 15, color: AppColors.muted),
            const SizedBox(width: 4),
            Expanded(child: Text(t.address, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(color: AppColors.muted, fontSize: 12.5))),
          ]),
          const SizedBox(height: 12),
          Row(children: [
            _meta(Icons.route_rounded, '${t.distanceKm} km'),
            const SizedBox(width: 8),
            _meta(Icons.schedule_rounded, '${t.etaMin} min'),
            const SizedBox(width: 8),
            _meta(Icons.inventory_2_outlined, '${t.items} item${t.items > 1 ? 's' : ''}'),
            const Spacer(),
            if (t.codAmount != null)
              Pill('COD \$${t.codAmount!.toStringAsFixed(0)}', color: AppColors.accent.withValues(alpha: 0.16), textColor: const Color(0xFFB45309), icon: Icons.payments_rounded, fontSize: 11),
            if (t.openBox) ...[
              const SizedBox(width: 6),
              Pill('Open box', color: AppColors.info.withValues(alpha: 0.14), textColor: AppColors.info, icon: Icons.inventory_rounded, fontSize: 11),
            ],
          ]),
        ],
      ),
    );
  }

  Widget _meta(IconData icon, String text) => Row(children: [
        Icon(icon, size: 14, color: AppColors.faint),
        const SizedBox(width: 3),
        Text(text, style: const TextStyle(fontSize: 11.5, color: AppColors.inkSoft, fontWeight: FontWeight.w600)),
      ]);

  void _showTaskDetail(BuildContext context, RiderTask t) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      builder: (ctx) => Padding(
        padding: EdgeInsets.fromLTRB(20, 14, 20, 20 + MediaQuery.of(ctx).padding.bottom),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Center(child: Container(width: 44, height: 5, decoration: BoxDecoration(color: AppColors.line, borderRadius: BorderRadius.circular(100)))),
            const SizedBox(height: 18),
            Row(children: [
              Container(
                height: 48,
                width: 48,
                decoration: BoxDecoration(color: t.color.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(14)),
                child: Icon(t.icon, color: t.color),
              ),
              const SizedBox(width: 12),
              Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(t.customer, style: Theme.of(context).textTheme.titleMedium),
                Text('${t.typeLabel} · ${t.id}', style: const TextStyle(color: AppColors.muted, fontSize: 12.5)),
              ]),
            ]),
            const SizedBox(height: 16),
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(color: AppColors.background, borderRadius: BorderRadius.circular(16)),
              child: Row(children: [
                const Icon(Icons.location_on_rounded, color: AppColors.primary),
                const SizedBox(width: 10),
                Expanded(child: Text(t.address, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13.5))),
                Text('${t.distanceKm} km', style: const TextStyle(color: AppColors.muted, fontWeight: FontWeight.w700, fontSize: 12.5)),
              ]),
            ),
            if (t.codAmount != null) ...[
              const SizedBox(height: 12),
              Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(gradient: AppColors.cashGradient, borderRadius: BorderRadius.circular(16)),
                child: Row(children: [
                  const Icon(Icons.payments_rounded, color: Colors.white),
                  const SizedBox(width: 10),
                  const Expanded(child: Text('Collect cash on delivery', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w700))),
                  Text('\$${t.codAmount!.toStringAsFixed(2)}', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 18)),
                ]),
              ),
            ],
            if (t.openBox) ...[
              const SizedBox(height: 12),
              Row(children: [
                const Icon(Icons.inventory_rounded, color: AppColors.info, size: 18),
                const SizedBox(width: 8),
                const Expanded(child: Text('Open-box order — let the customer inspect before handover.', style: TextStyle(fontSize: 12.5, color: AppColors.inkSoft, fontWeight: FontWeight.w500))),
              ]),
            ],
            const SizedBox(height: 18),
            FilledButton.icon(
              onPressed: () { Navigator.pop(ctx); _snack(context, 'Opening navigation…'); },
              icon: const Icon(Icons.navigation_rounded, size: 20),
              label: const Text('Navigate'),
            ),
            const SizedBox(height: 10),
            OutlinedButton.icon(
              onPressed: () { Navigator.pop(ctx); _snack(context, 'Proof of delivery captured${t.codAmount != null ? " — \$${t.codAmount!.toStringAsFixed(0)} collected" : ""}'); },
              icon: const Icon(Icons.check_circle_rounded, size: 20),
              label: const Text('Complete delivery'),
            ),
            const SizedBox(height: 4),
            TextButton(
              onPressed: () { Navigator.pop(ctx); _snack(context, 'Failed delivery logged'); },
              style: TextButton.styleFrom(foregroundColor: AppColors.danger),
              child: const Text('Report a problem'),
            ),
          ],
        ),
      ),
    );
  }

  void _snack(BuildContext context, String m) => ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: Text(m)));
}
