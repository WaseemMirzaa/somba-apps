import 'package:flutter/material.dart';
import '../../data/mock_tasks.dart';
import '../../theme/app_theme.dart';
import '../../widgets/ui.dart';
import 'rider_more3.dart';

// ---------------- Task detail (full screen) ----------------
class TaskDetailScreen extends StatelessWidget {
  final RiderTask task;
  const TaskDetailScreen({super.key, required this.task});
  @override
  Widget build(BuildContext context) {
    final t = task;
    return Scaffold(
      appBar: backAppBar(context, t.id),
      body: ListView(padding: const EdgeInsets.fromLTRB(16, 8, 16, 24), children: [
        SurfaceCard(child: Row(children: [
          Container(height: 48, width: 48, decoration: BoxDecoration(color: t.color.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(14)), child: Icon(t.icon, color: t.color)),
          const SizedBox(width: 12),
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(t.customer, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
            Text('${t.typeLabel} · ${t.items} item${t.items > 1 ? 's' : ''}', style: const TextStyle(color: AppColors.muted, fontSize: 12.5)),
          ])),
          Pill('${t.distanceKm} km', color: AppColors.primary.withValues(alpha: 0.12), textColor: AppColors.primary),
        ])),
        const SizedBox(height: 12),
        SurfaceCard(child: Row(children: [
          const Icon(Icons.location_on_rounded, color: AppColors.primary),
          const SizedBox(width: 10),
          Expanded(child: Text(t.address, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13.5))),
          Container(decoration: BoxDecoration(color: AppColors.primary.withValues(alpha: 0.10), borderRadius: BorderRadius.circular(12)),
            child: IconButton(icon: const Icon(Icons.call_rounded, color: AppColors.primary),
              onPressed: () => ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Calling ${t.customer}…'))))),
          const SizedBox(width: 8),
          Container(decoration: BoxDecoration(color: AppColors.primary.withValues(alpha: 0.10), borderRadius: BorderRadius.circular(12)),
            child: IconButton(icon: const Icon(Icons.chat_bubble_rounded, color: AppColors.primary),
              onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => ChatScreen(name: t.customer))))),
        ])),
        const SizedBox(height: 12),
        SurfaceCard(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Text('Handover checklist', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 14.5)),
          const SizedBox(height: 10),
          _check('Verify customer identity', true),
          _check(t.openBox ? 'Open-box: let customer inspect' : 'Confirm package sealed', t.openBox),
          _check('Capture proof of delivery', false),
        ])),
        const SizedBox(height: 16),
        PrimaryButton('Navigate', icon: Icons.navigation_rounded,
            onPressed: () => ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Opening turn-by-turn navigation…')))),
        const SizedBox(height: 10),
        Row(children: [
          Expanded(child: FilledButton.icon(
            style: FilledButton.styleFrom(backgroundColor: AppColors.primary),
            onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => PodScreen(task: t))),
            icon: const Icon(Icons.check_circle_rounded, size: 20), label: const Text('Deliver'))),
          const SizedBox(width: 10),
          Expanded(child: OutlinedButton.icon(
            style: OutlinedButton.styleFrom(foregroundColor: AppColors.danger, side: const BorderSide(color: AppColors.danger, width: 1.5)),
            onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const FailedDeliveryScreen())),
            icon: const Icon(Icons.report_gmailerrorred_rounded, size: 20), label: const Text('Failed'))),
        ]),
      ]),
    );
  }

  Widget _check(String label, bool done) => Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: Row(children: [
          Icon(done ? Icons.check_circle_rounded : Icons.radio_button_unchecked_rounded, size: 20, color: done ? AppColors.primary : AppColors.faint),
          const SizedBox(width: 10),
          Text(label, style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w600)),
        ]),
      );
}

// ---------------- Proof of delivery (functional) ----------------
class PodScreen extends StatefulWidget {
  final RiderTask task;
  const PodScreen({super.key, required this.task});
  @override
  State<PodScreen> createState() => _PodScreenState();
}

class _PodScreenState extends State<PodScreen> {
  bool _photo = false;
  bool _otp = false;
  final List<List<Offset>> _strokes = [];

