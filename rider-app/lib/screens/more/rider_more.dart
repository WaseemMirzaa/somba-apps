import 'package:flutter/material.dart';
import '../../data/mock_tasks.dart';
import '../../theme/app_theme.dart';
import '../../widgets/ui.dart';

// ---------------- Login / First password ----------------
class RiderLoginScreen extends StatelessWidget {
  const RiderLoginScreen({super.key});
  @override
  Widget build(BuildContext context) {
    final top = MediaQuery.of(context).padding.top;
    return Scaffold(
      body: ListView(padding: EdgeInsets.zero, children: [
        Container(
          padding: EdgeInsets.fromLTRB(24, top + 44, 24, 40),
          decoration: const BoxDecoration(gradient: AppColors.brandGradient, borderRadius: BorderRadius.vertical(bottom: Radius.circular(32))),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Container(height: 54, width: 54, decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(16)),
              child: const Icon(Icons.two_wheeler_rounded, color: AppColors.primary, size: 30)),
            const SizedBox(height: 18),
            const Text('Rider sign in', style: TextStyle(color: Colors.white, fontSize: 26, fontWeight: FontWeight.w800, fontFamily: 'PlusJakartaSans', letterSpacing: -0.5)),
            const SizedBox(height: 6),
            Text('Set your password on first login', style: TextStyle(color: Colors.white.withValues(alpha: 0.9), fontSize: 14)),
          ]),
        ),
        Padding(padding: const EdgeInsets.all(20), child: Column(children: const [
          _Field(label: 'Rider ID', hint: 'RDR-001', icon: Icons.badge_outlined),
          SizedBox(height: 16),
          _Field(label: 'New password', hint: 'Create a password', icon: Icons.lock_outline_rounded, obscure: true),
          SizedBox(height: 16),
          _Field(label: 'Confirm password', hint: 'Re-enter password', icon: Icons.lock_reset_rounded, obscure: true),
          SizedBox(height: 22),
          PrimaryButton('Set password & continue', icon: Icons.arrow_forward_rounded),
        ])),
      ]),
    );
  }
}

class _Field extends StatelessWidget {
  final String label, hint;
  final IconData icon;
  final bool obscure;
  const _Field({required this.label, required this.hint, required this.icon, this.obscure = false});
  @override
  Widget build(BuildContext context) {
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(label, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13, color: AppColors.inkSoft)),
      const SizedBox(height: 6),
      TextField(obscureText: obscure, decoration: InputDecoration(
        hintText: hint, prefixIcon: Icon(icon, size: 20),
        filled: true, fillColor: AppColors.surface,
        enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: const BorderSide(color: AppColors.line)),
        focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: const BorderSide(color: AppColors.primary, width: 1.6)),
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: const BorderSide(color: AppColors.line)),
      )),
    ]);
  }
}

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
            child: IconButton(icon: const Icon(Icons.call_rounded, color: AppColors.primary), onPressed: () {})),
        ])),
        if (t.codAmount != null) ...[
          const SizedBox(height: 12),
          Container(padding: const EdgeInsets.all(16), decoration: BoxDecoration(gradient: AppColors.cashGradient, borderRadius: BorderRadius.circular(18)),
            child: Row(children: [
              const Icon(Icons.payments_rounded, color: Colors.white),
              const SizedBox(width: 10),
              const Expanded(child: Text('Collect cash on delivery', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w700))),
              Text('\$${t.codAmount!.toStringAsFixed(2)}', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 18)),
            ])),
        ],
        const SizedBox(height: 12),
        SurfaceCard(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Text('Handover checklist', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 14.5)),
          const SizedBox(height: 10),
          _check('Verify customer identity', true),
          _check(t.openBox ? 'Open-box: let customer inspect' : 'Confirm package sealed', t.openBox),
          _check('Capture proof of delivery', false),
        ])),
        const SizedBox(height: 16),
        PrimaryButton('Navigate', icon: Icons.navigation_rounded),
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

