import 'package:flutter/material.dart';
import '../../data/mock_tasks.dart';
import '../../theme/app_theme.dart';
import '../../widgets/ui.dart';
import '../../l10n/strings.dart';
import 'rider_more3.dart';

// ---------------- Task detail (full screen) ----------------
class TaskDetailScreen extends StatelessWidget {
  final RiderTask task;
  const TaskDetailScreen({super.key, required this.task});
  @override
  Widget build(BuildContext context) {
    final t = task;
    final isDelivery = t.type == 'delivery';
    final isZone = t.type == 'zone';
    final isPickup = t.type == 'pickup' || t.type == 'return';
    return Scaffold(
      appBar: backAppBar(context, t.id),
      body: ListView(padding: const EdgeInsets.fromLTRB(16, 8, 16, 24), children: [
        // Task nature banner — makes the job type explicit.
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(color: t.color.withValues(alpha: 0.10), borderRadius: BorderRadius.circular(18), border: Border.all(color: t.color.withValues(alpha: 0.35))),
          child: Row(children: [
            Container(height: 46, width: 46, decoration: BoxDecoration(color: t.color.withValues(alpha: 0.16), borderRadius: BorderRadius.circular(14)), child: Icon(t.icon, color: t.color)),
            const SizedBox(width: 12),
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(tr(context, t.natureLabel), style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15, color: t.color)),
              const SizedBox(height: 2),
              Text(t.natureDetailL(Localizations.localeOf(context).languageCode), style: const TextStyle(color: AppColors.inkSoft, fontSize: 12.5, height: 1.3)),
            ])),
          ]),
        ),
        const SizedBox(height: 12),
        SurfaceCard(child: Row(children: [
          Container(height: 48, width: 48, decoration: BoxDecoration(color: t.color.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(14)), child: Icon(t.icon, color: t.color)),
          const SizedBox(width: 12),
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(t.customer, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
            Text('${tr(context, t.typeLabel)} · ${t.batch} ${tr(context, t.batch > 1 ? 'parcels' : 'parcel')}${t.isBatch ? ' (${tr(context, 'batch')})' : ''}', style: const TextStyle(color: AppColors.muted, fontSize: 12.5)),
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
              onPressed: () => ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('${tr(context, 'Calling')} ${t.customer}…'))))),
          const SizedBox(width: 8),
          Container(decoration: BoxDecoration(color: AppColors.primary.withValues(alpha: 0.10), borderRadius: BorderRadius.circular(12)),
            child: IconButton(icon: const Icon(Icons.chat_bubble_rounded, color: AppColors.primary),
              onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => ChatScreen(name: t.customer))))),
        ])),
        const SizedBox(height: 12),
        SurfaceCard(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(isDelivery ? tr(context, 'Handover checklist') : (isZone ? tr(context, 'Transfer checklist') : tr(context, 'Pickup checklist')), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14.5)),
          const SizedBox(height: 10),
          if (isDelivery) ...[
            _check(tr(context, 'Verify customer identity'), true),
            _check(t.openBox ? tr(context, 'Open-box: let customer inspect') : tr(context, 'Confirm package sealed'), t.openBox),
            _check(tr(context, 'Capture proof of delivery'), false),
          ] else if (isZone) ...[
            _check('${tr(context, 'Load & batch-scan')} ${t.batch} ${tr(context, 'parcels')}', false),
            _check('${tr(context, 'Batch-scan on arrival at')} ${tr(context, t.destination)}', false),
            _check(tr(context, 'Receiving document signed'), false),
          ] else ...[
            _check('${tr(context, 'Collect')} ${t.batch} ${tr(context, 'parcels at')} ${tr(context, t.origin)}', false),
            _check(tr(context, 'Batch-scan every parcel'), false),
            _check(tr(context, 'Confirm pickup complete'), false),
          ],
        ])),
        const SizedBox(height: 16),
        PrimaryButton(tr(context, 'Navigate'), icon: Icons.navigation_rounded,
            onPressed: () => ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(tr(context, 'Opening turn-by-turn navigation…'))))),
        const SizedBox(height: 10),
        if (isDelivery)
          Row(children: [
            Expanded(child: FilledButton.icon(
              style: FilledButton.styleFrom(backgroundColor: AppColors.primary),
              onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => PodScreen(task: t))),
              icon: const Icon(Icons.check_circle_rounded, size: 20), label: Text(t.isBatch ? tr(context, 'Deliver batch') : tr(context, 'Deliver')))),
            const SizedBox(width: 10),
            Expanded(child: OutlinedButton.icon(
              style: OutlinedButton.styleFrom(foregroundColor: AppColors.danger, side: const BorderSide(color: AppColors.danger, width: 1.5)),
              onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const FailedDeliveryScreen())),
              icon: const Icon(Icons.report_gmailerrorred_rounded, size: 20), label: Text(tr(context, 'Failed')))),
          ])
        else if (isZone)
          PrimaryButton(tr(context, 'Batch scan & handover'), icon: Icons.qr_code_scanner_rounded,
              onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => BatchScanScreen(task: t, zone: true))))
        else if (isPickup)
          PrimaryButton(tr(context, 'Scan & confirm pickup'), icon: Icons.qr_code_scanner_rounded,
              onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => BatchScanScreen(task: t, zone: false)))),
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
      appBar: backAppBar(context, tr(context, 'Proof of delivery')),
      body: ListView(padding: const EdgeInsets.fromLTRB(16, 8, 16, 24), children: [
        // Photo capture (mock).
        SurfaceCard(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(tr(context, 'Photo of delivery'), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14.5)),
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
                  ? Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                      const Icon(Icons.check_circle_rounded, color: Colors.white, size: 32),
                      const SizedBox(height: 8),
                      Text(tr(context, 'Photo captured — tap to retake'), style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 12.5)),
                    ])
                  : _dashed(Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                      const Icon(Icons.add_a_photo_rounded, color: AppColors.primary, size: 30),
                      const SizedBox(height: 8),
                      Text(tr(context, 'Tap to capture'), style: const TextStyle(color: AppColors.muted, fontWeight: FontWeight.w600, fontSize: 12.5)),
                    ])),
            ),
          ),
        ])),
        const SizedBox(height: 12),
        // Signature pad (dependency-free).
        SurfaceCard(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Text(tr(context, 'Signature'), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14.5)),
            const Spacer(),
            if (_signed)
              TextButton.icon(
                onPressed: () => setState(() => _strokes.clear()),
                icon: const Icon(Icons.refresh_rounded, size: 16),
                style: TextButton.styleFrom(foregroundColor: AppColors.muted, padding: EdgeInsets.zero),
                label: Text(tr(context, 'Clear')),
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
                      : Center(child: Text(tr(context, 'Sign here'), style: const TextStyle(color: AppColors.faint, fontWeight: FontWeight.w600))),
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
          Expanded(child: Text(_otp ? tr(context, 'Delivery OTP verified') : tr(context, 'Verify delivery OTP'), style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13.5))),
          _otp
              ? Pill('4821', color: AppColors.primary.withValues(alpha: 0.12), textColor: AppColors.primary)
              : FilledButton(
                  style: FilledButton.styleFrom(backgroundColor: AppColors.primary, minimumSize: const Size(0, 38), padding: const EdgeInsets.symmetric(horizontal: 14)),
                  onPressed: () => setState(() => _otp = true),
                  child: Text(tr(context, 'Verify'))),
        ])),
        const SizedBox(height: 18),
        PrimaryButton(tr(context, 'Complete delivery'),
            icon: Icons.check_rounded,
            onPressed: _canComplete
                ? () {
                    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('${widget.task.id} ${tr(context, 'delivered')} ✓')));
                    Navigator.popUntil(context, (r) => r.isFirst);
                  }
                : null),
        if (!_canComplete)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Center(child: Text(tr(context, 'Capture a photo and signature to complete'), style: const TextStyle(color: AppColors.faint, fontSize: 11.5))),
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
      appBar: backAppBar(context, tr(context, 'Report a problem')),
      body: ListView(padding: const EdgeInsets.fromLTRB(16, 8, 16, 24), children: [
        Padding(padding: const EdgeInsets.fromLTRB(4, 4, 4, 10), child: Text(tr(context, 'Why did the delivery fail?'), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15))),
        ...List.generate(_reasons.length, (i) {
          final sel = _reason == i;
          return Padding(padding: const EdgeInsets.only(bottom: 10), child: GestureDetector(
            onTap: () => setState(() => _reason = i),
            child: SurfaceCard(padding: const EdgeInsets.all(14), child: Row(children: [
              Icon(sel ? Icons.radio_button_checked_rounded : Icons.radio_button_unchecked_rounded, color: sel ? AppColors.primary : AppColors.faint),
              const SizedBox(width: 12),
              Expanded(child: Text(tr(context, _reasons[i]), style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13.5, color: sel ? AppColors.ink : AppColors.inkSoft))),
            ])),
          ));
        }),
        const SizedBox(height: 6),
        PrimaryButton(tr(context, 'Submit report'), icon: Icons.send_rounded,
          onPressed: () => Navigator.popUntil(context, (r) => r.isFirst)),
      ]),
    );
  }
}