  bool get _signed => _strokes.any((s) => s.length > 1);
  bool get _canComplete => _photo && _signed;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: backAppBar(context, 'Proof of delivery'),
      body: ListView(padding: const EdgeInsets.fromLTRB(16, 8, 16, 24), children: [
        // Photo capture (mock).
        SurfaceCard(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Text('Photo of delivery', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 14.5)),
          const SizedBox(height: 10),
          GestureDetector(
            onTap: () => setState(() => _photo = !_photo),
            child: Container(
              height: 130,
              decoration: BoxDecoration(
                gradient: _photo ? AppColors.brandGradient : null,
                color: _photo ? null : AppColors.background,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: _photo ? Colors.transparent : AppColors.line, style: _photo ? BorderStyle.solid : BorderStyle.none),
              ),
              child: _photo
                  ? const Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                      Icon(Icons.check_circle_rounded, color: Colors.white, size: 32),
                      SizedBox(height: 8),
                      Text('Photo captured — tap to retake', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 12.5)),
                    ])
                  : _dashed(const Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                      Icon(Icons.add_a_photo_rounded, color: AppColors.primary, size: 30),
                      SizedBox(height: 8),
                      Text('Tap to capture', style: TextStyle(color: AppColors.muted, fontWeight: FontWeight.w600, fontSize: 12.5)),
                    ])),
            ),
          ),
        ])),
        const SizedBox(height: 12),
        // Signature pad (dependency-free).
        SurfaceCard(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            const Text('Signature', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 14.5)),
            const Spacer(),
            if (_signed)
              TextButton.icon(
                onPressed: () => setState(() => _strokes.clear()),
                icon: const Icon(Icons.refresh_rounded, size: 16),
                style: TextButton.styleFrom(foregroundColor: AppColors.muted, padding: EdgeInsets.zero),
                label: const Text('Clear'),
              ),
          ]),
          const SizedBox(height: 10),
          ClipRRect(
            borderRadius: BorderRadius.circular(16),
            child: Container(
              height: 130,
              decoration: BoxDecoration(color: AppColors.background, borderRadius: BorderRadius.circular(16), border: Border.all(color: AppColors.line)),
              child: GestureDetector(
                onPanStart: (d) => setState(() => _strokes.add([d.localPosition])),
                onPanUpdate: (d) => setState(() {
                  if (_strokes.isEmpty) _strokes.add([]);
                  _strokes.last.add(d.localPosition);
                }),
                child: CustomPaint(
                  painter: _SignPainter(_strokes),
                  child: _signed
                      ? const SizedBox.expand()
                      : const Center(child: Text('Sign here', style: TextStyle(color: AppColors.faint, fontWeight: FontWeight.w600))),
                ),
              ),
            ),
          ),
        ])),
        const SizedBox(height: 12),
        // Delivery OTP verify (mock).
        SurfaceCard(child: Row(children: [
          Icon(Icons.pin_rounded, color: _otp ? AppColors.primary : AppColors.muted),
          const SizedBox(width: 10),
          Expanded(child: Text(_otp ? 'Delivery OTP verified' : 'Verify delivery OTP', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13.5))),
          _otp
              ? Pill('4821', color: AppColors.primary.withValues(alpha: 0.12), textColor: AppColors.primary)
              : FilledButton(
                  style: FilledButton.styleFrom(backgroundColor: AppColors.primary, minimumSize: const Size(0, 38), padding: const EdgeInsets.symmetric(horizontal: 14)),
                  onPressed: () => setState(() => _otp = true),
                  child: const Text('Verify')),
        ])),
        const SizedBox(height: 18),
        PrimaryButton('Complete delivery',
            icon: Icons.check_rounded,
            onPressed: _canComplete
                ? () {
                    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('${widget.task.id} delivered ✓')));
                    Navigator.popUntil(context, (r) => r.isFirst);
                  }
                : null),
        if (!_canComplete)
          const Padding(
            padding: EdgeInsets.only(top: 8),
            child: Center(child: Text('Capture a photo and signature to complete', style: TextStyle(color: AppColors.faint, fontSize: 11.5))),
          ),
      ]),
    );
  }

  Widget _dashed(Widget child) => CustomPaint(painter: _DashedBorder(), child: SizedBox.expand(child: child));
}

/// Draws the captured signature strokes.
class _SignPainter extends CustomPainter {
  final List<List<Offset>> strokes;
  _SignPainter(this.strokes);
  @override
  void paint(Canvas canvas, Size size) {
    final p = Paint()..color = AppColors.ink..style = PaintingStyle.stroke..strokeWidth = 2.6..strokeCap = StrokeCap.round..strokeJoin = StrokeJoin.round;
    for (final s in strokes) {
      if (s.length < 2) continue;
      final path = Path()..moveTo(s.first.dx, s.first.dy);
      for (final pt in s.skip(1)) {
        path.lineTo(pt.dx, pt.dy);
      }
      canvas.drawPath(path, p);
    }
  }

  @override
  bool shouldRepaint(covariant _SignPainter old) => true;
}

/// Dashed rounded border for the empty capture tile.
class _DashedBorder extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final p = Paint()..color = AppColors.primary.withValues(alpha: 0.5)..style = PaintingStyle.stroke..strokeWidth = 1.6;
    final rrect = RRect.fromRectAndRadius(Offset.zero & size, const Radius.circular(16));
    final path = Path()..addRRect(rrect);
    const dash = 7.0, gap = 5.0;
    for (final m in path.computeMetrics()) {
      double d = 0;
      while (d < m.length) {
        canvas.drawPath(m.extractPath(d, d + dash), p);
        d += dash + gap;
      }
    }
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

// ---------------- Failed delivery ----------------
class FailedDeliveryScreen extends StatefulWidget {
  const FailedDeliveryScreen({super.key});
  @override
  State<FailedDeliveryScreen> createState() => _FailedDeliveryScreenState();
}