// ---------------- Proof of delivery ----------------
class PodScreen extends StatelessWidget {
  final RiderTask task;
  const PodScreen({super.key, required this.task});
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: backAppBar(context, 'Proof of delivery'),
      body: ListView(padding: const EdgeInsets.fromLTRB(16, 8, 16, 24), children: [
        SurfaceCard(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Text('Photo of delivery', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 14.5)),
          const SizedBox(height: 10),
          Container(height: 130, decoration: BoxDecoration(color: AppColors.background, borderRadius: BorderRadius.circular(16), border: Border.all(color: AppColors.line)),
            child: const Column(mainAxisAlignment: MainAxisAlignment.center, children: [
              Icon(Icons.add_a_photo_rounded, color: AppColors.primary, size: 30),
              SizedBox(height: 8),
              Text('Tap to capture', style: TextStyle(color: AppColors.muted, fontWeight: FontWeight.w600, fontSize: 12.5)),
            ])),
        ])),
        const SizedBox(height: 12),
        SurfaceCard(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Text('Signature', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 14.5)),
          const SizedBox(height: 10),
          Container(height: 90, decoration: BoxDecoration(color: AppColors.background, borderRadius: BorderRadius.circular(16), border: Border.all(color: AppColors.line)),
            child: CustomPaint(painter: _SignPainter(), child: const SizedBox.expand())),
        ])),
        const SizedBox(height: 12),
        SurfaceCard(child: Row(children: [
          const Icon(Icons.pin_rounded, color: AppColors.primary),
          const SizedBox(width: 10),
          const Expanded(child: Text('Delivery OTP verified', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 13.5))),
          Pill('4821', color: AppColors.primary.withValues(alpha: 0.12), textColor: AppColors.primary),
        ])),
        if (task.codAmount != null) ...[
          const SizedBox(height: 12),
          SurfaceCard(child: Row(children: [
            Container(height: 40, width: 40, decoration: BoxDecoration(color: AppColors.accent.withValues(alpha: 0.16), borderRadius: BorderRadius.circular(12)), child: const Icon(Icons.payments_rounded, color: Color(0xFFB45309))),
            const SizedBox(width: 12),
            const Expanded(child: Text('Cash collected', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 13.5))),
            Text('\$${task.codAmount!.toStringAsFixed(2)}', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
            const SizedBox(width: 8),
            const Icon(Icons.check_circle_rounded, color: AppColors.primary),
          ])),
        ],
        const SizedBox(height: 18),
        PrimaryButton('Complete delivery', icon: Icons.check_rounded,
          onPressed: () => Navigator.popUntil(context, (r) => r.isFirst)),
      ]),
    );
  }
}

class _SignPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final p = Paint()..color = AppColors.ink..style = PaintingStyle.stroke..strokeWidth = 2.5..strokeCap = StrokeCap.round;
    final path = Path()
      ..moveTo(size.width * 0.15, size.height * 0.6)
      ..cubicTo(size.width * 0.3, size.height * 0.1, size.width * 0.38, size.height * 0.95, size.width * 0.5, size.height * 0.5)
      ..cubicTo(size.width * 0.62, size.height * 0.1, size.width * 0.72, size.height * 0.9, size.width * 0.88, size.height * 0.4);
    canvas.drawPath(path, p);
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
  final _reasons = ['Customer not available', 'Wrong / incomplete address', 'Customer refused delivery', 'Unable to collect COD', 'Damaged package'];
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
      (Icons.assignment_rounded, AppColors.primary, 'New task assigned', 'TSK-8841 · Gombe · COD \$149', '1m', true),
      (Icons.route_rounded, AppColors.info, 'Route re-optimized', 'Your next 3 stops were reordered.', '12m', true),
      (Icons.payments_rounded, AppColors.accent, 'COD remittance due', 'Deposit \$420 at the hub by 6 PM.', '1h', false),
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