// ---------------- Batch scan (pickup / zone transfer) ----------------
class BatchScanScreen extends StatefulWidget {
  final RiderTask task;
  final bool zone; // zone transfer needs a receiving-document signature
  const BatchScanScreen({super.key, required this.task, required this.zone});
  @override
  State<BatchScanScreen> createState() => _BatchScanScreenState();
}

class _BatchScanScreenState extends State<BatchScanScreen> {
  int _scanned = 0;
  final List<List<Offset>> _strokes = [];

  bool get _allScanned => _scanned >= widget.task.batch;
  bool get _signed => _strokes.any((s) => s.length > 1);

  @override
  Widget build(BuildContext context) {
    final t = widget.task;
    return Scaffold(
      appBar: backAppBar(context, widget.zone ? tr(context, 'Batch handover') : tr(context, 'Scan pickup')),
      body: ListView(padding: const EdgeInsets.fromLTRB(16, 8, 16, 24), children: [
        SurfaceCard(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Expanded(child: Text(tr(context, 'Batch scan'), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15))),
            Pill('$_scanned / ${t.batch}', color: AppColors.primary.withValues(alpha: 0.12), textColor: AppColors.primary),
          ]),
          const SizedBox(height: 6),
          Text(widget.zone ? '${tr(context, t.origin)} → ${tr(context, t.destination)}' : '${tr(context, 'Collect at')} ${tr(context, t.origin)}', style: const TextStyle(color: AppColors.muted, fontSize: 12.5)),
          const SizedBox(height: 12),
          ClipRRect(borderRadius: BorderRadius.circular(100), child: LinearProgressIndicator(value: t.batch == 0 ? 0 : _scanned / t.batch, minHeight: 8, backgroundColor: AppColors.line, color: AppColors.primary)),
          const SizedBox(height: 14),
          Wrap(spacing: 8, runSpacing: 8, children: List.generate(t.batch, (i) {
            final done = i < _scanned;
            return Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
              decoration: BoxDecoration(color: done ? AppColors.primary.withValues(alpha: 0.12) : AppColors.background, borderRadius: BorderRadius.circular(10), border: Border.all(color: done ? AppColors.primary : AppColors.line)),
              child: Row(mainAxisSize: MainAxisSize.min, children: [
                Icon(done ? Icons.check_circle_rounded : Icons.qr_code_2_rounded, size: 14, color: done ? AppColors.primary : AppColors.faint),
                const SizedBox(width: 4),
                Text('P${i + 1}', style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w700, color: done ? AppColors.primary : AppColors.muted)),
              ]),
            );
          })),
        ])),
        const SizedBox(height: 12),
        if (!_allScanned)
          PrimaryButton('${tr(context, 'Scan parcel')} ${_scanned + 1}', icon: Icons.qr_code_scanner_rounded,
              onPressed: () => setState(() => _scanned++))
        else if (widget.zone) ...[
          SurfaceCard(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              Expanded(child: Text(tr(context, 'Receiving document'), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14.5))),
              if (_signed) TextButton.icon(onPressed: () => setState(() => _strokes.clear()), icon: const Icon(Icons.refresh_rounded, size: 16), style: TextButton.styleFrom(foregroundColor: AppColors.muted, padding: EdgeInsets.zero), label: Text(tr(context, 'Clear'))),
            ]),
            const SizedBox(height: 4),
            Text('${tr(context, 'Receiver at')} ${tr(context, t.destination)} ${tr(context, 'signs to confirm')} ${t.batch} ${tr(context, 'parcels received.')}', style: const TextStyle(color: AppColors.muted, fontSize: 12.5)),
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
                    child: _signed ? const SizedBox.expand() : Center(child: Text(tr(context, 'Receiver signs here'), style: const TextStyle(color: AppColors.faint, fontWeight: FontWeight.w600))),
                  ),
                ),
              ),
            ),
          ])),
          const SizedBox(height: 14),
          PrimaryButton(tr(context, 'Confirm handover'), icon: Icons.check_rounded,
              onPressed: _signed
                  ? () {
                      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('${t.id}: ${t.batch} ${tr(context, 'parcels handed over')} ✓')));
                      Navigator.popUntil(context, (r) => r.isFirst);
                    }
                  : null),
        ] else
          PrimaryButton(tr(context, 'Confirm pickup complete'), icon: Icons.check_rounded, onPressed: () {
            ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('${t.id}: ${t.batch} ${tr(context, 'parcels picked up')} ✓')));
            Navigator.popUntil(context, (r) => r.isFirst);
          }),
      ]),
    );
  }
}