class _FailedDeliveryScreenState extends State<FailedDeliveryScreen> {
  int _reason = 0;
  final _reasons = ['Customer not available', 'Wrong / incomplete address', 'Customer refused delivery', 'Could not reach customer', 'Damaged package'];
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: backAppBar(context, 'Report a problem'),
      body: ListView(padding: const EdgeInsets.fromLTRB(16, 8, 16, 24), children: [
        const Padding(padding: EdgeInsets.fromLTRB(4, 4, 4, 10), child: Text('Why did the delivery fail?', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15))),
        ...List.generate(_reasons.length, (i) {
          final sel = _reason == i;
          return Padding(padding: const EdgeInsets.only(bottom: 10), child: GestureDetector(
            onTap: () => setState(() => _reason = i),
            child: SurfaceCard(padding: const EdgeInsets.all(14), child: Row(children: [
              Icon(sel ? Icons.radio_button_checked_rounded : Icons.radio_button_unchecked_rounded, color: sel ? AppColors.primary : AppColors.faint),
              const SizedBox(width: 12),
              Expanded(child: Text(_reasons[i], style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13.5, color: sel ? AppColors.ink : AppColors.inkSoft))),
            ])),
          ));
        }),
        const SizedBox(height: 6),
        PrimaryButton('Submit report', icon: Icons.send_rounded,
          onPressed: () => Navigator.popUntil(context, (r) => r.isFirst)),
      ]),
    );
  }
}

// ---------------- Task history ----------------
class RiderHistoryScreen extends StatelessWidget {
  const RiderHistoryScreen({super.key});
  @override
  Widget build(BuildContext context) {
    const items = [
      ('TSK-8830', 'Marie Dubois', 'Delivered', AppColors.primary, Icons.check_circle_rounded, '\$149'),
      ('TSK-8829', 'Warehouse pickup', 'Completed', AppColors.primary, Icons.check_circle_rounded, '—'),
      ('TSK-8825', 'Paul Kabeya', 'Failed · absent', AppColors.danger, Icons.cancel_rounded, '\$0'),
      ('TSK-8820', 'Sophie Laurent', 'Delivered', AppColors.primary, Icons.check_circle_rounded, '\$62'),
    ];
    return Scaffold(
      appBar: backAppBar(context, 'Task history'),
      body: ListView.separated(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
        itemCount: items.length,
        separatorBuilder: (_, __) => const SizedBox(height: 10),
        itemBuilder: (_, i) {
          final h = items[i];
          return SurfaceCard(padding: const EdgeInsets.all(14), child: Row(children: [
            Container(height: 42, width: 42, decoration: BoxDecoration(color: h.$4.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(12)), child: Icon(h.$5, color: h.$4, size: 21)),
            const SizedBox(width: 12),
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(h.$2, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14)),
              Text('${h.$1} · ${h.$3}', style: const TextStyle(color: AppColors.muted, fontSize: 12.5)),
            ])),
            Text(h.$6, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14)),
          ]));
        },
      ),
    );
  }
}

// ---------------- Notifications ----------------
class RiderNotificationsScreen extends StatelessWidget {
  const RiderNotificationsScreen({super.key});
  @override
  Widget build(BuildContext context) {
    const items = [
      (Icons.assignment_rounded, AppColors.primary, 'New task assigned', 'TSK-8841 · Gombe · 2 items', '1m', true),
      (Icons.route_rounded, AppColors.info, 'Route re-optimized', 'Your next 3 stops were reordered.', '12m', true),
      (Icons.inventory_2_rounded, AppColors.accent, 'Pickup ready', 'Warehouse batch BAT-204 is ready.', '1h', false),
      (Icons.star_rounded, AppColors.accent, 'New 5★ rating', 'Marie rated your delivery 5 stars.', '3h', false),
    ];
    return Scaffold(
      appBar: backAppBar(context, 'Notifications'),
      body: ListView.separated(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
        itemCount: items.length,
        separatorBuilder: (_, __) => const SizedBox(height: 10),
        itemBuilder: (_, i) {
          final n = items[i];
          return SurfaceCard(padding: const EdgeInsets.all(14), child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Container(height: 42, width: 42, decoration: BoxDecoration(color: n.$2.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(12)), child: Icon(n.$1, color: n.$2, size: 21)),
            const SizedBox(width: 12),
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                Expanded(child: Text(n.$3, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14))),
                Text(n.$5, style: const TextStyle(color: AppColors.faint, fontSize: 11.5)),
              ]),
              const SizedBox(height: 3),
              Text(n.$4, style: const TextStyle(color: AppColors.muted, fontSize: 12.5, height: 1.3)),
            ])),
            if (n.$6) Container(margin: const EdgeInsets.only(left: 8, top: 4), height: 8, width: 8, decoration: const BoxDecoration(color: AppColors.primary, shape: BoxShape.circle)),
          ]));
        },
      ),
    );
  }
}
