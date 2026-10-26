import 'package:flutter/material.dart';
import '../../l10n/strings.dart';
import '../../services/aftersale_models.dart';
import '../../services/aftersale_store.dart';
import '../../services/models.dart';
import '../../theme/app_theme.dart';
import '../../util/format.dart';
import '../../widgets/feedback.dart';
import '../../widgets/kit.dart';
import '../../widgets/photo_picker.dart';
import 'aftersale_dispute_form.dart';
import 'aftersale_request.dart';
import 'aftersale_status.dart';
import 'aftersale_widgets.dart';

export 'aftersale_request.dart' show ReturnStatusScreen;

/// A return / dispute request (kept under its old name for the callers that still use it).
typedef ReturnView = DisputeView;

/// "Returns & exchanges": the customer's returns and problems, replacements and exchanges, live.
class ReturnsListScreen extends StatefulWidget {
  final Locale locale;
  final int initialTab;
  const ReturnsListScreen({super.key, this.locale = const Locale('en'), this.initialTab = 0});
  @override
  State<ReturnsListScreen> createState() => _ReturnsListScreenState();
}

class _ReturnsListScreenState extends State<ReturnsListScreen> with SingleTickerProviderStateMixin {
  final _store = AfterSaleStore.instance;
  late final TabController _tabs = TabController(length: 3, vsync: this, initialIndex: widget.initialTab.clamp(0, 2));
  final List<bool> _loading = [true, true, true];
  final List<Object?> _errors = [null, null, null];
  String _filter = 'all';

  @override
  void initState() {
    super.initState();
    for (var i = 0; i < 3; i++) {
      _load(i, initial: true);
    }
  }

  @override
  void dispose() {
    _tabs.dispose();
    super.dispose();
  }

  Future<void> _load(int i, {bool initial = false}) async {
    if (!initial) {
      setState(() {
        _loading[i] = true;
        _errors[i] = null;
      });
    }
    try {
      await switch (i) {
        0 => _store.loadDisputes(),
        1 => _store.loadReplacements(),
        _ => _store.loadExchanges(),
      };
    } catch (e) {
      _errors[i] = e;
      // A refresh that fails over a list we already show: tell the customer (an empty tab shows the error itself).
      if (mounted && !initial && _count(i) > 0) showError(context, e);
    }
    if (mounted) setState(() => _loading[i] = false);
  }

  int _count(int i) => switch (i) { 0 => _store.disputes.length, 1 => _store.replacements.length, _ => _store.exchanges.length };

  bool _show(bool open) => _filter == 'all' || (_filter == 'open') == open;

