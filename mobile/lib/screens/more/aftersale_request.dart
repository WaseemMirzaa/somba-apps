import 'package:flutter/material.dart';
import '../../l10n/strings.dart';
import '../../services/aftersale_models.dart';
import '../../services/aftersale_store.dart';
import '../../theme/app_theme.dart';
import '../../widgets/feedback.dart';
import '../../widgets/kit.dart';
import '../../widgets/photo_picker.dart';
import 'aftersale_widgets.dart';
import 'chat_entry.dart';

/// One return or dispute request: where it stands, the items and the refund, the conversation with the seller
/// and Somba support, and what the customer may do next. Follows the live pushes while it is open.
class ReturnStatusScreen extends StatefulWidget {
  const ReturnStatusScreen({super.key, this.locale = const Locale('en'), this.returnRequest, this.requestId, this.siblings = const []})
      : assert(returnRequest != null || requestId != null, 'give the request or its id');

  final Locale locale;

  /// The request as the caller has it (a list row, the answer of `disputes:open`); it is refreshed on open.
  final DisputeView? returnRequest;

  /// Open by id (a notice): the request is fetched.
  final String? requestId;

  /// The other requests created together with this one (a return over several stores).
  final List<String> siblings;

  @override
  State<ReturnStatusScreen> createState() => _ReturnStatusScreenState();
}

class _ReturnStatusScreenState extends State<ReturnStatusScreen> {
  final _store = AfterSaleStore.instance;
  final _reply = TextEditingController();
  final _photos = PhotoAttachments(max: 6);
  Object? _loadError;
  bool _loading = true;
  bool _sending = false;
  bool _acting = false;
  String? _replyError;

  String get _id => widget.returnRequest?.id ?? widget.requestId!;

  @override
  void initState() {
    super.initState();
    _load();
    for (final id in widget.siblings) {
      _store.tryFetchDispute(id);
    }
  }

