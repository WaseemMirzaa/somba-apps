import 'package:flutter/material.dart';
import '../../l10n/strings.dart';
import '../../services/chat_store.dart';
import '../../theme/app_theme.dart';
import '../../widgets/feedback.dart';
import '../../widgets/kit.dart';
import '../../widgets/translatable_text.dart';
import 'chat_inbox.dart' show chatContextLine, chatStoreName;
import 'chat_widgets.dart';
import 'support_screens.dart' show NewTicketScreen;

/// One OLD conversation with a store, read-only: messaging stores is closed, so there is no composer. The messages (older
/// pages on request) show with the translation of the store's text, and a note says why nothing can be sent, with
/// "Contact support" (a new ticket linked to the same order) for anything new.
class ChatThreadScreen extends StatefulWidget {
  const ChatThreadScreen({super.key, required this.conversation, this.locale = const Locale('en')});
  final ChatConversation conversation;
  final Locale locale;

  @override
  State<ChatThreadScreen> createState() => _ChatThreadScreenState();
}

class _ChatThreadScreenState extends State<ChatThreadScreen> {
  final _store = ChatStore.instance;
  late ChatConversation _conv = widget.conversation;
  List<ChatMessage> _messages = [];
  bool _loading = true;
  bool _hasMore = false;
  bool _loadingOlder = false;
  Object? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final page = await _store.messages(_conv.id, limit: ChatStore.pageSize);
      if (!mounted) return;
      setState(() {
        _messages = page.messages;
        _hasMore = page.hasMore;
        _conv = page.conversation ?? _conv;
        _loading = false;
      });
    } catch (e) {
      if (mounted) {
        setState(() {
          _loading = false;
          _error = e;
        });
      }
    }
  }

  Future<void> _loadOlder() async {
    if (_loadingOlder || _messages.isEmpty) return;
    setState(() => _loadingOlder = true);
    try {
      final page = await _store.messages(_conv.id, before: _messages.first.id, limit: ChatStore.pageSize);
      if (!mounted) return;
      setState(() {
        final known = _messages.map((m) => m.id).toSet();
        _messages = [...page.messages.where((m) => !known.contains(m.id)), ..._messages];
        _hasMore = page.hasMore;
      });
    } catch (e) {
      if (mounted) showError(context, e);
    } finally {
      if (mounted) setState(() => _loadingOlder = false);
    }
  }

  /// "Contact support" from the closed chat: a new ticket about the same order or product.
  void _contactSupport(Strings s) {
    final name = _conv.displayProductName(s.lang);
    final about = (_conv.orderId ?? '').isEmpty && name != null ? s.supportAboutProduct(name) : null;
    Navigator.push(
      context,
      MaterialPageRoute<void>(
        builder: (_) => NewTicketScreen(orderId: _conv.orderId, category: (_conv.orderId ?? '').isEmpty ? null : 'order', initialSubject: about, locale: widget.locale),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final s = Strings.of(context);
    final ctx = chatContextLine(s, _conv);
    return Scaffold(
      appBar: backAppBar(context, chatStoreName(s, _conv)),
      bottomNavigationBar: NoteBar(
        key: const ValueKey('chat-closed-note'),
        text: s.chatClosedNote,
        children: [FilledButton(key: const ValueKey('chat-contact-support'), onPressed: () => _contactSupport(s), child: ButtonLabel(s.contactSupport))],
      ),
      body: Column(children: [
        if (ctx != null) _ContextHeader(conversation: _conv, line: ctx),
        Expanded(child: _body(s)),
      ]),
    );
  }

  Widget _body(Strings s) {
    if (_loading) return const Center(child: CircularProgressIndicator());
    if (_error != null) return LoadFailed(error: _error!, onRetry: _load);
    if (_messages.isEmpty) {
      return Center(child: Text(s.chatEmptyThread, style: const TextStyle(color: AppColors.muted)));
    }
    // Newest at the bottom: the list is reversed, so index 0 is the latest message and the last index is the top.
    final extra = _hasMore ? 1 : 0;
    return ListView.builder(
      key: const ValueKey('chat-messages'),
      reverse: true,
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
      itemCount: _messages.length + extra,
      itemBuilder: (_, i) {
        if (i == _messages.length) {
          return Padding(
            padding: const EdgeInsets.only(bottom: AppSpace.md),
            child: Center(
              child: TextButton(
                key: const ValueKey('chat-older'),
                onPressed: _loadingOlder ? null : _loadOlder,
                child: Text(_loadingOlder ? '…' : s.chatOlder),
              ),
            ),
          );
        }
        return ChatBubble(message: _messages[_messages.length - 1 - i]);
      },
    );
  }
}

/// What the chat is about (a product or an order), under the app bar.
class _ContextHeader extends StatelessWidget {
  const _ContextHeader({required this.conversation, required this.line});
  final ChatConversation conversation;
  final String line;

  @override
  Widget build(BuildContext context) {
    final image = conversation.productImage;
    return Container(
      key: const ValueKey('chat-context'),
      width: double.infinity,
      color: AppColors.surface,
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 12),
      child: Row(children: [
        Container(
          width: 40,
          height: 40,
          clipBehavior: Clip.antiAlias,
          decoration: BoxDecoration(color: AppColors.primary.withValues(alpha: 0.10), borderRadius: BorderRadius.circular(AppRadius.sm)),
          child: (image ?? '').isNotEmpty && (conversation.orderId ?? '').isEmpty
              ? RemoteImage(image!, fallbackIcon: Icons.shopping_bag_outlined)
              : Icon((conversation.orderId ?? '').isNotEmpty ? Icons.receipt_long_rounded : Icons.shopping_bag_outlined, color: AppColors.primary, size: 21),
        ),
        const SizedBox(width: AppSpace.md),
        Expanded(child: Text(line, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13.5))),
      ]),
    );
  }
}

/// One message: the customer's on the right, the store's on the left (with its sender, a translate link and photos).
class ChatBubble extends StatelessWidget {
  const ChatBubble({super.key, required this.message});
  final ChatMessage message;

  @override
  Widget build(BuildContext context) {
    final s = Strings.of(context);
    final m = message;
    final mine = m.mine;
    final fg = mine ? Colors.white : AppColors.ink;
    final textStyle = TextStyle(color: fg, fontSize: 13.5, height: 1.35);
    return Align(
      alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
      child: Padding(
        padding: const EdgeInsets.only(bottom: AppSpace.md),
        child: Column(crossAxisAlignment: mine ? CrossAxisAlignment.end : CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
          Container(
            key: ValueKey('chat-msg-${m.id}'),
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
              if (!mine && m.senderName.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.only(bottom: 2),
                  child: Text(m.senderName, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(color: AppColors.muted, fontSize: 11.5, fontWeight: FontWeight.w700)),
                ),
              if (m.text.isNotEmpty)
                mine
                    ? Text(m.text, style: textStyle)
                    : TranslatableText(kind: 'chat_message', id: m.id, auto: true, i18n: m.textI18n, text: m.text, style: textStyle),
              if (m.attachments.isNotEmpty)
                Padding(
                  padding: EdgeInsets.only(top: m.text.isEmpty ? 0 : AppSpace.sm),
                  child: AttachmentThumbs(m.attachments, size: 88, keyPrefix: 'chat-photo-${m.id}'),
                ),
            ]),
          ),
          if (m.createdAt != null)
            Padding(
              padding: const EdgeInsets.only(top: 3, left: 4, right: 4),
              child: Text(s.when(m.createdAt!), style: const TextStyle(color: AppColors.faint, fontSize: 10.5)),
            ),
        ]),
      ),
    );
  }
}
