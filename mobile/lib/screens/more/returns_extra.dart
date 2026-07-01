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
  int _step = 0; // 0 items · 1 reason · 2 review
  int _reason = 0;
  int _refund = 0;
  final _reasons = ['Damaged / defective', 'Wrong item received', 'Not as described', 'No longer needed', 'Other'];
  final _refunds = ['Store credit (instant)', 'Original payment method', 'Bank transfer'];

  // The order's items (mock: first three products); selection drives the refund.
  late final List<Product> _items = products.take(3).toList();
  final Set<int> _selected = {};

  double get _refundAmount => _items.where((p) => _selected.contains(p.id)).fold(0.0, (s, p) => s + p.price);

  @override
  void initState() {
    super.initState();
    _selected.add(_items.first.id);
  }

  static const _stepTitles = ['Select items', 'Reason', 'Review'];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: backAppBar(context, 'Return · ${_stepTitles[_step]}'),
      body: Column(children: [
        _stepper(),
        Expanded(child: switch (_step) {
          0 => _itemsStep(),
          1 => _reasonStep(),
          _ => _reviewStep(),
        }),
        _bottomBar(),
      ]),
    );
  }

  Widget _stepper() => Padding(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
        child: Row(children: List.generate(3, (i) {
          final done = i <= _step;
          return Expanded(child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 3),
            child: Column(children: [
              ClipRRect(borderRadius: BorderRadius.circular(100),
                  child: LinearProgressIndicator(value: done ? 1 : 0, minHeight: 5, backgroundColor: AppColors.line, color: AppColors.primary)),
              const SizedBox(height: 5),
              Text(_stepTitles[i], style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: done ? AppColors.primary : AppColors.faint)),
            ]),
          ));
        })),
      );

  Widget _itemsStep() {
    final lang = widget.locale.languageCode;
    return ListView(padding: const EdgeInsets.fromLTRB(16, 12, 16, 16), children: [
      const Text('Which items are you returning?', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
      const SizedBox(height: 10),
      ..._items.map((p) {
        final sel = _selected.contains(p.id);
        return Padding(padding: const EdgeInsets.only(bottom: 10), child: GestureDetector(
          onTap: () => setState(() => sel ? _selected.remove(p.id) : _selected.add(p.id)),
          child: Panel(padding: const EdgeInsets.all(12), child: Row(children: [
            Icon(sel ? Icons.check_box_rounded : Icons.check_box_outline_blank_rounded, color: sel ? AppColors.primary : AppColors.faint),
            const SizedBox(width: 10),
            ClipRRect(borderRadius: BorderRadius.circular(10), child: SizedBox(height: 48, width: 48, child: ProductImage(product: p, iconSize: 20))),
            const SizedBox(width: 12),
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(p.displayName(lang), maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
              Text(money(p.price), style: const TextStyle(color: AppColors.muted, fontSize: 12.5)),
            ])),
          ])),
        ));
      }),
    ]);
  }

  Widget _reasonStep() => ListView(padding: const EdgeInsets.fromLTRB(16, 12, 16, 16), children: [
        const Text('Reason for return', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
        const SizedBox(height: 10),
        ..._pick(_reasons, _reason, (i) => setState(() => _reason = i)),
        const SizedBox(height: 8),
        const Text('Refund to', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
        const SizedBox(height: 10),
        ..._pick(_refunds, _refund, (i) => setState(() => _refund = i)),
      ]);

  Widget _reviewStep() {
    final lang = widget.locale.languageCode;
    return ListView(padding: const EdgeInsets.fromLTRB(16, 12, 16, 16), children: [
      const Text('Review your return', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
      const SizedBox(height: 10),
      Panel(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        ..._items.where((p) => _selected.contains(p.id)).map((p) => Padding(
          padding: const EdgeInsets.only(bottom: 8),
          child: Row(children: [
            Expanded(child: Text(p.displayName(lang), maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13))),
            Text(money(p.price), style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
          ]))),
        const Divider(height: 18),
        _kv('Reason', _reasons[_reason]),
        const SizedBox(height: 6),
        _kv('Refund to', _refunds[_refund]),
        const Divider(height: 18),
        Row(children: [
          const Text('Estimated refund', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 14.5)),
          const Spacer(),
          Text(money(_refundAmount), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16, color: AppColors.primary)),
        ]),
      ])),
    ]);
  }

  Widget _kv(String k, String v) => Row(children: [
        Text(k, style: const TextStyle(color: AppColors.muted, fontSize: 13)),
        const Spacer(),
        Text(v, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
      ]);

  Widget _bottomBar() {
    final canNext = _step != 0 || _selected.isNotEmpty;
    return SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 10),
        child: Row(children: [
          if (_step > 0) ...[
            Expanded(child: OutlinedButton(onPressed: () => setState(() => _step--), child: const Text('Back'))),
            const SizedBox(width: 12),
          ],
          Expanded(
            flex: 2,
            child: PrimaryButton(
              _step < 2 ? 'Continue' : 'Submit return',
              icon: _step < 2 ? Icons.arrow_forward_rounded : Icons.assignment_return_rounded,
              onPressed: !canNext
                  ? null
                  : () {
                      if (_step < 2) {
                        setState(() => _step++);
                      } else {
                        Navigator.pushReplacement(context, MaterialPageRoute(builder: (_) => ReturnStatusScreen(locale: widget.locale, refund: _refundAmount)));
                      }
                    },
            ),
          ),
        ]),
      ),
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
  final double? refund;
  const ReturnStatusScreen({super.key, this.locale = const Locale('en'), this.refund});
  @override
  Widget build(BuildContext context) {
    final amount = refund != null ? money(refund!) : money(349);
    return Scaffold(
      appBar: backAppBar(context, 'Return RET-2026-118'),
      body: ListView(padding: const EdgeInsets.fromLTRB(16, 8, 16, 24), children: [
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(gradient: AppColors.brandGradient, borderRadius: BorderRadius.circular(20)),
          child: Row(children: [
            const Icon(Icons.replay_rounded, color: Colors.white, size: 28),
            const SizedBox(width: 12),
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Text('Refund on the way', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 16)),
              const SizedBox(height: 2),
              Text('$amount to store credit · 1–2 days', style: const TextStyle(color: Colors.white70, fontSize: 12.5)),
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
        PrimaryButton('Request exchange',
            icon: Icons.swap_horiz_rounded,
            onPressed: () {
              ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Exchange requested — size ${_sizes[_size]}')));
              Navigator.maybePop(context);
            }),
      ]),
    );
  }
}