  @override
  void dispose() {
    _reply.dispose();
    _photos.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    if (!_loading || _loadError != null) {
      setState(() {
        _loading = true;
        _loadError = null;
      });
    }
    try {
      await _store.fetchDispute(_id);
      if (mounted) setState(() => _loading = false);
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _loadError = e;
      });
      // With the request already on screen only the thread failed: say so (a full-screen error speaks for itself).
      if (_store.disputeById(_id) != null || widget.returnRequest != null) showError(context, e);
    }
  }

  Future<void> _send(DisputeView d) async {
    final s = Strings.of(context);
    final text = _reply.text.trim();
    if (text.isEmpty) {
      setState(() => _replyError = s.asReplyEmpty);
      showSnack(context, s.asReplyEmpty);
      return;
    }
    if (_photos.busy) {
      showSnack(context, s.asPhotosWait);
      return;
    }
    setState(() {
      _sending = true;
      _replyError = null;
    });
    try {
      await _store.reply(d.id, text, attachments: _photos.urls);
      if (!mounted) return;
      _reply.clear();
      _photos.clear();
      setState(() => _sending = false);
      showSnack(context, s.asReplySent);
    } catch (e) {
      if (!mounted) return;
      setState(() => _sending = false);
      showError(context, e);
    }
  }

  Future<void> _escalate(DisputeView d) async {
    final s = Strings.of(context);
    final note = await showDialog<String>(context: context, builder: (_) => const EscalateDialog());
    if (note == null || !mounted) return;
    setState(() => _acting = true);
    try {
      await _store.escalate(d.id, note: note);
      if (!mounted) return;
      setState(() => _acting = false);
      showSnack(context, s.asEscalateDone);
    } catch (e) {
      if (!mounted) return;
      setState(() => _acting = false);
      showError(context, e);
    }
  }

  Future<void> _cancel(DisputeView d) async {
    final s = Strings.of(context);
    final ok = await showDialog<bool>(context: context, builder: (_) => const CancelRequestDialog());
    if (ok != true || !mounted) return;
    setState(() => _acting = true);
    try {
      await _store.cancel(d.id);
      if (!mounted) return;
      setState(() => _acting = false);
      showSnack(context, s.asCancelDone);
    } catch (e) {
      if (!mounted) return;
      setState(() => _acting = false);
      showError(context, e);
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = Strings.of(context);
    return ListenableBuilder(
      listenable: _store,
      builder: (context, _) {
        final d = _store.disputeById(_id) ?? widget.returnRequest;
        if (d == null) {
          return Scaffold(
            appBar: backAppBar(context, s.returnsRefunds),
            body: _loadError != null ? AfterSaleError(error: _loadError!, onRetry: _load) : const Center(child: CircularProgressIndicator()),
          );
        }
        final banner = stageBanner(s, d);
        return Scaffold(
          appBar: backAppBar(context, d.reference.isEmpty ? s.returnsRefunds : d.reference),
          body: RefreshIndicator(
            onRefresh: _load,
            child: ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
              children: [
                _banner(banner, d),
                if (widget.siblings.isNotEmpty) ...[const SizedBox(height: AppSpace.lg), _siblings(s, d)],
                if (d.canEscalate || d.canCancel) ...[const SizedBox(height: AppSpace.lg), _actions(s, d)],
                if (_showDecision(s, d)) ...[
                  const SizedBox(height: AppSpace.lg),
                  Panel(
                    key: const ValueKey('decision'),
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      SectionTitle(s.asDecision),
                      if (outcomeLabel(s, d.outcome).isNotEmpty) Text(outcomeLabel(s, d.outcome), style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13.5)),
                      if ((d.resolution ?? '').isNotEmpty) Text(d.resolution!, style: const TextStyle(color: AppColors.inkSoft, fontSize: 13.5, height: 1.4)),
                    ]),
                  ),
                ],
                if (d.isReturn && _showProgress(d)) ...[const SizedBox(height: AppSpace.lg), _progress(s, d)],
                const SizedBox(height: AppSpace.lg),
                _details(s, d),
                if (d.items.isNotEmpty) ...[const SizedBox(height: AppSpace.lg), _items(s, d)],
                const SizedBox(height: AppSpace.lg),
                _reasonPanel(s, d),
                if (_hasSellerPanel(d)) ...[const SizedBox(height: AppSpace.lg), _sellerPanel(s, d)],
                if (d.sellerId != null) ...[
                  const SizedBox(height: AppSpace.sm),
                  MessageSellerButton(sellerId: d.sellerId!, orderId: d.orderId, locale: widget.locale),
                ],
                const SizedBox(height: AppSpace.lg),
                _thread(s, d),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _banner(StageBanner b, DisputeView d) => Container(
        key: const ValueKey('stage-banner'),
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(color: b.color.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(20)),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Icon(b.icon, color: b.textColor, size: 28),
          const SizedBox(width: AppSpace.md),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(b.title, key: const ValueKey('return-status'), style: TextStyle(color: b.textColor, fontWeight: FontWeight.w800, fontSize: 16)),
              if (b.body.isNotEmpty) ...[
                const SizedBox(height: 2),
                Text(b.body, key: const ValueKey('stage-body'), style: const TextStyle(color: AppColors.inkSoft, fontSize: 13, height: 1.35)),
              ],
            ]),
          ),
        ]),
      );

  Widget _actions(Strings s, DisputeView d) => Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        if (d.canEscalate) SubmitButton(s.asEscalate, key: const ValueKey('escalate'), busy: _acting, onPressed: () => _escalate(d)),
        if (d.canCancel)
          TextButton(
            key: const ValueKey('cancel-request'),
            onPressed: _acting ? null : () => _cancel(d),
            style: TextButton.styleFrom(foregroundColor: AppColors.dangerStrong, minimumSize: const Size(0, 48)),
            child: Text(s.asCancelRequest),
          ),
      ]);

  Widget _siblings(Strings s, DisputeView d) {
    final others = [for (final id in widget.siblings) _store.disputeById(id)].whereType<DisputeView>().toList();
    return Panel(
      key: const ValueKey('siblings'),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        SectionTitle(s.asSiblingsTitle),
        Text(s.asSiblingsBody(widget.siblings.length + 1), style: const TextStyle(color: AppColors.inkSoft, fontSize: 13, height: 1.35)),
        const SizedBox(height: AppSpace.md),
        _siblingRow(s, d, current: true),
        for (final o in others) _siblingRow(s, o),
      ]),
    );
  }

  Widget _siblingRow(Strings s, DisputeView r, {bool current = false}) {
    final c = stageColors(r);
    final row = Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(children: [
        Expanded(
          child: Text(current ? '${r.reference} · ${s.asSiblingsThis}' : r.reference,
              maxLines: 2, overflow: TextOverflow.ellipsis, style: TextStyle(fontWeight: current ? FontWeight.w800 : FontWeight.w600, fontSize: 13.5)),
        ),
        const SizedBox(width: AppSpace.sm),
        Flexible(child: StatusBadge(label: stageLabel(s, r), color: c.color, textColor: c.text)),
      ]),
    );
    if (current) return row;
    return InkWell(
      key: ValueKey('sibling-${r.id}'),
      onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => ReturnStatusScreen(locale: widget.locale, returnRequest: r))),
      child: row,
    );
  }

  /// The staff decision behind a refund or a replacement (the banner already says it for a plain resolution or refusal).
  bool _showDecision(Strings s, DisputeView d) =>
      d.isClosed && d.status == 'resolved' && (d.hasRefund || d.outcome == 'replacement') && ((d.resolution ?? '').isNotEmpty || outcomeLabel(s, d.outcome).isNotEmpty);

  bool _showProgress(DisputeView d) {
    if (d.inPickupFlow) return true;
    return d.isClosed && d.status == 'resolved' && (d.pickupTaskId != null || d.receivedAt != null);
  }

  Widget _progress(Strings s, DisputeView d) {
    final received = d.receivedAt != null || d.stage == 'received' || (d.isClosed && d.status == 'resolved');
    final collected = received;
    final refunded = d.isClosed && d.status == 'resolved' && d.hasRefund;
    final steps = <(String, String, bool)>[
      (s.asPkSent, d.createdAt != null ? s.when(d.createdAt!) : '', true),
      (s.asPkAccepted, '', true),
      (s.asPkCollect, collected ? '' : s.asPkCollectSub, collected),
      (s.asPkReceived, d.receivedAt != null ? s.when(d.receivedAt!) : '', received),
      (s.asPkRefund, refunded ? refundText(s, d) : '', refunded),
    ];
    return Panel(
      key: const ValueKey('return-progress'),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [SectionTitle(s.asPkTitle), StatusTimeline(steps)]),
    );
  }

  Widget _details(Strings s, DisputeView d) => Panel(
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          KeyValueRow(s.kvOrder, d.orderReference),
          const SizedBox(height: AppSpace.sm),
          KeyValueRow(s.kvType, d.isReturn ? s.typeReturn : s.typeDispute),
          if (categoryLabel(s, d.category).isNotEmpty) ...[
            const SizedBox(height: AppSpace.sm),
            KeyValueRow(s.asKvCategory, categoryLabel(s, d.category)),
          ],
          if (d.createdAt != null) ...[
            const SizedBox(height: AppSpace.sm),
            KeyValueRow(s.asKvOpened, s.date(d.createdAt!)),
          ],
        ]),
      );

  Widget _items(Strings s, DisputeView d) => Panel(
        key: const ValueKey('request-items'),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          SectionTitle(s.asSecItems),
          for (final i in d.items)
            Padding(
              padding: const EdgeInsets.only(bottom: AppSpace.md),
              child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(i.displayName(s.lang), maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13.5)),
                    if (i.hasVariant) Text(i.displayVariant(s.lang), style: const TextStyle(color: AppColors.muted, fontSize: 12.5)),
                    Text(s.orderQty(i.qty), style: const TextStyle(color: AppColors.muted, fontSize: 12.5)),
                  ]),
                ),
                const SizedBox(width: AppSpace.sm),
                Flexible(
                  child: Text(
                    i.refundUsd > 0 ? s.asItemRefund(exactMoney(s, i.refundUsd)) : (d.isOpen && i.unitPriceUsd > 0 ? s.asItemValue(exactMoney(s, i.valueUsd)) : ''),
                    textAlign: TextAlign.end,
                    style: TextStyle(fontWeight: FontWeight.w700, fontSize: 12.5, color: i.refundUsd > 0 ? AppColors.success : AppColors.muted),
                  ),
                ),
              ]),
            ),
        ]),
      );

  Widget _reasonPanel(Strings s, DisputeView d) => Panel(
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(s.yourMessage, style: const TextStyle(color: AppColors.muted, fontSize: 12.5)),
          const SizedBox(height: 4),
          Text(d.reason, key: const ValueKey('request-reason'), style: const TextStyle(fontSize: 13.5, height: 1.4)),
          if (d.attachments.isNotEmpty) ...[
            const SizedBox(height: AppSpace.md),
            Text(s.asSecPhotos, style: const TextStyle(color: AppColors.muted, fontSize: 12.5)),
            const SizedBox(height: AppSpace.sm),
            RemotePhotos(urls: d.attachments),
          ],
        ]),
      );

  bool _hasSellerPanel(DisputeView d) =>
      (d.sellerReason ?? '').isNotEmpty ||
      (d.isReturn && d.sellerRespondedAt != null && !const {'seller_rejected'}.contains(d.stage)) ||
      (d.isOpen && d.stage == 'awaiting_seller' && d.sellerDueAt != null);

  Widget _sellerPanel(Strings s, DisputeView d) => Panel(
        key: const ValueKey('seller-panel'),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          SectionTitle(s.asSecSeller),
          if (d.isReturn && d.sellerRespondedAt != null && (d.sellerReason ?? '').isEmpty)
            Text(s.asSellerAccepted, style: const TextStyle(fontSize: 13.5, height: 1.4)),
          if ((d.sellerReason ?? '').isNotEmpty) ...[
            Text(s.asSellerReason, style: const TextStyle(color: AppColors.muted, fontSize: 12.5)),
            const SizedBox(height: 2),
            Text(d.sellerReason!, key: const ValueKey('seller-reason'), style: const TextStyle(fontSize: 13.5, height: 1.4)),
          ],
          if (d.sellerRespondedAt != null) ...[
            const SizedBox(height: AppSpace.sm),
            Text(s.asSellerAnswered(s.when(d.sellerRespondedAt!)), style: const TextStyle(color: AppColors.muted, fontSize: 12.5)),
          ] else if (d.isOpen && d.sellerDueAt != null)
            Text(s.asSellerDue(s.when(d.sellerDueAt!)), key: const ValueKey('seller-due'), style: const TextStyle(color: AppColors.muted, fontSize: 12.5)),
        ]),
      );

  String _author(Strings s, DisputeMessageView m) {
    if (m.isCustomer) return s.asThreadYou;
    if (m.isSeller) {
      final n = firstNameOf(m.authorName);
      return n.isEmpty ? s.asThreadTeam : s.asThreadSeller(n);
    }
    return m.role.startsWith('admin') ? s.asThreadSupport : s.asThreadTeam;
  }

  Widget _thread(Strings s, DisputeView d) {
    final msgs = d.messages;
    return Panel(
      key: const ValueKey('thread'),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        SectionTitle(s.asSecThread),
        if (msgs == null)
          _loading
              ? const Padding(padding: EdgeInsets.all(AppSpace.lg), child: Center(child: CircularProgressIndicator()))
              : TextButton(key: const ValueKey('thread-retry'), onPressed: _load, child: Text(s.retry))
        else if (msgs.isEmpty)
          Text(s.asThreadEmpty, key: const ValueKey('thread-empty'), style: const TextStyle(color: AppColors.muted, fontSize: 13))
        else
          for (final m in msgs) _bubble(s, m),
        const SizedBox(height: AppSpace.md),
        if (d.isClosed)
          Container(
            key: const ValueKey('closed-note'),
            padding: const EdgeInsets.all(AppSpace.md),
            decoration: BoxDecoration(color: AppColors.background, borderRadius: BorderRadius.circular(AppRadius.sm)),
            child: Text(s.asClosedNote, style: const TextStyle(color: AppColors.muted, fontSize: 13, height: 1.35)),
          )
        else
          _composer(s, d),
      ]),
    );
  }

  Widget _bubble(Strings s, DisputeMessageView m) {
    final mine = m.isCustomer;
    return Align(
      alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        key: ValueKey('msg-${m.id}'),
        margin: const EdgeInsets.only(bottom: AppSpace.sm),
        padding: const EdgeInsets.all(AppSpace.md),
        constraints: BoxConstraints(maxWidth: MediaQuery.sizeOf(context).width * 0.78),
        decoration: BoxDecoration(
          color: mine ? AppColors.primary.withValues(alpha: 0.10) : AppColors.background,
          borderRadius: BorderRadius.circular(AppRadius.md),
        ),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(_author(s, m), style: TextStyle(fontWeight: FontWeight.w800, fontSize: 12, color: mine ? AppColors.primaryDark : AppColors.inkSoft)),
          const SizedBox(height: 2),
          if (m.text.isNotEmpty) Text(m.text, style: const TextStyle(fontSize: 13.5, height: 1.35)),
          if (m.attachments.isNotEmpty) ...[const SizedBox(height: AppSpace.sm), RemotePhotos(urls: m.attachments, size: 64)],
          if (m.createdAt != null) ...[
            const SizedBox(height: 4),
            Text(s.when(m.createdAt!), style: const TextStyle(color: AppColors.muted, fontSize: 11.5)),
          ],
        ]),
      ),
    );
  }

  Widget _composer(Strings s, DisputeView d) => Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        TextField(
          key: const ValueKey('reply-field'),
          controller: _reply,
          minLines: 1,
          maxLines: 4,
          textInputAction: TextInputAction.newline,
          onChanged: (_) {
            if (_replyError != null) setState(() => _replyError = null);
          },
          decoration: InputDecoration(hintText: s.asReplyHint, errorText: _replyError),
        ),
        const SizedBox(height: AppSpace.md),
        PhotoPickerField(attachments: _photos),
        const SizedBox(height: AppSpace.md),
        OutlinedButton(
          key: const ValueKey('reply-send'),
          onPressed: _sending ? null : () => _send(d),
          child: _sending ? const ButtonSpinner() : Text(s.send),
        ),
      ]);
}

