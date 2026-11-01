import 'dart:io';
import 'package:flutter/material.dart';
import '../l10n/strings.dart';
import '../services/models.dart';
import '../services/rider_store.dart';
import '../services/support_models.dart';
import '../services/support_store.dart';
import '../theme/app_theme.dart';
import '../widgets/ui.dart';

/// Route names, so a support notice can replace the support screens already open.
const kSupportRoute = 'support';
const kSupportThreadRoute = 'support-thread';
const kSupportNewRoute = 'support-new';

String _ticketStatus(Strings s, String status) => s.has('ticket_$status') ? s.t('ticket_$status') : status;

Color _statusColor(String status) => switch (status) {
      'resolved' => AppColors.success,
      'closed' => AppColors.muted,
      'pending' => AppColors.primary,
      _ => AppColors.accent,
    };

/// "26/10 14:05"
String _stamp(DateTime? d) {
  if (d == null) return '';
  String two(int n) => n.toString().padLeft(2, '0');
  return '${two(d.day)}/${two(d.month)} ${two(d.hour)}:${two(d.minute)}';
}

Widget _statusBadge(Strings s, String status, {Key? key}) =>
    Pill(_ticketStatus(s, status), key: key, color: _statusColor(status).withValues(alpha: 0.14), textColor: _statusColor(status));

/// Opens the new-ticket form; returns the ticket that was sent (null when the rider backed out).
Future<SupportTicket?> openNewTicket(BuildContext context) =>
    Navigator.of(context).push<SupportTicket>(MaterialPageRoute(settings: const RouteSettings(name: kSupportNewRoute), builder: (_) => const NewTicketScreen()));

Route<void> supportThreadRoute(String id) =>
    MaterialPageRoute<void>(settings: const RouteSettings(name: kSupportThreadRoute), builder: (_) => SupportThreadScreen(ticketId: id));

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

/// The rider's tickets: status badges, unread counts, and a button to open a new one.
class SupportScreen extends StatefulWidget {
  /// Opens straight into this ticket's thread (a tapped support notice).
  final String? openTicketId;
  const SupportScreen({super.key, this.openTicketId});
  @override
  State<SupportScreen> createState() => _SupportScreenState();
}

class _SupportScreenState extends State<SupportScreen> {
  final store = SupportStore.instance;