  @override
  Widget build(BuildContext context) {
    final s = Strings.of(context);
    return Scaffold(
      appBar: backAppBar(context, s.asHubTitle),
      body: Column(children: [
        TabBar(
          key: const ValueKey('hub-tabs'),
          controller: _tabs,
          isScrollable: true,
          tabAlignment: TabAlignment.start,
          labelColor: AppColors.primary,
          unselectedLabelColor: AppColors.muted,
          indicatorColor: AppColors.primary,
          dividerColor: AppColors.line,
          labelStyle: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14),
          tabs: [Tab(text: s.asTabReturns), Tab(text: s.asTabReplacements), Tab(text: s.asTabExchanges)],
        ),
        SizedBox(
          height: 52,
          child: ListView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            children: [
              for (final f in const ['all', 'open', 'closed'])
                Padding(
                  padding: const EdgeInsets.only(right: AppSpace.sm),
                  child: ChoiceChip(
                    key: ValueKey('filter-$f'),
                    label: Text(switch (f) { 'open' => s.asFilterOpen, 'closed' => s.asFilterClosed, _ => s.asFilterAll }),
                    selected: _filter == f,
                    onSelected: (_) => setState(() => _filter = f),
                  ),
                ),
            ],
          ),
        ),
        Expanded(
          child: ListenableBuilder(
            listenable: _store,
            builder: (context, _) => TabBarView(controller: _tabs, children: [
              _tab(s, 0, [for (final d in _store.disputes) if (_show(d.isOpen)) _disputeCard(s, d)], s.asEmptyReturns),
              _tab(s, 1, [for (final r in _store.replacements) if (_show(r.isOpen)) _replacementCard(s, r)], s.asEmptyReplacements),
              _tab(s, 2, [for (final x in _store.exchanges) if (_show(x.isOpen)) _exchangeCard(s, x)], s.asEmptyExchanges),
            ]),
          ),
        ),
      ]),
    );
  }

  Widget _tab(Strings s, int i, List<Widget> cards, String emptyText) {
    if (_loading[i] && _count(i) == 0) return const Center(child: CircularProgressIndicator());
    if (_errors[i] != null && _count(i) == 0) return AfterSaleError(error: _errors[i]!, onRetry: () => _load(i));
    return RefreshIndicator(
      onRefresh: () => _load(i),
      child: cards.isEmpty
          ? ListView(
              key: ValueKey('hub-empty-$i'),
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.fromLTRB(32, 64, 32, 24),
              children: [
                Text(_count(i) == 0 ? emptyText : s.asEmptyFiltered, textAlign: TextAlign.center, style: const TextStyle(color: AppColors.muted, height: 1.4)),
              ],
            )
          : ListView.separated(
              key: ValueKey('hub-list-$i'),
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
              itemCount: cards.length,
              separatorBuilder: (_, __) => const SizedBox(height: 12),
              itemBuilder: (_, n) => cards[n],
            ),
    );
  }

  Widget _disputeCard(Strings s, DisputeView d) {
    final c = stageColors(d);
    final first = d.items.isEmpty ? null : d.items.first;
    final summary = first != null ? '${first.displayName(s.lang)}${d.items.length > 1 ? ' +${d.items.length - 1}' : ''}' : d.reason;
    return PressableCard(
      key: ValueKey('request-${d.id}'),
      onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => ReturnStatusScreen(locale: widget.locale, returnRequest: d))),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        IconTile(d.isReturn ? Icons.assignment_return_outlined : Icons.report_problem_outlined, c.color),
        const SizedBox(width: AppSpace.md),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              Expanded(child: Text(d.reference, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14))),
              const SizedBox(width: AppSpace.sm),
              Flexible(child: StatusBadge(label: stageLabel(s, d), color: c.color, textColor: c.text)),
            ]),
            const SizedBox(height: 2),
            Text('${s.orderRef(d.orderReference)} · ${d.isReturn ? s.typeReturn : s.typeDispute}', maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(color: AppColors.muted, fontSize: 12.5)),
            if (summary.isNotEmpty) ...[
              const SizedBox(height: 4),
              Text(summary, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(color: AppColors.inkSoft, fontSize: 13)),
            ],
            if (d.hasRefund && d.status == 'resolved') ...[
              const SizedBox(height: 4),
              Text(refundText(s, d), maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(color: AppColors.success, fontWeight: FontWeight.w700, fontSize: 12.5)),
            ],
          ]),
        ),
      ]),
    );
  }

  Widget _replacementCard(Strings s, ReplacementView r) {
    final c = replacementColors(r.status);
    return PressableCard(
      key: ValueKey('replacement-${r.id}'),
      onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => ReplacementDetailScreen(locale: widget.locale, replacement: r))),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        IconTile(Icons.autorenew_rounded, c.color),
        const SizedBox(width: AppSpace.md),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              Expanded(child: Text(r.reference, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14))),
              const SizedBox(width: AppSpace.sm),
              Flexible(child: StatusBadge(label: transferStatusLabel(s, r.status), color: c.color, textColor: c.text)),
            ]),
            const SizedBox(height: 2),
            Text(s.orderRef(r.orderReference), maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(color: AppColors.muted, fontSize: 12.5)),
            const SizedBox(height: 4),
            Text('${r.qty} × ${r.displayName(s.lang)}', maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(color: AppColors.inkSoft, fontSize: 13)),
          ]),
        ),
      ]),
    );
  }

  Widget _exchangeCard(Strings s, ExchangeView x) {
    final c = replacementColors(x.status);
    return PressableCard(
      key: ValueKey('exchange-${x.id}'),
      onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => ExchangeDetailScreen(locale: widget.locale, exchange: x))),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        IconTile(Icons.swap_horiz_rounded, c.color),
        const SizedBox(width: AppSpace.md),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              Expanded(child: Text(x.reference, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14))),
              const SizedBox(width: AppSpace.sm),
              Flexible(child: StatusBadge(label: transferStatusLabel(s, x.status), color: c.color, textColor: c.text)),
            ]),
            const SizedBox(height: 2),
            Text(s.orderRef(x.orderReference), maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(color: AppColors.muted, fontSize: 12.5)),
            const SizedBox(height: 4),
            Text(exchangeSummary(s, x), maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(color: AppColors.inkSoft, fontSize: 13)),
          ]),
        ),
      ]),
    );
  }
}