// ---------------- Task history ----------------
class RiderHistoryScreen extends StatelessWidget {
  const RiderHistoryScreen({super.key});
  @override
  Widget build(BuildContext context) {
    final items = [
      ('TSK-8830', 'Marie Dubois · Gombe', tr(context, 'Delivered · 3 parcels'), AppColors.primary, Icons.check_circle_rounded, '10:24'),
      ('TSK-8829', tr(context, 'Warehouse pickup'), tr(context, 'Completed · 6 parcels'), AppColors.primary, Icons.warehouse_rounded, '09:50'),
      ('TSK-8827', 'Gombe → Limete hub', tr(context, 'Zone transfer · 12 parcels'), AppColors.info, Icons.swap_horiz_rounded, '09:05'),
      ('TSK-8825', 'Paul Kabeya · Lemba', tr(context, 'Failed · absent'), AppColors.danger, Icons.cancel_rounded, '08:32'),
      ('TSK-8820', 'Sophie Laurent · Ngaba', tr(context, 'Delivered · 1 parcel'), AppColors.primary, Icons.check_circle_rounded, '08:10'),
      ('TSK-8814', tr(context, 'Batch · 4 sellers'), tr(context, 'Delivered · 5 parcels'), AppColors.primary, Icons.check_circle_rounded, 'Yesterday'),
    ];
    return Scaffold(
      appBar: backAppBar(context, tr(context, 'Task history')),
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
            Text(tr(context, h.$6), style: const TextStyle(color: AppColors.faint, fontWeight: FontWeight.w600, fontSize: 12.5)),
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
    final items = [
      (Icons.local_shipping_rounded, AppColors.primary, tr(context, 'New batch assigned'), 'TSK-8841 · 3 parcels · 2 sellers · Gombe', '1m', true),
      (Icons.swap_horiz_rounded, AppColors.info, tr(context, 'Zone transfer assigned'), 'TSK-8843 · Gombe → Limete hub · 12 parcels', '6m', true),
      (Icons.route_rounded, AppColors.info, tr(context, 'Route re-optimized'), tr(context, 'Your next 3 stops were reordered.'), '12m', true),
      (Icons.warehouse_rounded, AppColors.accent, tr(context, 'Pickup ready'), 'Warehouse batch BAT-204 (6 parcels) is ready.', '1h', false),
      (Icons.star_rounded, AppColors.accent, tr(context, 'New 5★ rating'), tr(context, 'Marie rated your delivery 5 stars.'), '3h', false),
      (Icons.description_rounded, AppColors.info, tr(context, 'Document reminder'), tr(context, 'Roadworthiness renewal due in 21 days.'), '1d', false),
    ];
    return Scaffold(
      appBar: backAppBar(context, tr(context, 'Notifications')),
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
