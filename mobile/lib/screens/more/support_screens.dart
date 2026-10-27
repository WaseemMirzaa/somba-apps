import 'dart:async';
import 'package:flutter/material.dart';
import '../../l10n/strings.dart';
import '../../services/models.dart';
import '../../services/realtime_store.dart';
import '../../services/support_store.dart';
import '../../theme/app_theme.dart';
import '../../widgets/common.dart';
import '../../widgets/feedback.dart';
import '../../widgets/kit.dart';
import '../../widgets/photo_picker.dart';
import 'chat_widgets.dart';

export '../../services/support_store.dart' show TicketView, TicketMessage;

/// The categories a shopper picks when opening a ticket (the API takes a free slug; `general` is what older tickets carry).
const List<String> kTicketCategories = ['order', 'payment', 'delivery', 'return', 'account', 'other'];

/// A ticket can carry up to 6 photos per message (the API's limit).
const int kTicketMaxPhotos = 6;

Color _statusColor(String status) => switch (status) {
      'resolved' || 'closed' => AppColors.success,
      'pending' => AppColors.primary,
      _ => AppColors.amber,
    };

String _statusLabel(Strings s, String status) =>
    switch (status) { 'pending' => s.ticketInprogress, 'resolved' => s.ticketResolved, 'closed' => s.ticketClosed, _ => s.ticketOpen };

/// "Order SOM-1042" for a ticket's linked order (a neutral label when the order isn't on this phone).
String? _orderLine(Strings s, String? orderId) {
  if ((orderId ?? '').isEmpty) return null;
  final o = RealtimeStore.instance.orderById(orderId!);
  return o == null ? s.chatCtxOrderPlain : s.chatCtxOrder(o.reference);
}

/// Support: the shopper's tickets with status badges and unread counts, live; a pinned "New ticket" button.
class SupportListScreen extends StatefulWidget {
  final Locale locale;
  const SupportListScreen({super.key, this.locale = const Locale('en')});
  @override
  State<SupportListScreen> createState() => _SupportListScreenState();
}

class _SupportListScreenState extends State<SupportListScreen> {
  final _store = SupportStore.instance;
  Object? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  /// A failure on an empty screen is shown in place with a retry button; on a list already on screen it is a snackbar.
  Future<void> _load() async {
    try {
      await _store.load();
      if (mounted) setState(() => _error = null);
    } catch (e) {
      if (!mounted) return;
      if (_store.loaded && _store.tickets.isNotEmpty) {
        showError(context, e);
      } else {
        setState(() => _error = e);
      }
    }
  }

  Future<void> _newTicket() async {
    await Navigator.push<TicketView>(context, MaterialPageRoute(builder: (_) => NewTicketScreen(locale: widget.locale)));
  }

  @override
  Widget build(BuildContext context) {
    final s = Strings.of(context);
    return Scaffold(
      appBar: backAppBar(context, s.support),
      bottomNavigationBar: _error != null && _store.tickets.isEmpty
          ? null
          : SafeArea(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
                child: PrimaryButton(s.ticketNew, onPressed: _newTicket),
              ),
            ),
      body: ListenableBuilder(
        listenable: _store,
        builder: (context, _) {
          if (_error != null && _store.tickets.isEmpty) {
            return LoadFailed(error: _error!, onRetry: () {
              setState(() => _error = null);
              _load();
            });
          }
          if (!_store.loaded) return const Center(child: CircularProgressIndicator());
          final tickets = _store.tickets;
          return RefreshIndicator(
            onRefresh: _load,
            child: ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
              children: [
                if (tickets.isEmpty) Panel(child: Text(s.ticketNone, key: const ValueKey('ticket-empty'), style: const TextStyle(color: AppColors.muted))),
                for (final t in tickets)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: TicketTile(
                      ticket: t,
                      onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => SupportTicketDetailScreen(ticket: t, locale: widget.locale))),
                    ),
                  ),
              ],
            ),
          );
        },
      ),
    );
  }
}

