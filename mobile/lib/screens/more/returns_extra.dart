import 'package:flutter/material.dart';
import '../../services/models.dart';
import '../../services/realtime_store.dart';
import '../../theme/app_theme.dart';
import '../../util/format.dart';
import '../../widgets/kit.dart';

/// A return / dispute request as returned by `disputes:list`.
class ReturnView {
  final String id;
  final String reference;
  final String orderId;
  final String orderReference;
  final String type;
  final String reason;
  final String status; // open | resolved | rejected
  final String? resolution;

  ReturnView({
    required this.id,
    required this.reference,
    required this.orderId,
    required this.orderReference,
    required this.type,
    required this.reason,
    required this.status,
    this.resolution,
  });

  factory ReturnView.fromJson(Map<String, dynamic> j) => ReturnView(
        id: j['id'] as String,
        reference: j['reference'] as String? ?? '',
        orderId: j['orderId'] as String? ?? '',
        orderReference: j['orderReference'] as String? ?? '',
        type: j['type'] as String? ?? 'dispute',
        reason: j['reason'] as String? ?? '',
        status: j['status'] as String? ?? 'open',
        resolution: j['resolution'] as String?,
      );

  Color get color => switch (status) { 'resolved' => AppColors.success, 'rejected' => AppColors.danger, _ => AppColors.amber };
  String get label => switch (status) { 'resolved' => 'Resolved', 'rejected' => 'Declined', _ => 'Under review' };
}

/// Ask for a return (or raise a problem) on a delivered order. One request per
/// order; the team reviews it and any refund goes to the customer's wallet.
class ReturnRequestScreen extends StatefulWidget {
  final Locale locale;
  final OrderDto order;
  const ReturnRequestScreen({super.key, this.locale = const Locale('en'), required this.order});
  @override
  State<ReturnRequestScreen> createState() => _ReturnRequestScreenState();
}

class _ReturnRequestScreenState extends State<ReturnRequestScreen> {
  int _reason = 0;
  final _details = TextEditingController();
  bool _busy = false;
  String? _err;
  static const _reasons = ['Damaged / defective', 'Wrong item received', 'Not as described', 'No longer needed', 'Other'];

  @override
  void dispose() {
    _details.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() {
      _busy = true;
      _err = null;
    });
    final text = _details.text.trim();
    try {
      final res = await RealtimeStore.instance.call('disputes:open', {
        'orderId': widget.order.id,
        'type': 'return',
        'reason': '${_reasons[_reason]}${text.isEmpty ? '' : ' — $text'}',
      });
      if (!mounted) return;
      Navigator.pushReplacement(
        context,
        MaterialPageRoute(builder: (_) => ReturnStatusScreen(locale: widget.locale, returnRequest: ReturnView.fromJson((res as Map).map((k, v) => MapEntry(k.toString(), v))))),
      );
    } catch (e) {
      if (mounted) {
        setState(() {
          _busy = false;
          _err = e.toString();
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final o = widget.order;
    return Scaffold(
      appBar: backAppBar(context, 'Return · ${o.reference}'),
      body: ListView(padding: const EdgeInsets.fromLTRB(16, 8, 16, 24), children: [
        Panel(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Text('Your order', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
          const SizedBox(height: 8),
          for (final i in o.items)
            Padding(
              padding: const EdgeInsets.only(bottom: 6),
              child: Row(children: [
                Expanded(child: Text('${i.qty} × ${i.productName}', maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 13))),
                Text(money(i.priceUsd * i.qty), style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
              ]),
            ),
        ])),
        const SizedBox(height: 16),
        const Text('What went wrong?', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
        const SizedBox(height: 10),
        for (var i = 0; i < _reasons.length; i++)
          Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: GestureDetector(
              onTap: () => setState(() => _reason = i),
              child: Panel(
                  padding: const EdgeInsets.all(14),
                  child: Row(children: [
                    Icon(_reason == i ? Icons.radio_button_checked_rounded : Icons.radio_button_unchecked_rounded, color: _reason == i ? AppColors.primary : AppColors.faint),
                    const SizedBox(width: 12),
                    Expanded(child: Text(_reasons[i], style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13.5, color: _reason == i ? AppColors.ink : AppColors.inkSoft))),
                  ])),
            ),
          ),
        const SizedBox(height: 6),
        TextField(
          key: const ValueKey('return-details'),
          controller: _details,
          maxLines: 3,
          decoration: InputDecoration(labelText: 'Tell us more (optional)', errorText: _err, alignLabelWithHint: true),
        ),
        const SizedBox(height: 12),
        const Text('If approved, the refund is added to your Somba&Teka wallet.', style: TextStyle(color: AppColors.muted, fontSize: 12.5)),
        const SizedBox(height: 16),
        PrimaryButton(_busy ? '…' : 'Submit return request', icon: Icons.assignment_return_rounded, onPressed: _busy ? null : _submit),
      ]),
    );
  }
}

/// One return request and its outcome.
class ReturnStatusScreen extends StatelessWidget {
  final Locale locale;
  final ReturnView returnRequest;
  const ReturnStatusScreen({super.key, this.locale = const Locale('en'), required this.returnRequest});

