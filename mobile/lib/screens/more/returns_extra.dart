import 'package:flutter/material.dart';
import '../../data/mock_data.dart';
import '../../theme/app_theme.dart';
import '../../util/format.dart';
import '../../widgets/kit.dart';
import '../../widgets/product_image.dart';

class ReturnRequestScreen extends StatefulWidget {
  final Locale locale;
  const ReturnRequestScreen({super.key, this.locale = const Locale('en')});
  @override
  State<ReturnRequestScreen> createState() => _ReturnRequestScreenState();
}

class _ReturnRequestScreenState extends State<ReturnRequestScreen> {
  int _reason = 0;
  int _refund = 0;
  final _reasons = ['Damaged / defective', 'Wrong item received', 'No longer needed', 'Better price elsewhere'];
  final _refunds = ['Somba Wallet (instant)', 'Original payment method', 'Bank transfer'];

  @override
  Widget build(BuildContext context) {
    final p = products.first;
    return Scaffold(
      appBar: backAppBar(context, 'Return item'),
      body: ListView(padding: const EdgeInsets.fromLTRB(16, 8, 16, 24), children: [
        Panel(child: Row(children: [
          ClipRRect(borderRadius: BorderRadius.circular(12), child: SizedBox(height: 56, width: 56, child: ProductImage(product: p, iconSize: 24))),
          const SizedBox(width: 12),
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(p.displayName(widget.locale.languageCode), maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13.5)),
            Text(money(p.price), style: const TextStyle(color: AppColors.muted, fontSize: 12.5)),
          ])),
        ])),
        const SizedBox(height: 18),
        const Text('Reason for return', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
        const SizedBox(height: 10),
        ..._pick(_reasons, _reason, (i) => setState(() => _reason = i)),
        const SizedBox(height: 18),
        const Text('Refund to', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
        const SizedBox(height: 10),
        ..._pick(_refunds, _refund, (i) => setState(() => _refund = i)),
        const SizedBox(height: 8),
        const PrimaryButton('Submit return', icon: Icons.assignment_return_rounded),
      ]),
    );
  }

  List<Widget> _pick(List<String> items, int sel, ValueChanged<int> onTap) => List.generate(items.length, (i) => Padding(
        padding: const EdgeInsets.only(bottom: 10),
        child: GestureDetector(onTap: () => onTap(i), child: Panel(padding: const EdgeInsets.all(14), child: Row(children: [
          Icon(sel == i ? Icons.radio_button_checked_rounded : Icons.radio_button_unchecked_rounded, color: sel == i ? AppColors.primary : AppColors.faint),
          const SizedBox(width: 12),
          Expanded(child: Text(items[i], style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13.5, color: sel == i ? AppColors.ink : AppColors.inkSoft))),
        ])))),
      );
}

class ReturnStatusScreen extends StatelessWidget {
  final Locale locale;
  const ReturnStatusScreen({super.key, this.locale = const Locale('en')});
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: backAppBar(context, 'Return RET-2026-118'),
      body: ListView(padding: const EdgeInsets.fromLTRB(16, 8, 16, 24), children: [
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(gradient: AppColors.brandGradient, borderRadius: BorderRadius.circular(20)),
          child: Row(children: const [
            Icon(Icons.replay_rounded, color: Colors.white, size: 28),
            SizedBox(width: 12),
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('Refund on the way', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 16)),
              SizedBox(height: 2),
              Text('\$349 to Somba Wallet · 1–2 days', style: TextStyle(color: Colors.white70, fontSize: 12.5)),
            ])),
          ]),
        ),
        const SizedBox(height: 16),
        Panel(child: const StatusTimeline([
          ('Return requested', 'Jun 28', true),
          ('Pickup scheduled', 'Rider assigned', true),
          ('Item collected', 'Jun 29', true),
          ('Quality check', 'At warehouse', true),
          ('Refund issued', 'Estimated Jul 2', false),
        ])),
      ]),
    );
  }
}

class ExchangeScreen extends StatefulWidget {
  final Locale locale;
  const ExchangeScreen({super.key, this.locale = const Locale('en')});
  @override
  State<ExchangeScreen> createState() => _ExchangeScreenState();
}

