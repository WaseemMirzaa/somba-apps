import 'package:flutter/material.dart';
import '../../data/catalog_live.dart';
import '../../data/catalog_models.dart';
import '../../l10n/strings.dart';
import '../../services/aftersale_store.dart';
import '../../services/auth_service.dart' show ApiException;
import '../../services/models.dart';
import '../../services/realtime_store.dart';
import '../../theme/app_theme.dart';
import '../../util/variants.dart';
import '../../widgets/feedback.dart';
import '../../widgets/kit.dart';
import '../../widgets/photo_picker.dart';
import '../wallet_screen.dart';
import 'aftersale_status.dart';
import 'aftersale_widgets.dart';

/// Ask for a replacement (the same item again: damaged, faulty or wrong) or an exchange (another option of the
/// same product, with the price difference shown before the request is sent) for a line of a delivered order.
class ItemIssueScreen extends StatefulWidget {
  final Locale locale;
  final OrderDto order;
  final String initialKind;
  const ItemIssueScreen({super.key, this.locale = const Locale('en'), required this.order, this.initialKind = 'replacement'});

  @override
  State<ItemIssueScreen> createState() => _ItemIssueScreenState();
}

class _ItemIssueScreenState extends State<ItemIssueScreen> {
  static const _conditions = ['damaged', 'defective', 'wrong_item', 'other'];
  final _store = AfterSaleStore.instance;
  late String _kind = widget.initialKind == 'exchange' ? 'exchange' : 'replacement';
  OrderItemDto? _item;
  int _qty = 1;
  String? _condition;
  final Map<String, String> _picks = {};
  final _want = TextEditingController();
  final _reason = TextEditingController();
  final _photos = PhotoAttachments(max: 6);
  bool _busy = false;

  /// Set when the wallet cannot cover the price difference (our own check, or the server's answer).
  double? _walletShort;

  List<OrderItemDto> get _lines => widget.order.items.where((i) => !i.isCancelled).toList();

  @override
  void initState() {
    super.initState();
    if (_lines.length == 1) _select(_lines.first);
  }

  @override
  void dispose() {
    _want.dispose();
    _reason.dispose();
    _photos.dispose();
    super.dispose();
  }

  Product? get _product => _item == null ? null : productByUuid(_item!.productId);
  List<VariantGroup> get _groups => _product?.variants ?? const [];
  bool get _picker => _kind == 'exchange' && _groups.isNotEmpty;
  String? get _newVariant => missingPick(_groups, _picks) == null ? variantLabel(_groups, _picks) : null;

  /// (current price of the product - price paid) x units; null when the price of the new item is not known here.
  double? get _diff {
    final p = _product, i = _item;
    if (!_picker || p == null || i == null) return null;
    return double.parse(((p.price - i.priceUsd) * _qty).toStringAsFixed(2));
  }

  void _select(OrderItemDto item) {
    _item = item;
    _qty = _qty.clamp(1, item.qty);
    _walletShort = null;
    // Start from the option the customer has: the picker then shows what stays and what changes.
    _picks.clear();
    for (final part in item.variant.split(' · ')) {
      final at = part.indexOf(': ');
      if (at <= 0) continue;
      final name = part.substring(0, at).trim();
      final value = part.substring(at + 2).trim();
      for (final g in _groups) {
        if (g.name == name && g.options.contains(value)) _picks[name] = value;
      }
    }
  }