  @override
  void initState() {
    super.initState();
    store.load();
    final id = widget.openTicketId;
    if (id != null) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) Navigator.of(context).push(supportThreadRoute(id));
      });
    }
  }

  Future<void> _new() async {
    final t = await openNewTicket(context);
    if (t != null && mounted) Navigator.of(context).push(supportThreadRoute(t.id));
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: store,
      builder: (context, _) {
        final s = Strings.of(context);
        return Scaffold(
          appBar: backAppBar(context, s.support),
          body: RefreshIndicator(onRefresh: store.load, child: _body(s)),
          bottomNavigationBar: SafeArea(
            minimum: const EdgeInsets.fromLTRB(16, 8, 16, 12),
            child: PrimaryButton(s.supportOpenNew, key: const ValueKey('support-new'), onPressed: _new),
          ),
        );
      },
    );
  }

  Widget _body(Strings s) {
    if (!store.loaded && store.loadError == null) return ListView(children: const [SizedBox(height: 120), Center(child: CircularProgressIndicator())]);
    if (!store.loaded && store.loadError != null) {
      return ListView(padding: const EdgeInsets.all(24), children: [
        const SizedBox(height: 60),
        Text(s.supportLoadFailed, key: const ValueKey('support-error'), textAlign: TextAlign.center, style: const TextStyle(color: AppColors.muted, height: 1.4)),
        const SizedBox(height: 4),
        Text(s.errorText(store.loadError!), textAlign: TextAlign.center, style: const TextStyle(color: AppColors.faint, fontSize: 12.5)),
        const SizedBox(height: 12),
        Center(child: TextButton(key: const ValueKey('support-retry'), onPressed: store.load, child: Text(s.retry))),
      ]);
    }
    if (store.tickets.isEmpty) {
      return ListView(padding: const EdgeInsets.symmetric(horizontal: 24), children: [
        const SizedBox(height: 90),
        Icon(Icons.support_agent_rounded, size: 56, color: AppColors.faint),
        const SizedBox(height: 12),
        Text(s.supportEmpty, key: const ValueKey('support-empty'), textAlign: TextAlign.center, style: const TextStyle(color: AppColors.muted, height: 1.4)),
      ]);
    }
    return ListView.separated(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
      itemCount: store.tickets.length,
      separatorBuilder: (_, __) => const SizedBox(height: 12),
      itemBuilder: (_, i) => _ticketCard(s, store.tickets[i]),
    );
  }

  Widget _ticketCard(Strings s, SupportTicket t) {
    final last = t.last;
    final preview = last == null ? '' : (last.text.isNotEmpty ? last.text : s.photoAlt);
    return SurfaceCard(
      key: ValueKey('ticket-${t.id}'),
      onTap: () => Navigator.of(context).push(supportThreadRoute(t.id)),
      padding: const EdgeInsets.all(14),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Container(
          height: 42,
          width: 42,
          decoration: BoxDecoration(color: AppColors.primary.withValues(alpha: 0.10), borderRadius: BorderRadius.circular(12)),
          child: const Icon(Icons.support_agent_rounded, color: AppColors.primary),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(t.subject, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14.5)),
            const SizedBox(height: 2),
            Text('${t.reference} · ${_stamp(t.updatedAt ?? t.createdAt)}', style: const TextStyle(color: AppColors.muted, fontSize: 12)),
            if (preview.isNotEmpty) ...[
              const SizedBox(height: 4),
              Text(preview, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 13, height: 1.3)),
            ],
            const SizedBox(height: 8),
            Wrap(spacing: 6, runSpacing: 6, children: [
              _statusBadge(s, t.status, key: ValueKey('status-${t.id}')),
              if (t.hasUnread)
                Pill(t.userUnread == 1 ? s.supportUnreadOne : s.supportUnreadMany(t.userUnread),
                    key: ValueKey('unread-${t.id}'), color: AppColors.primary, textColor: Colors.white),
            ]),
          ]),
        ),
      ]),
    );
  }
}

// ---------------------------------------------------------------------------
// Photos (shared by the form and the composer)
// ---------------------------------------------------------------------------

/// Asks camera or gallery, then returns the photos chosen (empty when cancelled). A refused permission or a failing
/// picker says so in a snackbar.
Future<List<PickedPhoto>> choosePhotos(BuildContext context, {required int remaining}) async {
  final s = Strings.of(context);
  if (remaining <= 0) {
    showSnack(context, s.photoLimit(kMaxSupportPhotos));
    return const [];
  }
  final camera = await showModalBottomSheet<bool>(
    context: context,
    showDragHandle: true,
    builder: (ctx) => SafeArea(
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        ListTile(key: const ValueKey('photo-camera'), leading: const Icon(Icons.photo_camera_rounded), title: Text(s.photoCamera), onTap: () => Navigator.pop(ctx, true)),
        ListTile(key: const ValueKey('photo-gallery'), leading: const Icon(Icons.photo_library_rounded), title: Text(s.photoGallery), onTap: () => Navigator.pop(ctx, false)),
      ]),
    ),
  );
  if (camera == null || !context.mounted) return const [];
  try {
    return await SupportStore.instance.picker.pick(camera: camera, limit: remaining);
  } catch (_) {
    if (context.mounted) showSnack(context, s.errPhotoPick);
    return const [];
  }
}

Widget _photoBroken(Strings s) => Semantics(
      label: s.photoUnavailable,
      child: Container(color: AppColors.line, alignment: Alignment.center, child: const Icon(Icons.broken_image_outlined, color: AppColors.faint)),
    );

/// A photo at [size]: tap to see it large.
class _Thumb extends StatelessWidget {
  final String? url;
  final String? path;
  final VoidCallback? onRemove;
  const _Thumb({this.url, this.path, this.onRemove});

  static const size = 72.0;