/// One ticket row: subject, reference and category, the linked order, the status badge and the unread count.
class TicketTile extends StatelessWidget {
  const TicketTile({super.key, required this.ticket, required this.onTap});
  final TicketView ticket;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final s = Strings.of(context);
    final t = ticket;
    final color = _statusColor(t.status);
    final unread = t.userUnread > 0;
    final order = _orderLine(s, t.orderId);
    return Semantics(
      label: unread ? s.supportUnreadN(t.userUnread) : null,
      child: Material(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(20),
        child: InkWell(
          key: ValueKey('ticket-tile-${t.id}'),
          borderRadius: BorderRadius.circular(20),
          onTap: onTap,
          child: Ink(
            decoration: BoxDecoration(borderRadius: BorderRadius.circular(20), boxShadow: AppShadow.card),
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Container(
                  height: 44,
                  width: 44,
                  decoration: BoxDecoration(color: color.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(12)),
                  child: Icon(Icons.confirmation_number_outlined, color: color),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Expanded(
                        child: Text(t.subject,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(fontWeight: unread ? FontWeight.w800 : FontWeight.w700, fontSize: 14)),
                      ),
                      const SizedBox(width: AppSpace.sm),
                      Pill(_statusLabel(s, t.status), color: color.withValues(alpha: 0.14), textColor: color, fontSize: 10.5),
                    ]),
                    const SizedBox(height: 2),
                    Row(children: [
                      Expanded(
                        child: Text('${t.reference} · ${s.supportCategory(t.category)}',
                            maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(color: AppColors.muted, fontSize: 12.5)),
                      ),
                      if (unread) ...[const SizedBox(width: AppSpace.sm), CountBadge(t.userUnread, semanticLabel: s.supportUnreadN(t.userUnread))],
                    ]),
                    if (order != null)
                      Padding(
                        padding: const EdgeInsets.only(top: 2),
                        child: Text(order, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(color: AppColors.primary, fontSize: 12, fontWeight: FontWeight.w600)),
                      ),
                  ]),
                ),
              ]),
            ),
          ),
        ),
      ),
    );
  }
}

/// A ticket's conversation: messages with photos, live staff replies, a composer — or, once resolved or closed, a note
/// with "Open a new ticket" (linked to the same order).
class SupportTicketDetailScreen extends StatefulWidget {
  final TicketView ticket;
  final Locale locale;
  const SupportTicketDetailScreen({super.key, required this.ticket, this.locale = const Locale('en')});
  @override
  State<SupportTicketDetailScreen> createState() => _SupportTicketDetailScreenState();
}

class _SupportTicketDetailScreenState extends State<SupportTicketDetailScreen> {
  final _store = SupportStore.instance;
  final _ctrl = TextEditingController();
  final _attachments = PhotoAttachments(max: kTicketMaxPhotos);
  bool _sending = false;

  @override
  void initState() {
    super.initState();
    final id = widget.ticket.id;
    _store.openTicketId = id;
    // Opening the ticket reads it. The list's copy may be stale, so the ticket is also fetched fresh.
    if ((_store.byId(id) ?? widget.ticket).userUnread > 0) unawaited(_store.markRead(id));
    unawaited(_store.fetch(id).then((t) {
      if (t != null && t.userUnread > 0) unawaited(_store.markRead(id));
    }));
  }

  @override
  void dispose() {
    if (_store.openTicketId == widget.ticket.id) _store.openTicketId = null;
    _ctrl.dispose();
    _attachments.dispose();
    super.dispose();
  }