/// Ask for a return on a delivered order: the items and how many, what is wrong, photos, where the refund goes.
/// The window and what is still returnable come from the server (`disputes:eligibility`).
class ReturnRequestScreen extends StatefulWidget {
  final Locale locale;
  final OrderDto order;
  const ReturnRequestScreen({super.key, this.locale = const Locale('en'), required this.order});
  @override
  State<ReturnRequestScreen> createState() => _ReturnRequestScreenState();
}

class _ReturnRequestScreenState extends State<ReturnRequestScreen> {
  static const _categories = ['damaged', 'wrong_item', 'not_as_described', 'changed_mind', 'defective', 'other'];
  final _store = AfterSaleStore.instance;
  final _reason = TextEditingController();
  final _photos = PhotoAttachments(max: 6);
  ReturnEligibility? _elig;
  Object? _loadError;
  bool _loading = true;
  final Map<String, int> _qty = {};
  String? _category;
  String _refundTo = 'wallet';
  String? _itemsError, _categoryError, _reasonError;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _load(initial: true);
  }

  @override
  void dispose() {
    _reason.dispose();
    _photos.dispose();
    super.dispose();
  }

  Future<void> _load({bool initial = false}) async {
    if (!initial) {
      setState(() {
        _loading = true;
        _loadError = null;
      });
    }
    try {
      final e = await _store.eligibility(widget.order.id);
      if (!mounted) return;
      final open = e.items.where((i) => i.remaining > 0).toList();
      setState(() {
        _elig = e;
        _loading = false;
        _qty
          ..clear()
          ..addEntries(open.map((i) => MapEntry(i.itemId, open.length == 1 ? i.remaining : 0)));
      });
    } catch (e) {
      if (mounted) {
        setState(() {
          _loadError = e;
          _loading = false;
        });
      }
    }
  }

  bool get _mobileMoney {
    final m = widget.order.paymentMethod.toLowerCase();
    return m.contains('money') || m.contains('mpesa') || m.contains('airtel') || m.contains('orange');
  }

  double get _preview {
    var total = 0.0;
    for (final l in _elig?.items ?? const <EligibleLine>[]) {
      total += (_qty[l.itemId] ?? 0) * l.unitPriceUsd;
    }
    return total;
  }

  int get _units => _qty.values.fold(0, (a, b) => a + b);

  /// The order line a returnable line comes from (it carries the French name).
  OrderItemDto? _orderLine(EligibleLine l) {
    for (final i in widget.order.items) {
      if (i.productId == l.productId && i.variant == l.variant) return i;
    }
    for (final i in widget.order.items) {
      if (i.productId == l.productId) return i;
    }
    return null;
  }

  Future<void> _submit() async {
    final s = Strings.of(context);
    final reason = _reason.text.trim();
    setState(() {
      _itemsError = _units == 0 ? s.asRetPickOne : null;
      _categoryError = _category == null ? s.asPickCategory : null;
      _reasonError = reason.length < 5 ? s.asReasonShort : null;
    });
    final first = _itemsError ?? _categoryError ?? _reasonError;
    if (first != null) {
      showSnack(context, first);
      return;
    }
    if (_photos.busy) {
      showSnack(context, s.asPhotosWait);
      return;
    }
    setState(() => _busy = true);
    try {
      final res = await _store.open(
        orderId: widget.order.id,
        type: 'return',
        reason: reason,
        category: _category,
        items: [
          for (final e in _qty.entries)
            if (e.value > 0) {'itemId': e.key, 'qty': e.value}
        ],
        attachments: _photos.urls,
        refundTo: _mobileMoney ? _refundTo : 'wallet',
      );
      if (!mounted) return;
      showSnack(context, res.isSplit ? s.asRetSentMany(res.siblings.length + 1) : s.asRetSent(res.dispute.reference));
      Navigator.pushReplacement(
        context,
        MaterialPageRoute(builder: (_) => ReturnStatusScreen(locale: widget.locale, returnRequest: res.dispute, siblings: res.siblings)),
      );
    } catch (e) {
      if (!mounted) return;
      setState(() => _busy = false);
      showError(context, e);
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = Strings.of(context);
    final elig = _elig;
    return Scaffold(
      appBar: backAppBar(context, s.returnTitle(widget.order.reference)),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _loadError != null || elig == null
              ? AfterSaleError(error: _loadError ?? StateError('no eligibility'), onRetry: _load)
              : !elig.eligible
                  ? _closed(s, elig)
                  : _form(s, elig),
    );
  }

  Widget _closed(Strings s, ReturnEligibility e) {
    final passed = e.windowPassed;
    return ListView(padding: const EdgeInsets.fromLTRB(16, 8, 16, 24), children: [
      Container(
        key: const ValueKey('return-closed'),
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(color: AppColors.dangerSoft, borderRadius: BorderRadius.circular(20)),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Icon(Icons.event_busy_rounded, color: AppColors.dangerStrong, size: 28),
          const SizedBox(width: AppSpace.md),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(passed ? s.asWinClosedTitle : s.asWinUnavailableTitle, style: const TextStyle(color: AppColors.dangerStrong, fontWeight: FontWeight.w800, fontSize: 16)),
              const SizedBox(height: 2),
              Text(
                passed ? s.asWinClosedBody(e.windowDays, s.date(e.endsAt!)) : s.serverError(e.reason ?? ''),
                key: const ValueKey('return-closed-body'),
                style: const TextStyle(color: AppColors.inkSoft, fontSize: 13, height: 1.35),
              ),
            ]),
          ),
        ]),
      ),
      const SizedBox(height: AppSpace.lg),
      OutlinedButton(
        key: const ValueKey('return-report'),
        onPressed: () => Navigator.pushReplacement(context, MaterialPageRoute(builder: (_) => DisputeFormScreen(locale: widget.locale, order: widget.order))),
        child: ButtonLabel(s.asReportProblem),
      ),
    ]);
  }

  Widget _form(Strings s, ReturnEligibility e) {
    return ListView(padding: const EdgeInsets.fromLTRB(16, 8, 16, 24), children: [
      if (e.endsAt != null) ...[
        Text(s.asWinOpen(s.date(e.endsAt!)), key: const ValueKey('return-window'), style: const TextStyle(color: AppColors.muted, fontSize: 12.5)),
        const SizedBox(height: AppSpace.md),
      ],
      Panel(
        key: const ValueKey('return-items'),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          SectionTitle(s.asRetItems),
          for (final l in e.items) _itemRow(s, l),
          FieldError(_itemsError, fieldKey: const ValueKey('items-error')),
          const Divider(height: 22),
          Row(children: [
            Expanded(child: Text(s.asRetRefundPreview, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13.5))),
            Text(exactMoney(s, _preview), key: const ValueKey('refund-preview'), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15, color: AppColors.success)),
          ]),
          const SizedBox(height: 4),
          Text(s.asRetRefundNote, style: const TextStyle(color: AppColors.muted, fontSize: 12.5)),
        ]),
      ),
      const SizedBox(height: AppSpace.lg),
      Text(s.returnWhatWrong, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
      const SizedBox(height: 10),
      Wrap(spacing: 8, runSpacing: 8, children: [
        for (final c in _categories)
          ChoiceChip(
            key: ValueKey('cat-$c'),
            label: Text(categoryLabel(s, c)),
            selected: _category == c,
            onSelected: (_) => setState(() {
              _category = c;
              _categoryError = null;
            }),
          ),
      ]),
      FieldError(_categoryError, fieldKey: const ValueKey('category-error')),
      const SizedBox(height: AppSpace.lg),
      AppField(
        key: const ValueKey('return-details'),
        label: s.asReasonLabel,
        hint: s.asReasonHint,
        controller: _reason,
        maxLines: 3,
        error: _reasonError,
        onChanged: (_) {
          if (_reasonError != null) setState(() => _reasonError = null);
        },
      ),
      const SizedBox(height: AppSpace.lg),
      PhotoPickerField(attachments: _photos, label: s.asPhotosLabel),
      if (_mobileMoney) ...[
        const SizedBox(height: AppSpace.lg),
        Text(s.asRefundTo, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
        const SizedBox(height: 10),
        Wrap(spacing: 8, runSpacing: 8, children: [
          ChoiceChip(key: const ValueKey('refund-wallet'), label: Text(s.asRefundToWallet), selected: _refundTo == 'wallet', onSelected: (_) => setState(() => _refundTo = 'wallet')),
          ChoiceChip(key: const ValueKey('refund-phone'), label: Text(s.asRefundToPhone), selected: _refundTo == 'phone', onSelected: (_) => setState(() => _refundTo = 'phone')),
        ]),
        const SizedBox(height: 6),
        Text(s.asRefundToNote, style: const TextStyle(color: AppColors.muted, fontSize: 12.5)),
      ],
      const SizedBox(height: AppSpace.lg),
      SubmitButton(s.returnSubmit, key: const ValueKey('return-submit'), busy: _busy, onPressed: _submit),
    ]);
  }

  Widget _itemRow(Strings s, EligibleLine l) {
    final line = _orderLine(l);
    final name = line?.displayName(s.lang) ?? l.productName;
    final variant = line != null && line.hasVariant ? line.displayVariant(s.lang) : (l.hasVariant ? l.variant : '');
    final qty = _qty[l.itemId] ?? 0;
    return Padding(
      key: ValueKey('line-${l.itemId}'),
      padding: const EdgeInsets.only(bottom: AppSpace.md),
      child: Row(crossAxisAlignment: CrossAxisAlignment.center, children: [
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(name, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13.5)),
            if (variant.isNotEmpty) Text(variant, style: const TextStyle(color: AppColors.muted, fontSize: 12.5)),
            Text(money(l.unitPriceUsd), style: const TextStyle(color: AppColors.muted, fontSize: 12.5)),
            Text(l.remaining > 0 ? s.asRetRemaining(l.remaining) : s.asRetNoneLeft,
                style: TextStyle(color: l.remaining > 0 ? AppColors.muted : kAmberText, fontSize: 12, fontWeight: FontWeight.w600)),
          ]),
        ),
        const SizedBox(width: AppSpace.sm),
        if (l.remaining > 0)
          LimitedStepper(
            keyPrefix: 'ret-${l.itemId}',
            value: qty,
            max: l.remaining,
            onChanged: (v) => setState(() {
              _qty[l.itemId] = v;
              _itemsError = null;
            }),
          ),
      ]),
    );
  }
}