  Widget _image(Strings s, {BoxFit fit = BoxFit.cover}) => url != null
      ? Image.network(url!, fit: fit, errorBuilder: (_, __, ___) => _photoBroken(s))
      : Image.file(File(path!), fit: fit, errorBuilder: (_, __, ___) => _photoBroken(s));

  @override
  Widget build(BuildContext context) {
    final s = Strings.of(context);
    return Stack(clipBehavior: Clip.none, children: [
      Semantics(
        label: s.photoAlt,
        image: true,
        child: GestureDetector(
          onTap: () => showDialog<void>(
            context: context,
            builder: (ctx) => Dialog(
              clipBehavior: Clip.antiAlias,
              child: Column(mainAxisSize: MainAxisSize.min, children: [
                Flexible(child: InteractiveViewer(child: _image(s, fit: BoxFit.contain))),
                TextButton(onPressed: () => Navigator.pop(ctx), child: Text(s.close)),
              ]),
            ),
          ),
          child: ClipRRect(borderRadius: BorderRadius.circular(12), child: SizedBox(width: size, height: size, child: _image(s))),
        ),
      ),
      if (onRemove != null)
        Positioned(
          top: -6,
          right: -6,
          child: Tooltip(
            message: s.photoRemove,
            child: Material(
              color: AppColors.ink,
              shape: const CircleBorder(),
              child: InkWell(
                key: ValueKey('remove-photo-${path ?? url}'),
                customBorder: const CircleBorder(),
                onTap: onRemove,
                child: const Padding(padding: EdgeInsets.all(5), child: Icon(Icons.close_rounded, size: 14, color: Colors.white)),
              ),
            ),
          ),
        ),
    ]);
  }
}

/// The chosen (not yet sent) photos, each removable.
class _PendingPhotos extends StatelessWidget {
  final List<PickedPhoto> photos;
  final ValueChanged<PickedPhoto> onRemove;
  const _PendingPhotos({required this.photos, required this.onRemove});

  @override
  Widget build(BuildContext context) => photos.isEmpty
      ? const SizedBox.shrink()
      : Padding(
          padding: const EdgeInsets.only(bottom: 8, top: 4),
          child: Wrap(spacing: 10, runSpacing: 10, children: [for (final p in photos) _Thumb(path: p.path, onRemove: () => onRemove(p))]),
        );
}

/// Uploads the chosen photos one after the other and returns their URLs.
Future<List<String>> _uploadAll(List<PickedPhoto> photos) async {
  final urls = <String>[];
  for (final p in photos) {
    urls.add(await SupportStore.instance.uploader.upload(p));
  }
  return urls;
}

// ---------------------------------------------------------------------------
// New ticket
// ---------------------------------------------------------------------------

/// Open a ticket: subject and message are required; a category, one of the rider's tasks and photos are optional.
class NewTicketScreen extends StatefulWidget {
  const NewTicketScreen({super.key});
  @override
  State<NewTicketScreen> createState() => _NewTicketScreenState();
}

class _NewTicketScreenState extends State<NewTicketScreen> {
  final _subject = TextEditingController();
  final _message = TextEditingController();
  String _category = 'general';
  String? _orderId;
  final List<PickedPhoto> _photos = [];
  String? _subjectError;
  String? _messageError;
  bool _busy = false;

  @override
  void dispose() {
    _subject.dispose();
    _message.dispose();
    super.dispose();
  }

  /// One entry per order among the rider's tasks (several legs of one order share its reference).
  List<DeliveryTaskDto> get _orders {
    final seen = <String>{};
    return [for (final t in RiderStore.instance.myTasks) if (t.orderId.isNotEmpty && seen.add(t.orderId)) t];
  }

  Future<void> _addPhotos() async {
    final got = await choosePhotos(context, remaining: kMaxSupportPhotos - _photos.length);
    if (got.isEmpty || !mounted) return;
    final room = kMaxSupportPhotos - _photos.length;
    setState(() => _photos.addAll(got.take(room)));
    if (got.length > room) showSnack(context, Strings.of(context).photoLimit(kMaxSupportPhotos));
  }