  Future<void> _send(TicketView t) async {
    if (_sending) return;
    final s = Strings.of(context);
    final text = _ctrl.text.trim();
    if (_attachments.busy) {
      showSnack(context, s.photoWait);
      return;
    }
    final urls = _attachments.urls;
    if (text.isEmpty && urls.isEmpty) {
      showSnack(context, s.chatComposeRequired);
      return;
    }
    setState(() => _sending = true);
    try {
      await _store.reply(t.id, text: text, attachments: urls);
      if (!mounted) return;
      _ctrl.clear();
      _attachments.clear();
      showSnack(context, s.supportReplied);
    } catch (e) {
      if (mounted) showError(context, e);
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  void _openNew(TicketView t) {
    Navigator.pushReplacement(
      context,
      MaterialPageRoute<TicketView>(builder: (_) => NewTicketScreen(orderId: t.orderId, category: t.category, locale: widget.locale)),
    );
  }

  @override
  Widget build(BuildContext context) {
    final s = Strings.of(context);
    return ListenableBuilder(
      listenable: _store,
      builder: (context, _) {
        final t = _store.byId(widget.ticket.id) ?? widget.ticket;
        final color = _statusColor(t.status);
        final order = _orderLine(s, t.orderId);
        final msgs = t.messages;
        return Scaffold(
          appBar: backAppBar(context, t.reference),
          bottomNavigationBar: t.isClosed
              ? NoteBar(
                  key: const ValueKey('ticket-closed-note'),
                  text: s.supportClosedNote(t.status),
                  children: [FilledButton(key: const ValueKey('ticket-open-new'), onPressed: () => _openNew(t), child: ButtonLabel(s.supportOpenNew))],
                )
              : MessageComposer(controller: _ctrl, attachments: _attachments, onSend: () => _send(t), sending: _sending, hint: s.ticketReplyHint, maxLength: 4000),
          body: Column(children: [
            Container(
              width: double.infinity,
              color: AppColors.surface,
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 14),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Expanded(child: Text(t.subject, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15))),
                  const SizedBox(width: AppSpace.sm),
                  Pill(_statusLabel(s, t.status), key: const ValueKey('ticket-status'), color: color.withValues(alpha: 0.14), textColor: color, fontSize: 10.5),
                ]),
                const SizedBox(height: 4),
                Text(order == null ? s.supportCategoryLine(t.category) : '${s.supportCategoryLine(t.category)} · $order',
                    style: const TextStyle(color: AppColors.muted, fontSize: 12.5)),
              ]),
            ),
            const Divider(height: 1),
            Expanded(
              child: ListView.builder(
                reverse: true,
                padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
                itemCount: msgs.length,
                itemBuilder: (_, i) => TicketBubble(message: msgs[msgs.length - 1 - i]),
              ),
            ),
          ]),
        );
      },
    );
  }
}

/// One ticket message: the customer's on the right, Somba support's on the left; photos are thumbnails.
class TicketBubble extends StatelessWidget {
  const TicketBubble({super.key, required this.message});
  final TicketMessage message;

  @override
  Widget build(BuildContext context) {
    final s = Strings.of(context);
    final m = message;
    final mine = !m.fromStaff;
    return Align(
      alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
      child: Padding(
        padding: const EdgeInsets.only(bottom: 10),
        child: Column(crossAxisAlignment: mine ? CrossAxisAlignment.end : CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
          Container(
            constraints: BoxConstraints(maxWidth: MediaQuery.sizeOf(context).width * 0.78),
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
            decoration: BoxDecoration(
              color: mine ? AppColors.primary : AppColors.surface,
              borderRadius: BorderRadius.only(
                topLeft: const Radius.circular(16),
                topRight: const Radius.circular(16),
                bottomLeft: Radius.circular(mine ? 16 : 4),
                bottomRight: Radius.circular(mine ? 4 : 16),
              ),
              boxShadow: mine ? null : AppShadow.card,
            ),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
              if (!mine)
                Padding(
                  padding: const EdgeInsets.only(bottom: 2),
                  child: Text(s.supportStaff, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(color: AppColors.muted, fontSize: 11.5, fontWeight: FontWeight.w700)),
                ),
              if (m.text.isNotEmpty) Text(m.text, style: TextStyle(color: mine ? Colors.white : AppColors.ink, fontSize: 13.5, height: 1.35)),
              if (m.attachments.isNotEmpty)
                Padding(
                  padding: EdgeInsets.only(top: m.text.isEmpty ? 0 : AppSpace.sm),
                  child: AttachmentThumbs(m.attachments, size: 88, keyPrefix: 'ticket-photo-${m.id}'),
                ),
            ]),
          ),
          if (m.at != null)
            Padding(
              padding: const EdgeInsets.only(top: 3, left: 4, right: 4),
              child: Text(s.when(m.at!), style: const TextStyle(color: AppColors.faint, fontSize: 10.5)),
            ),
        ]),
      ),
    );
  }
}

/// Open a ticket: category, subject, message, an optional order and photos. [orderId] / [category] pre-fill the form
/// (opening a new ticket from a closed one keeps its order).
class NewTicketScreen extends StatefulWidget {
  const NewTicketScreen({super.key, this.orderId, this.category, this.locale = const Locale('en')});
  final String? orderId;
  final String? category;
  final Locale locale;

  @override
  State<NewTicketScreen> createState() => _NewTicketScreenState();
}

class _NewTicketScreenState extends State<NewTicketScreen> {
  final _subject = TextEditingController();
  final _message = TextEditingController();
  final _attachments = PhotoAttachments(max: kTicketMaxPhotos);
  late String _category = kTicketCategories.contains(widget.category) ? widget.category! : 'other';
  late String? _orderId = (widget.orderId ?? '').isEmpty ? null : widget.orderId;
  String? _subjectError;
  String? _messageError;
  bool _busy = false;