  @override
  Widget build(BuildContext context) {
    final r = returnRequest;
    return Scaffold(
      appBar: backAppBar(context, r.reference),
      body: ListView(padding: const EdgeInsets.fromLTRB(16, 8, 16, 24), children: [
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(color: r.color.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(20)),
          child: Row(children: [
            Icon(r.status == 'resolved' ? Icons.check_circle_rounded : (r.status == 'rejected' ? Icons.cancel_rounded : Icons.hourglass_top_rounded), color: r.color, size: 28),
            const SizedBox(width: 12),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(r.label, key: const ValueKey('return-status'), style: TextStyle(color: r.color, fontWeight: FontWeight.w800, fontSize: 16)),
                Text(
                  r.status == 'open' ? 'Our team is reviewing your request.' : (r.resolution ?? ''),
                  style: const TextStyle(color: AppColors.inkSoft, fontSize: 12.5),
                ),
              ]),
            ),
          ]),
        ),
        const SizedBox(height: 16),
        Panel(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          _kv('Order', r.orderReference),
          const SizedBox(height: 8),
          _kv('Type', r.type == 'return' ? 'Return' : 'Dispute'),
          const Divider(height: 22),
          const Text('Your message', style: TextStyle(color: AppColors.muted, fontSize: 12.5)),
          const SizedBox(height: 4),
          Text(r.reason, style: const TextStyle(fontSize: 13.5, height: 1.4)),
        ])),
      ]),
    );
  }

  Widget _kv(String k, String v) => Row(children: [
        Text(k, style: const TextStyle(color: AppColors.muted, fontSize: 13)),
        const Spacer(),
        Text(v, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
      ]);
}

/// All of the customer's returns and disputes.
class ReturnsListScreen extends StatefulWidget {
  final Locale locale;
  const ReturnsListScreen({super.key, this.locale = const Locale('en')});
  @override
  State<ReturnsListScreen> createState() => _ReturnsListScreenState();
}

class _ReturnsListScreenState extends State<ReturnsListScreen> {
  late final Future<List<ReturnView>> _future = RealtimeStore.instance
      .call('disputes:list')
      .then((rows) => (rows as List).map((e) => ReturnView.fromJson((e as Map).map((k, v) => MapEntry(k.toString(), v)))).toList());

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: backAppBar(context, 'Returns & refunds'),
      body: FutureBuilder<List<ReturnView>>(
        future: _future,
        builder: (context, snap) {
          if (snap.connectionState != ConnectionState.done) return const Center(child: CircularProgressIndicator());
          if (snap.hasError) return Center(child: Text('${snap.error}', style: const TextStyle(color: AppColors.muted)));
          final rows = snap.data ?? const <ReturnView>[];
          if (rows.isEmpty) {
            return const Center(child: Text('No returns yet. Open a delivered order to start one.', style: TextStyle(color: AppColors.muted)));
          }
          return ListView.separated(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
            itemCount: rows.length,
            separatorBuilder: (_, __) => const SizedBox(height: 12),
            itemBuilder: (_, i) {
              final r = rows[i];
              return GestureDetector(
                onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => ReturnStatusScreen(locale: widget.locale, returnRequest: r))),
                child: Panel(
                    child: Row(children: [
                  Expanded(
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(r.reference, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14)),
                    Text('Order ${r.orderReference}', style: const TextStyle(color: AppColors.muted, fontSize: 12.5)),
                  ])),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                    decoration: BoxDecoration(color: r.color.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(100)),
                    child: Text(r.label, style: TextStyle(color: r.color, fontSize: 11.5, fontWeight: FontWeight.w700)),
                  ),
                ])),
              );
            },
          );
        },
      ),
    );
  }
}
