import 'package:flutter/material.dart';
import '../../data/mock_data.dart';
import '../../theme/app_theme.dart';
import '../../util/format.dart';
import '../../l10n/strings.dart';
import '../../widgets/kit.dart';
import '../../widgets/common.dart';
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
  final _refunds = ['Original payment method', 'Bank transfer'];

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
    final lang = widget.locale.languageCode;
    return Scaffold(
      appBar: backAppBar(context, '${trl(lang, 'Return')} · ${trl(lang, _stepTitles[_step])}'),
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
              Text(trl(widget.locale.languageCode, _stepTitles[i]), style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: done ? AppColors.primary : AppColors.faint)),
            ]),
          ));
        })),
      );

  Widget _itemsStep() {
    final lang = widget.locale.languageCode;
    return ListView(padding: const EdgeInsets.fromLTRB(16, 12, 16, 16), children: [
      Text(trl(lang, 'Which items are you returning?'), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
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
        Text(trl(widget.locale.languageCode, 'Reason for return'), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
        const SizedBox(height: 10),
        ..._pick(_reasons, _reason, (i) => setState(() => _reason = i)),
        const SizedBox(height: 8),
        Text(trl(widget.locale.languageCode, 'Refund to'), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
        const SizedBox(height: 10),
        ..._pick(_refunds, _refund, (i) => setState(() => _refund = i)),
      ]);

  Widget _reviewStep() {
    final lang = widget.locale.languageCode;
    return ListView(padding: const EdgeInsets.fromLTRB(16, 12, 16, 16), children: [
      Text(trl(lang, 'Review your return'), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
      const SizedBox(height: 10),
      Panel(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        ..._items.where((p) => _selected.contains(p.id)).map((p) => Padding(
          padding: const EdgeInsets.only(bottom: 8),
          child: Row(children: [
            Expanded(child: Text(p.displayName(lang), maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13))),
            Text(money(p.price), style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
          ]))),
        const Divider(height: 18),
        _kv(trl(lang, 'Reason'), trl(lang, _reasons[_reason])),
        const SizedBox(height: 6),
        _kv(trl(lang, 'Refund to'), trl(lang, _refunds[_refund])),
        const Divider(height: 18),
        Row(children: [
          Text(trl(lang, 'Estimated refund'), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14.5)),
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
            Expanded(child: OutlinedButton(onPressed: () => setState(() => _step--), child: Text(trl(widget.locale.languageCode, 'Back')))),
            const SizedBox(width: 12),
          ],
          Expanded(
            flex: 2,
            child: PrimaryButton(
              _step < 2 ? trl(widget.locale.languageCode, 'Continue') : trl(widget.locale.languageCode, 'Submit return'),
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
          Expanded(child: Text(trl(widget.locale.languageCode, items[i]), style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13.5, color: sel == i ? AppColors.ink : AppColors.inkSoft))),
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
              Text(trl(locale.languageCode, 'Refund on the way'), style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 16)),
              const SizedBox(height: 2),
              Text('$amount to original payment · 3–5 days', style: const TextStyle(color: Colors.white70, fontSize: 12.5)),
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

/// CF-30 — Exchange a delivered item (launched from a completed order's product,
/// not from the product page). Choose a different size/variant and a reason.
class ExchangeScreen extends StatefulWidget {
  final Locale locale;
  final Product? product;
  const ExchangeScreen({super.key, this.locale = const Locale('en'), this.product});
  @override
  State<ExchangeScreen> createState() => _ExchangeScreenState();
}

class _ExchangeScreenState extends State<ExchangeScreen> {
  int _size = 1;
  int _reason = 0;
  bool _done = false;
  final _sizes = ['S', 'M', 'L', 'XL'];
  final _reasons = ['Wrong size', 'Changed my mind', 'Defective', 'Different colour wanted'];

  @override
  Widget build(BuildContext context) {
    final p = widget.product ?? products.firstWhere((x) => x.category == 'Fashion', orElse: () => products.first);
    final lang = widget.locale.languageCode;
    if (_done) return _confirmation(p);
    return Scaffold(
      appBar: backAppBar(context, trl(lang, 'Exchange item')),
      body: ListView(padding: const EdgeInsets.fromLTRB(16, 8, 16, 24), children: [
        Panel(child: Row(children: [
          ClipRRect(borderRadius: BorderRadius.circular(12), child: SizedBox(height: 56, width: 56, child: ProductImage(product: p, iconSize: 24))),
          const SizedBox(width: 12),
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(p.displayName(widget.locale.languageCode), maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13.5)),
            const SizedBox(height: 2),
            Text('${trl(lang, 'From order')} SMB-2026-4712 · ${trl(lang, 'delivered')}', style: const TextStyle(color: AppColors.muted, fontSize: 12)),
          ])),
        ])),
        const SizedBox(height: 18),
        Text(trl(lang, 'Why are you exchanging?'), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
        const SizedBox(height: 10),
        ...List.generate(_reasons.length, (i) => Padding(
          padding: const EdgeInsets.only(bottom: 10),
          child: GestureDetector(onTap: () => setState(() => _reason = i), child: Panel(padding: const EdgeInsets.all(14), child: Row(children: [
            Icon(_reason == i ? Icons.radio_button_checked_rounded : Icons.radio_button_unchecked_rounded, color: _reason == i ? AppColors.primary : AppColors.faint),
            const SizedBox(width: 12),
            Expanded(child: Text(trl(lang, _reasons[i]), style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13.5, color: _reason == i ? AppColors.ink : AppColors.inkSoft))),
          ]))),
        )),
        const SizedBox(height: 8),
        Text(trl(lang, 'Exchange for a different size'), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
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
        Panel(child: Row(children: [
          const Icon(Icons.info_outline_rounded, color: AppColors.primary, size: 20),
          const SizedBox(width: 10),
          Expanded(child: Text(trl(lang, 'Free size exchange within 30 days. A rider will swap it at your door.'), style: const TextStyle(fontSize: 12.5, color: AppColors.inkSoft, height: 1.3))),
        ])),
      ]),
      bottomNavigationBar: Padding(
        padding: EdgeInsets.fromLTRB(16, 8, 16, 12 + MediaQuery.of(context).padding.bottom),
        child: PrimaryButton(trl(lang, 'Request exchange'), icon: Icons.swap_horiz_rounded, onPressed: () => setState(() => _done = true)),
      ),
    );
  }

  Widget _confirmation(Product p) {
    final lang = widget.locale.languageCode;
    return Scaffold(
        appBar: backAppBar(context, trl(lang, 'Exchange requested')),
        body: ListView(padding: const EdgeInsets.fromLTRB(16, 16, 16, 24), children: [
          Column(children: [
            Container(height: 84, width: 84, decoration: BoxDecoration(gradient: AppColors.brandGradient, shape: BoxShape.circle), child: const Icon(Icons.swap_horiz_rounded, color: Colors.white, size: 44)),
            const SizedBox(height: 16),
            Text(trl(lang, 'Exchange requested'), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 20, fontFamily: 'PlusJakartaSans')),
            const SizedBox(height: 6),
            Text('${trl(lang, 'New size')} ${_sizes[_size]} · ${trl(lang, 'reason')}: ${trl(lang, _reasons[_reason])}', textAlign: TextAlign.center, style: const TextStyle(color: AppColors.muted, fontSize: 13.5)),
          ]),
          const SizedBox(height: 20),
          Panel(child: const StatusTimeline([
            ('Exchange requested', 'Just now', true),
            ('Pickup scheduled', 'Rider assigned', true),
            ('Old item collected', 'At your door', false),
            ('New item delivered', 'Estimated 2–3 days', false),
          ])),
          const SizedBox(height: 16),
          PrimaryButton(trl(lang, 'Done'), icon: Icons.check_rounded, onPressed: () => Navigator.maybePop(context)),
        ]),
      );
  }
}

/// CF-29 — Returns & exchanges listing (from profile / my orders) with
/// search, status filter and per-return tracking.
class ReturnsListScreen extends StatefulWidget {
  final Locale locale;
  const ReturnsListScreen({super.key, this.locale = const Locale('en')});
  @override
  State<ReturnsListScreen> createState() => _ReturnsListScreenState();
}

class _ReturnsListScreenState extends State<ReturnsListScreen> {
  final _search = TextEditingController();
  int _tab = 0;
  static const _tabs = ['All', 'In review', 'Approved', 'Refunded', 'Rejected'];

  // (id, item, kind, status, date, amount)
  static const _returns = [
    ('RET-2026-118', 'Mens Cotton Jacket', 'Return', 'In review', 'Jun 28', 56.0),
    ('RET-2026-102', 'White Gold Earrings', 'Return', 'Refunded', 'Jun 20', 10.0),
    ('EXC-2026-077', 'Casual Slim Fit Shirt', 'Exchange', 'Approved', 'Jun 18', 0.0),
    ('RET-2026-064', 'WD 2TB Hard Drive', 'Return', 'Rejected', 'Jun 10', 64.0),
    ('RET-2026-051', 'Pierced Owl Earrings', 'Return', 'Refunded', 'Jun 2', 11.0),
  ];

  Color _statusColor(String s) {
    switch (s) {
      case 'Refunded':
      case 'Approved':
        return AppColors.success;
      case 'Rejected':
        return AppColors.danger;
      default:
        return AppColors.amber;
    }
  }

  bool _match(String status) {
    switch (_tab) {
      case 1:
        return status == 'In review';
      case 2:
        return status == 'Approved';
      case 3:
        return status == 'Refunded';
      case 4:
        return status == 'Rejected';
      default:
        return true;
    }
  }

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final q = _search.text.trim().toLowerCase();
    final lang = widget.locale.languageCode;
    final list = _returns.where((r) => _match(r.$4) && (q.isEmpty || r.$1.toLowerCase().contains(q) || r.$2.toLowerCase().contains(q))).toList();
    return Scaffold(
      appBar: backAppBar(context, trl(lang, 'Returns & exchanges')),
      body: Column(children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 6, 16, 4),
          child: TextField(
            controller: _search,
            onChanged: (_) => setState(() {}),
            decoration: InputDecoration(
              hintText: trl(lang, 'Search returns by ID or item…'),
              prefixIcon: const Icon(Icons.search_rounded),
              filled: true, fillColor: AppColors.surface,
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide.none),
            ),
          ),
        ),
        SizedBox(
          height: 44,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
            itemCount: _tabs.length,
            separatorBuilder: (_, __) => const SizedBox(width: 8),
            itemBuilder: (_, i) {
              final sel = _tab == i;
              return GestureDetector(
                onTap: () => setState(() => _tab = i),
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  alignment: Alignment.center,
                  decoration: BoxDecoration(color: sel ? AppColors.primary : AppColors.surface, borderRadius: BorderRadius.circular(100), border: Border.all(color: sel ? AppColors.primary : AppColors.line)),
                  child: Text(trl(lang, _tabs[i]), style: TextStyle(color: sel ? Colors.white : AppColors.inkSoft, fontWeight: FontWeight.w700, fontSize: 12.5)),
                ),
              );
            },
          ),
        ),
        Expanded(
          child: list.isEmpty
              ? Center(child: Text(trl(lang, 'No returns in this filter'), style: const TextStyle(color: AppColors.muted)))
              : ListView.separated(
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 20),
                  itemCount: list.length,
                  separatorBuilder: (_, __) => const SizedBox(height: 12),
                  itemBuilder: (_, i) {
                    final r = list[i];
                    final c = _statusColor(r.$4);
                    return GestureDetector(
                      onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => ReturnStatusScreen(locale: widget.locale, refund: r.$6))),
                      child: Panel(child: Column(children: [
                        Row(children: [
                          Container(height: 44, width: 44, decoration: BoxDecoration(color: c.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(12)), child: Icon(r.$3 == 'Exchange' ? Icons.swap_horiz_rounded : Icons.assignment_return_rounded, color: c)),
                          const SizedBox(width: 12),
                          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                            Text(r.$1, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14)),
                            const SizedBox(height: 2),
                            Text('${trl(lang, r.$3)} · ${r.$2}', maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(color: AppColors.muted, fontSize: 12.5)),
                          ])),
                          Pill(trl(lang, r.$4), color: c.withValues(alpha: 0.14), textColor: c, fontSize: 10.5),
                        ]),
                        const Divider(height: 20),
                        Row(children: [
                          Icon(Icons.event_rounded, size: 15, color: AppColors.faint),
                          const SizedBox(width: 6),
                          Text(r.$5, style: const TextStyle(color: AppColors.inkSoft, fontSize: 12.5, fontWeight: FontWeight.w500)),
                          const Spacer(),
                          if (r.$6 > 0) Text(money(r.$6), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 13.5, color: AppColors.primary)),
                          const SizedBox(width: 10),
                          const Icon(Icons.chevron_right_rounded, color: AppColors.faint, size: 20),
                        ]),
                      ])),
                    );
                  },
                ),
        ),
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
          child: Row(children: [
            const Icon(Icons.gavel_rounded, color: Color(0xFF92610A), size: 20),
            const SizedBox(width: 10),
            Expanded(child: Text(trl(widget.locale.languageCode, 'Under review — our team responds within 24h.'), style: const TextStyle(color: Color(0xFF92610A), fontWeight: FontWeight.w600, fontSize: 12.5))),
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
                  hintText: trl(widget.locale.languageCode, 'Type a message…'),
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