class _ExchangeScreenState extends State<ExchangeScreen> {
  int _size = 1;
  final _sizes = ['S', 'M', 'L', 'XL'];
  @override
  Widget build(BuildContext context) {
    final p = products.firstWhere((x) => x.category == 'Fashion', orElse: () => products.first);
    return Scaffold(
      appBar: backAppBar(context, 'Exchange item'),
      body: ListView(padding: const EdgeInsets.fromLTRB(16, 8, 16, 24), children: [
        Panel(child: Row(children: [
          ClipRRect(borderRadius: BorderRadius.circular(12), child: SizedBox(height: 56, width: 56, child: ProductImage(product: p, iconSize: 24))),
          const SizedBox(width: 12),
          Expanded(child: Text(p.displayName(widget.locale.languageCode), style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13.5))),
        ])),
        const SizedBox(height: 18),
        const Text('Exchange for a different size', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
        const SizedBox(height: 12),
        Wrap(spacing: 10, children: List.generate(_sizes.length, (i) {
          final sel = _size == i;
          return GestureDetector(onTap: () => setState(() => _size = i), child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
            decoration: BoxDecoration(color: sel ? AppColors.primary : AppColors.surface, borderRadius: BorderRadius.circular(14), border: Border.all(color: sel ? AppColors.primary : AppColors.line, width: 1.4)),
            child: Text(_sizes[i], style: TextStyle(color: sel ? Colors.white : AppColors.inkSoft, fontWeight: FontWeight.w700)),
          ));
        })),
        const SizedBox(height: 18),
        Panel(child: Row(children: const [
          Icon(Icons.info_outline_rounded, color: AppColors.primary, size: 20),
          SizedBox(width: 10),
          Expanded(child: Text('Free size exchange within 30 days. A rider will swap it at your door.', style: TextStyle(fontSize: 12.5, color: AppColors.inkSoft, height: 1.3))),
        ])),
        const SizedBox(height: 16),
        const PrimaryButton('Request exchange', icon: Icons.swap_horiz_rounded),
      ]),
    );
  }
}

class DisputeScreen extends StatelessWidget {
  final Locale locale;
  const DisputeScreen({super.key, this.locale = const Locale('en')});
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: backAppBar(context, 'Dispute DSP-4410'),
      body: Column(children: [
        Container(
          width: double.infinity,
          padding: const EdgeInsets.all(14),
          color: AppColors.amber.withValues(alpha: 0.12),
          child: Row(children: const [
            Icon(Icons.gavel_rounded, color: Color(0xFF92610A), size: 20),
            SizedBox(width: 10),
            Expanded(child: Text('Under review — our team responds within 24h.', style: TextStyle(color: Color(0xFF92610A), fontWeight: FontWeight.w600, fontSize: 12.5))),
          ]),
        ),
        Expanded(child: ListView(padding: const EdgeInsets.all(16), children: [
          _msg('You', 'Item arrived damaged. Requesting a replacement.', true),
          _msg('Support', "Thanks Marie — we've opened a dispute and asked the seller to respond.", false),
          _msg('Support', 'Please share a photo of the damage to speed things up.', false),
          _msg('You', 'Photo attached. 📷', true),
        ])),
        Padding(
          padding: EdgeInsets.fromLTRB(16, 8, 16, 12 + MediaQuery.of(context).padding.bottom),
          child: Row(children: [
            Expanded(child: Container(
              height: 48, padding: const EdgeInsets.symmetric(horizontal: 16),
              decoration: BoxDecoration(color: AppColors.surface, borderRadius: BorderRadius.circular(100), border: Border.all(color: AppColors.line)),
              child: const Align(alignment: Alignment.centerLeft, child: Text('Type a message…', style: TextStyle(color: AppColors.faint))),
            )),
            const SizedBox(width: 10),
            Container(height: 48, width: 48, decoration: const BoxDecoration(gradient: AppColors.brandGradient, shape: BoxShape.circle), child: const Icon(Icons.send_rounded, color: Colors.white, size: 20)),
          ]),
        ),
      ]),
    );
  }

  Widget _msg(String who, String text, bool me) => Align(
        alignment: me ? Alignment.centerRight : Alignment.centerLeft,
        child: Container(
          margin: const EdgeInsets.only(bottom: 10),
          padding: const EdgeInsets.all(12),
          constraints: const BoxConstraints(maxWidth: 280),
          decoration: BoxDecoration(
            color: me ? AppColors.primary : AppColors.surface,
            borderRadius: BorderRadius.circular(16),
            boxShadow: me ? null : AppShadow.card,
          ),
          child: Text(text, style: TextStyle(color: me ? Colors.white : AppColors.ink, fontSize: 13.5, height: 1.35)),
        ),
      );
}