/// "Ask Somba support to decide?": explains, takes an optional note, pops the note (null when the customer backs out).
class EscalateDialog extends StatefulWidget {
  const EscalateDialog({super.key});
  @override
  State<EscalateDialog> createState() => EscalateDialogState();
}

class EscalateDialogState extends State<EscalateDialog> {
  final _note = TextEditingController();

  @override
  void dispose() {
    _note.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final s = Strings.of(context);
    return AlertDialog(
      title: Text(s.asEscalateTitle),
      content: SingleChildScrollView(
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(s.asEscalateBody),
          const SizedBox(height: AppSpace.md),
          AppField(key: const ValueKey('escalate-note'), label: s.asEscalateNote, controller: _note, maxLines: 3),
        ]),
      ),
      actions: [
        SizedBox(
          width: double.infinity,
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            FilledButton(key: const ValueKey('escalate-confirm'), onPressed: () => Navigator.pop(context, _note.text), child: ButtonLabel(s.asEscalateConfirm)),
            TextButton(key: const ValueKey('escalate-back'), onPressed: () => Navigator.pop(context), child: ButtonLabel(s.cancel)),
          ]),
        ),
      ],
    );
  }
}

/// "Cancel this request?": pops true when the customer confirms.
class CancelRequestDialog extends StatelessWidget {
  const CancelRequestDialog({super.key});

  @override
  Widget build(BuildContext context) {
    final s = Strings.of(context);
    return AlertDialog(
      title: Text(s.asCancelTitle),
      content: Text(s.asCancelBody),
      // Stacked full width: two labels side by side do not fit a dialog (French, large text).
      actions: [
        SizedBox(
          width: double.infinity,
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            FilledButton(key: const ValueKey('cancel-confirm'), onPressed: () => Navigator.pop(context, true), child: ButtonLabel(s.asCancelConfirm)),
            TextButton(key: const ValueKey('cancel-keep'), onPressed: () => Navigator.pop(context, false), child: ButtonLabel(s.asCancelKeep)),
          ]),
        ),
      ],
    );
  }
}