  Future<void> _submit() async {
    final s = Strings.of(context);
    final item = _item;
    String? err;
    if (item == null) {
      err = s.issuePickItem;
    } else if (_picker && _newVariant == null) {
      err = s.asExOptions;
    } else if (_picker && _newVariant == item.variant) {
      err = s.asExSame;
    } else if (_kind == 'exchange' && !_picker && _want.text.trim().length < 2) {
      err = s.issueSayWhat;
    } else if (_reason.text.trim().length < 5) {
      err = s.issueSayWhy;
    }
    if (err != null) {
      showSnack(context, err);
      return;
    }
    final diff = _diff;
    if (diff != null && diff > 0 && RealtimeStore.instance.walletBalance + 0.004 < diff) {
      setState(() => _walletShort = diff);
      showSnack(context, s.asExWalletLow(exactMoney(s, diff)));
      return;
    }
    if (_kind == 'replacement' && _photos.busy) {
      showSnack(context, s.asPhotosWait);
      return;
    }
    setState(() => _busy = true);
    try {
      final Widget next;
      final String ref;
      if (_kind == 'replacement') {
        final r = await _store.createReplacement(
          orderId: widget.order.id,
          sku: item!.productId,
          productName: item.productName,
          reason: _reason.text.trim(),
          condition: _condition,
          qty: _qty,
          attachments: _photos.urls,
        );
        ref = r.reference;
        next = ReplacementDetailScreen(locale: widget.locale, replacement: r);
      } else {
        final p = _product;
        final x = await _store.createExchange(
          orderId: widget.order.id,
          fromSku: item!.productId,
          fromName: item.productName,
          // A listed product with options: the same product, another option. Anything else is free text the team settles.
          toSku: _picker ? item.productId : 'ext:custom',
          toName: _picker ? (p?.name ?? item.productName) : _want.text.trim(),
          toVariant: _picker ? _newVariant : null,
          qty: _qty,
          reason: _reason.text.trim(),
        );
        ref = x.reference;
        next = ExchangeDetailScreen(locale: widget.locale, exchange: x);
      }
      if (!mounted) return;
      showSnack(context, s.issueSent(ref));
      Navigator.pushReplacement(context, MaterialPageRoute(builder: (_) => next));
    } catch (e) {
      if (!mounted) return;
      final m = RegExp(r'price difference \(\$([\d.,]+)\)').firstMatch(e is ApiException ? e.message : '$e');
      setState(() {
        _busy = false;
        if (m != null) _walletShort = double.tryParse(m[1]!.replaceAll(',', '')) ?? diff;
      });
      showError(context, e);
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = Strings.of(context);
    final items = _lines;
    return Scaffold(
      appBar: backAppBar(context, s.issueTitle),
      body: ListView(padding: const EdgeInsets.fromLTRB(20, 12, 20, 24), children: [
        SegmentedButton<String>(
          key: const ValueKey('issue-kind'),
          showSelectedIcon: false,
          segments: [
            ButtonSegment(value: 'replacement', label: ButtonLabel(s.issueReplacement)),
            ButtonSegment(value: 'exchange', label: ButtonLabel(s.issueExchange)),
          ],
          selected: {_kind},
          onSelectionChanged: (v) => setState(() {
            _kind = v.first;
            _walletShort = null;
          }),
        ),
        const SizedBox(height: 8),
        Text(_kind == 'replacement' ? s.issueReplacementHint : s.issueExchangeHint, style: const TextStyle(color: AppColors.muted, fontSize: 12.5)),
        const SizedBox(height: 16),
        Text(s.issueWhichItem, style: const TextStyle(fontWeight: FontWeight.w700)),
        RadioGroup<String>(
          groupValue: _item?.productId,
          onChanged: (id) => setState(() => _select(items.firstWhere((i) => i.productId == id))),
          child: Column(children: [
            for (final i in items)
              RadioListTile<String>(
                key: ValueKey('issue-item-${i.productId}'),
                contentPadding: EdgeInsets.zero,
                value: i.productId,
                title: Text('${i.qty} × ${i.displayName(s.lang)}', style: const TextStyle(fontSize: 13.5)),
                subtitle: i.hasVariant ? Text(i.displayVariant(s.lang), style: const TextStyle(fontSize: 12.5)) : null,
              ),
          ]),
        ),
        if (_item != null && _item!.qty > 1) ...[
          const SizedBox(height: 4),
          Row(children: [
            Expanded(child: Text(s.asQtyLabel, style: const TextStyle(fontWeight: FontWeight.w700))),
            LimitedStepper(
              keyPrefix: 'issue-qty',
              value: _qty,
              min: 1,
              max: _item!.qty,
              onChanged: (v) => setState(() {
                _qty = v;
                _walletShort = null;
              }),
            ),
          ]),
        ],
        if (_kind == 'exchange') ..._exchangePart(s),
        if (_kind == 'replacement') ...[
          const SizedBox(height: 16),
          Text(s.asRepCondition, style: const TextStyle(fontWeight: FontWeight.w700)),
          const SizedBox(height: 8),
          Wrap(spacing: 8, runSpacing: 8, children: [
            for (final c in _conditions)
              ChoiceChip(
                key: ValueKey('cond-$c'),
                label: Text(categoryLabel(s, c)),
                selected: _condition == c,
                onSelected: (sel) => setState(() => _condition = sel ? c : null),
              ),
          ]),
        ],
        const SizedBox(height: 12),
        AppField(key: const ValueKey('issue-reason'), label: s.issueReasonLabel, hint: s.issueReasonHint, controller: _reason, maxLines: 3),
        if (_kind == 'replacement') ...[
          const SizedBox(height: 16),
          PhotoPickerField(attachments: _photos, label: s.asPhotosLabel),
        ],
        const SizedBox(height: 18),
        SubmitButton(s.issueSubmit, key: const ValueKey('issue-submit'), busy: _busy, onPressed: _submit),
      ]),
    );
  }

  List<Widget> _exchangePart(Strings s) {
    final item = _item;
    final p = _product;
    if (item == null) return const [];
    if (!_picker) {
      return [
        const SizedBox(height: 8),
        AppField(key: const ValueKey('issue-want'), label: s.issueWantLabel, hint: s.issueWantHint, controller: _want),
        const SizedBox(height: 8),
        Text(s.asExDiffUnknown, key: const ValueKey('exchange-diff'), style: const TextStyle(color: AppColors.muted, fontSize: 12.5)),
      ];
    }
    final groups = _groups;
    final diff = _diff;
    final same = _newVariant != null && _newVariant == item.variant;
    return [
      const SizedBox(height: 16),
      Text(s.asExOptions, style: const TextStyle(fontWeight: FontWeight.w700)),
      if (item.hasVariant)
        Padding(
          padding: const EdgeInsets.only(top: 2),
          child: Text(s.asExCurrent(item.displayVariant(s.lang)), style: const TextStyle(color: AppColors.muted, fontSize: 12.5)),
        ),
      for (var gi = 0; gi < groups.length; gi++) ...[
        const SizedBox(height: 10),
        Text(p!.variantGroupLabel(gi, s.lang), style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
        const SizedBox(height: 6),
        Wrap(spacing: 8, runSpacing: 8, children: [
          for (var oi = 0; oi < groups[gi].options.length; oi++)
            ChoiceChip(
              key: ValueKey('opt-${groups[gi].name}-${groups[gi].options[oi]}'),
              label: Text(p.variantOptionLabel(gi, oi, s.lang)),
              selected: _picks[groups[gi].name] == groups[gi].options[oi],
              onSelected: (_) => setState(() {
                _picks[groups[gi].name] = groups[gi].options[oi];
                _walletShort = null;
              }),
            ),
        ]),
      ],
      const SizedBox(height: 12),
      if (same)
        Text(s.asExSame, key: const ValueKey('exchange-same'), style: const TextStyle(color: kAmberText, fontSize: 12.5, fontWeight: FontWeight.w600))
      else if (diff != null && _newVariant != null)
        _diffCard(s, diff),
      if (_walletShort != null) _walletCard(s, _walletShort!),
    ];
  }

  Widget _diffCard(Strings s, double diff) {
    final text = diff > 0.004
        ? s.asExDiffPay(exactMoney(s, diff))
        : diff < -0.004
            ? s.asExDiffRefund(exactMoney(s, -diff))
            : s.asExDiffNone;
    return Container(
      key: const ValueKey('exchange-diff'),
      padding: const EdgeInsets.all(AppSpace.md),
      decoration: BoxDecoration(color: AppColors.background, borderRadius: BorderRadius.circular(AppRadius.sm)),
      child: Text(text, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13, height: 1.35)),
    );
  }

  Widget _walletCard(Strings s, double short) => Container(
        key: const ValueKey('wallet-low'),
        margin: const EdgeInsets.only(top: AppSpace.md),
        padding: const EdgeInsets.all(AppSpace.md),
        decoration: BoxDecoration(color: AppColors.dangerSoft, borderRadius: BorderRadius.circular(AppRadius.sm)),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(s.asExWalletLow(exactMoney(s, short)), style: const TextStyle(color: AppColors.dangerStrong, fontWeight: FontWeight.w600, fontSize: 13, height: 1.35)),
          TextButton(
            key: const ValueKey('wallet-topup'),
            onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => WalletScreen(locale: widget.locale))),
            style: TextButton.styleFrom(foregroundColor: AppColors.dangerStrong, padding: EdgeInsets.zero, alignment: Alignment.centerLeft, minimumSize: const Size(0, 44)),
            child: Text(s.asExTopup),
          ),
        ]),
      );
}