  Future<void> _send() async {
    final s = Strings.of(context);
    setState(() {
      _subjectError = _subject.text.trim().isEmpty ? s.ticketSubjectRequired : null;
      _messageError = _message.text.trim().isEmpty ? s.ticketMessageRequired : null;
    });
    if (_subjectError != null || _messageError != null) {
      showSnack(context, _subjectError ?? _messageError!);
      return;
    }
    setState(() => _busy = true);
    try {
      final urls = await _uploadAll(_photos);
      final ticket = await SupportStore.instance
          .open(subject: _subject.text.trim(), message: _message.text.trim(), category: _category, orderId: _orderId, attachments: urls);
      if (!mounted) return;
      showSnack(context, s.ticketSent);
      Navigator.of(context).pop(ticket);
    } catch (e) {
      if (mounted) {
        setState(() => _busy = false);
        showSnack(context, Strings.current.errorText(e));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = Strings.of(context);
    final orders = _orders;
    return Scaffold(
      appBar: backAppBar(context, s.ticketTitle),
      body: ListView(padding: const EdgeInsets.fromLTRB(16, 8, 16, 24), children: [
        TextField(
          key: const ValueKey('ticket-subject'),
          controller: _subject,
          maxLength: 200,
          textCapitalization: TextCapitalization.sentences,
          onChanged: (_) => _subjectError == null ? null : setState(() => _subjectError = null),
          decoration: InputDecoration(labelText: s.ticketSubject, errorText: _subjectError, counterText: '', border: const OutlineInputBorder()),
        ),
        const SizedBox(height: 16),
        Text(s.ticketCategory, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13.5)),
        const SizedBox(height: 8),
        Wrap(spacing: 8, runSpacing: 8, children: [
          for (final c in kSupportCategories)
            ChoiceChip(key: ValueKey('cat-$c'), label: Text(s.t('cat_$c')), selected: _category == c, onSelected: (_) => setState(() => _category = c)),
        ]),
        if (orders.isNotEmpty) ...[
          const SizedBox(height: 16),
          DropdownButtonFormField<String?>(
            key: const ValueKey('ticket-order'),
            initialValue: _orderId,
            isExpanded: true,
            decoration: InputDecoration(labelText: s.ticketOrder, border: const OutlineInputBorder()),
            items: [
              DropdownMenuItem<String?>(value: null, child: Text(s.ticketOrderNone)),
              for (final t in orders) DropdownMenuItem<String?>(value: t.orderId, child: Text(t.orderReference, overflow: TextOverflow.ellipsis)),
            ],
            onChanged: (v) => setState(() => _orderId = v),
          ),
        ],
        const SizedBox(height: 16),
        TextField(
          key: const ValueKey('ticket-message'),
          controller: _message,
          minLines: 4,
          maxLines: 8,
          maxLength: 4000,
          textCapitalization: TextCapitalization.sentences,
          onChanged: (_) => _messageError == null ? null : setState(() => _messageError = null),
          decoration: InputDecoration(labelText: s.ticketMessage, errorText: _messageError, counterText: '', alignLabelWithHint: true, border: const OutlineInputBorder()),
        ),
        const SizedBox(height: 12),
        _PendingPhotos(photos: _photos, onRemove: (p) => setState(() => _photos.remove(p))),
        SizedBox(
          width: double.infinity,
          child: OutlinedButton(key: const ValueKey('ticket-add-photos'), onPressed: _busy ? null : _addPhotos, child: ButtonLabel(s.photosAdd)),
        ),
      ]),
      bottomNavigationBar: SafeArea(
        minimum: const EdgeInsets.fromLTRB(16, 8, 16, 12),
        child: PrimaryButton(s.ticketSend, key: const ValueKey('ticket-submit'), busy: _busy, onPressed: _send),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Thread
// ---------------------------------------------------------------------------

/// One ticket: its messages, a composer (text and photos), or - once the ticket is resolved or closed - a note and a
/// button to open a new one. Live: `support:updated` pushes land here through the store.
class SupportThreadScreen extends StatefulWidget {
  final String ticketId;
  const SupportThreadScreen({super.key, required this.ticketId});
  @override
  State<SupportThreadScreen> createState() => _SupportThreadScreenState();
}

class _SupportThreadScreenState extends State<SupportThreadScreen> {
  final store = SupportStore.instance;
  final _input = TextEditingController();
  final _scroll = ScrollController();
  final List<PickedPhoto> _photos = [];
  Object? _loadError;
  bool _busy = false;
  bool _marking = false;
  int _seen = -1;

  @override
  void initState() {
    super.initState();
    if (store.byId(widget.ticketId) == null) _fetch();
  }

  @override
  void dispose() {
    _input.dispose();
    _scroll.dispose();
    super.dispose();
  }

  Future<void> _fetch() async {
    setState(() => _loadError = null);
    try {
      await store.fetch(widget.ticketId);
    } catch (e) {
      if (mounted) {
        setState(() => _loadError = e);
        showSnack(context, Strings.current.errorText(e));
      }
    }
  }

  /// Opening the thread (and a reply arriving while it is open) reads it: the badge goes.
  void _afterBuild(SupportTicket t) {
    if (t.hasUnread && !_marking) {
      _marking = true;
      WidgetsBinding.instance.addPostFrameCallback((_) async {
        await store.markRead(t.id);
        _marking = false;
      });
    }
    if (t.messages.length != _seen) {
      _seen = t.messages.length;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (_scroll.hasClients) _scroll.jumpTo(_scroll.position.maxScrollExtent);
      });
    }
  }

  Future<void> _addPhotos() async {
    final got = await choosePhotos(context, remaining: kMaxSupportPhotos - _photos.length);
    if (got.isEmpty || !mounted) return;
    final room = kMaxSupportPhotos - _photos.length;
    setState(() => _photos.addAll(got.take(room)));
  }

  Future<void> _send(SupportTicket t) async {
    final s = Strings.of(context);
    final text = _input.text.trim();
    if (text.isEmpty && _photos.isEmpty) {
      showSnack(context, s.threadEmptyMessage);
      return;
    }
    setState(() => _busy = true);
    try {
      final urls = await _uploadAll(_photos);
      await store.reply(t.id, text: text, attachments: urls);
      if (!mounted) return;
      _input.clear();
      setState(() => _photos.clear());
      showSnack(context, s.msgSent);
    } catch (e) {
      if (mounted) showSnack(context, Strings.current.errorText(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _newTicket() async {
    final t = await openNewTicket(context);
    if (t != null && mounted) Navigator.of(context).pushReplacement(supportThreadRoute(t.id));
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: store,
      builder: (context, _) {
        final s = Strings.of(context);
        final t = store.byId(widget.ticketId);
        if (t == null) {
          return Scaffold(
            appBar: backAppBar(context, s.support),
            body: _loadError == null
                ? const Center(child: CircularProgressIndicator())
                : Center(
                    child: Padding(
                      padding: const EdgeInsets.all(24),
                      child: Column(mainAxisSize: MainAxisSize.min, children: [
                        Text(s.errorText(_loadError!), key: const ValueKey('thread-error'), textAlign: TextAlign.center, style: const TextStyle(color: AppColors.muted)),
                        const SizedBox(height: 8),
                        TextButton(key: const ValueKey('thread-retry'), onPressed: _fetch, child: Text(s.retry)),
                      ]),
                    ),
                  ),
          );
        }
        _afterBuild(t);
        final userId = RiderStore.instance.user?.id;
        return Scaffold(
          appBar: backAppBar(context, t.reference.isEmpty ? s.support : t.reference),
          body: Column(children: [
            _header(s, t),
            Expanded(
              child: ListView.separated(
                controller: _scroll,
                padding: const EdgeInsets.fromLTRB(16, 4, 16, 12),
                itemCount: t.messages.length,
                separatorBuilder: (_, __) => const SizedBox(height: 10),
                itemBuilder: (_, i) => _bubble(s, t.messages[i], userId),
              ),
            ),
            t.isClosed ? _closedNote(s, t) : _composer(s, t),
          ]),
        );
      },
    );
  }

  Widget _header(Strings s, SupportTicket t) {
    final order = t.orderId == null ? null : RiderStore.instance.myTasks.where((x) => x.orderId == t.orderId).map((x) => x.orderReference).firstOrNull;
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
      child: SurfaceCard(
        padding: const EdgeInsets.all(14),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(t.subject, key: const ValueKey('thread-subject'), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15, height: 1.25)),
          const SizedBox(height: 8),
          Wrap(spacing: 6, runSpacing: 6, children: [
            _statusBadge(s, t.status, key: const ValueKey('thread-status')),
            Pill(s.has('cat_${t.category}') ? s.t('cat_${t.category}') : t.category, color: AppColors.primary.withValues(alpha: 0.10), textColor: AppColors.primary),
            if (order != null) Pill(s.ticketOrderRef(order), color: AppColors.violet.withValues(alpha: 0.12), textColor: AppColors.violet),
          ]),
        ]),
      ),
    );
  }

  Widget _bubble(Strings s, SupportMessage m, String? userId) {
    final mine = m.isMine(userId);
    final who = mine ? s.threadYou : (m.role.startsWith('admin') ? s.threadSupport : (m.from.isEmpty ? s.threadSupport : m.from));
    return Align(
      alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
      child: ConstrainedBox(
        constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.82),
        child: Container(
          key: ValueKey('msg-${m.id}'),
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: mine ? AppColors.primary.withValues(alpha: 0.10) : AppColors.surface,
            borderRadius: BorderRadius.circular(16),
            boxShadow: mine ? null : AppShadow.card,
          ),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('$who · ${_stamp(m.at)}', style: const TextStyle(color: AppColors.muted, fontSize: 11.5, fontWeight: FontWeight.w600)),
            if (m.text.isNotEmpty) ...[const SizedBox(height: 4), Text(m.text, style: const TextStyle(fontSize: 14, height: 1.35))],
            if (m.attachments.isNotEmpty) ...[
              const SizedBox(height: 8),
              Wrap(spacing: 8, runSpacing: 8, children: [for (final u in m.attachments) _Thumb(url: u)]),
            ],
          ]),
        ),
      ),
    );
  }

  Widget _closedNote(Strings s, SupportTicket t) => Material(
        color: AppColors.surface,
        elevation: 6,
        child: SafeArea(
          top: false,
          minimum: const EdgeInsets.only(bottom: 8),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
            child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(s.threadClosed(_ticketStatus(s, t.status).toLowerCase()), key: const ValueKey('thread-closed'), style: const TextStyle(color: AppColors.muted, height: 1.35)),
              const SizedBox(height: 10),
              PrimaryButton(s.supportOpenNew, key: const ValueKey('thread-new-ticket'), onPressed: _newTicket),
            ]),
          ),
        ),
      );

  Widget _composer(Strings s, SupportTicket t) => Material(
        color: AppColors.surface,
        elevation: 6,
        child: SafeArea(
          top: false,
          minimum: const EdgeInsets.only(bottom: 8),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(8, 8, 12, 4),
            child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
              if (_photos.isNotEmpty) Padding(padding: const EdgeInsets.only(left: 8), child: _PendingPhotos(photos: _photos, onRemove: (p) => setState(() => _photos.remove(p)))),
              Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
                IconButton(key: const ValueKey('attach-photo'), tooltip: s.photoAttach, onPressed: _busy ? null : _addPhotos, icon: const Icon(Icons.attach_file_rounded)),
                Expanded(
                  child: TextField(
                    key: const ValueKey('thread-input'),
                    controller: _input,
                    minLines: 1,
                    maxLines: 4,
                    maxLength: 4000,
                    textCapitalization: TextCapitalization.sentences,
                    decoration: InputDecoration(hintText: s.threadHint, counterText: '', isDense: true, border: const OutlineInputBorder()),
                  ),
                ),
                const SizedBox(width: 8),
                FilledButton(
                  key: const ValueKey('thread-send'),
                  style: FilledButton.styleFrom(minimumSize: const Size(0, 48), padding: const EdgeInsets.symmetric(horizontal: 14)),
                  onPressed: _busy ? null : () => _send(t),
                  child: _busy ? const ButtonSpinner() : ButtonLabel(s.threadSend),
                ),
              ]),
            ]),
          ),
        ),
      );
}