class DisputeScreen extends StatefulWidget {
  final Locale locale;
  const DisputeScreen({super.key, this.locale = const Locale('en')});
  @override
  State<DisputeScreen> createState() => _DisputeScreenState();
}

class _DisputeScreenState extends State<DisputeScreen> {
  final _ctrl = TextEditingController();
  final _scroll = ScrollController();
  final List<(String, String, bool)> _msgs = [
    ('You', 'Item arrived damaged. Requesting a replacement.', true),
    ('Support', "Thanks Marie — we've opened a dispute and asked the seller to respond.", false),
    ('Support', 'Please share a photo of the damage to speed things up.', false),
    ('You', 'Photo attached. 📷', true),
  ];

  @override
  void dispose() {
    _ctrl.dispose();
    _scroll.dispose();
    super.dispose();
  }

  void _send() {
    final t = _ctrl.text.trim();
    if (t.isEmpty) return;
    setState(() {
      _msgs.add(('You', t, true));
      _ctrl.clear();
    });
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scroll.hasClients) _scroll.animateTo(_scroll.position.maxScrollExtent, duration: const Duration(milliseconds: 250), curve: Curves.easeOut);
    });
  }

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
        Expanded(child: ListView.builder(
          controller: _scroll,
          padding: const EdgeInsets.all(16),
          itemCount: _msgs.length,
          itemBuilder: (_, i) => _msg(_msgs[i].$2, _msgs[i].$3),
        )),
        SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 10),
            child: Row(children: [
              Expanded(child: TextField(
                controller: _ctrl,
                onSubmitted: (_) => _send(),
                decoration: InputDecoration(
                  hintText: 'Type a message…',
                  isDense: true,
                  filled: true,
                  fillColor: AppColors.surface,
                  contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 13),
                  enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(100), borderSide: const BorderSide(color: AppColors.line)),
                  focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(100), borderSide: const BorderSide(color: AppColors.primary, width: 1.4)),
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(100), borderSide: const BorderSide(color: AppColors.line)),
                ),
              )),
              const SizedBox(width: 10),
              GestureDetector(
                onTap: _send,
                child: Container(height: 48, width: 48, decoration: const BoxDecoration(gradient: AppColors.brandGradient, shape: BoxShape.circle), child: const Icon(Icons.send_rounded, color: Colors.white, size: 20)),
              ),
            ]),
          ),
        ),
      ]),
    );
  }

  Widget _msg(String text, bool me) => Align(
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