  @override
  void dispose() {
    _subject.dispose();
    _message.dispose();
    _attachments.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final s = Strings.of(context);
    final subject = _subject.text.trim();
    final message = _message.text.trim();
    if (subject.isEmpty || message.isEmpty) {
      setState(() {
        _subjectError = subject.isEmpty ? s.supportSubjectRequired : null;
        _messageError = message.isEmpty ? s.supportMessageRequired : null;
      });
      showSnack(context, s.socialCheckFields);
      return;
    }
    if (_attachments.busy) {
      showSnack(context, s.photoWait);
      return;
    }
    setState(() {
      _busy = true;
      _subjectError = null;
      _messageError = null;
    });
    final nav = Navigator.of(context);
    try {
      final t = await SupportStore.instance.open(
        subject: subject,
        message: message,
        category: _category,
        orderId: _orderId,
        attachments: _attachments.urls,
      );
      if (!mounted) return;
      showSnack(context, s.supportOpened(t.reference));
      nav.pop(t);
    } catch (e) {
      if (!mounted) return;
      setState(() => _busy = false);
      showError(context, e);
    }
  }

  List<DropdownMenuItem<String?>> _orderItems(Strings s) {
    final orders = RealtimeStore.instance.orders;
    return [
      DropdownMenuItem<String?>(value: null, child: Text(s.supportOrderNone, maxLines: 1, overflow: TextOverflow.ellipsis)),
      for (final OrderDto o in orders)
        DropdownMenuItem<String?>(
          value: o.id,
          child: Text(o.createdAt == null ? o.reference : '${o.reference} · ${s.date(o.createdAt!)}', maxLines: 1, overflow: TextOverflow.ellipsis),
        ),
      // An order the phone doesn't hold (pre-filled from a ticket) stays selectable.
      if (_orderId != null && !orders.any((o) => o.id == _orderId))
        DropdownMenuItem<String?>(value: _orderId, child: Text(s.chatCtxOrderPlain, maxLines: 1, overflow: TextOverflow.ellipsis)),
    ];
  }

  @override
  Widget build(BuildContext context) {
    final s = Strings.of(context);
    return Scaffold(
      appBar: backAppBar(context, s.ticketNewTitle),
      body: ListView(padding: const EdgeInsets.fromLTRB(16, 8, 16, 24), children: [
        Text(s.supportCatLabel, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13, color: AppColors.inkSoft)),
        const SizedBox(height: AppSpace.sm),
        Wrap(spacing: AppSpace.sm, runSpacing: AppSpace.sm, children: [
          for (final c in kTicketCategories)
            ChoiceChip(
              key: ValueKey('ticket-cat-$c'),
              label: Text(s.supportCategory(c)),
              selected: _category == c,
              showCheckmark: false,
              selectedColor: AppColors.primary.withValues(alpha: 0.14),
              labelStyle: TextStyle(fontWeight: FontWeight.w700, fontSize: 12.5, color: _category == c ? AppColors.primary : AppColors.inkSoft),
              onSelected: (_) => setState(() => _category = c),
            ),
        ]),
        const SizedBox(height: AppSpace.lg),
        AppField(
          key: const ValueKey('ticket-subject'),
          label: s.ticketSubject,
          controller: _subject,
          error: _subjectError,
          onChanged: (_) {
            if (_subjectError != null) setState(() => _subjectError = null);
          },
        ),
        const SizedBox(height: AppSpace.lg),
        AppField(
          key: const ValueKey('ticket-message'),
          label: s.ticketHowHelp,
          controller: _message,
          maxLines: 5,
          error: _messageError,
          onChanged: (_) {
            if (_messageError != null) setState(() => _messageError = null);
          },
        ),
        const SizedBox(height: AppSpace.lg),
        Text(s.supportOrderLabel, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13, color: AppColors.inkSoft)),
        const SizedBox(height: 6),
        DropdownButtonFormField<String?>(
          key: const ValueKey('ticket-order'),
          initialValue: _orderId,
          isExpanded: true,
          items: _orderItems(s),
          onChanged: (v) => setState(() => _orderId = v),
        ),
        const SizedBox(height: AppSpace.lg),
        PhotoPickerField(attachments: _attachments, label: s.supportPhotosLabel),
        const SizedBox(height: AppSpace.lg + AppSpace.sm),
        PrimaryButton(s.supportCreate, busy: _busy, onPressed: _submit),
      ]),
    );
  }
}
