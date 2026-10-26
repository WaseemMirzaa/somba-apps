import 'package:flutter/material.dart';
import '../../l10n/strings.dart';
import '../../services/chat_store.dart';
import '../../theme/app_theme.dart';
import '../../widgets/feedback.dart';
import '../../widgets/kit.dart';
import 'chat_thread.dart';
import 'chat_widgets.dart';

/// "14:05" for today, a date for earlier days.
String chatTime(Strings s, DateTime? d) {
  if (d == null) return '';
  final now = DateTime.now();
  final today = now.year == d.year && now.month == d.month && now.day == d.day;
  return today ? s.time(d) : s.date(d);
}

/// The store a conversation is with, or a neutral word when the server sent no name.
String chatStoreName(Strings s, ChatConversation c) => c.storeName.isEmpty ? s.chatStoreFallback : c.storeName;

/// What a conversation is about: the product or the order it started from (null for a general question).
String? chatContextLine(Strings s, ChatConversation c) {
  if ((c.orderId ?? '').isNotEmpty) {
    final ref = c.orderReference;
    return ref == null ? s.chatCtxOrderPlain : s.chatCtxOrder(ref);
  }
  final name = c.productName;
  if ((c.productId ?? '').isNotEmpty) return name == null ? null : s.chatCtxProduct(name);
  return null;
}

/// Messages: the shopper's conversations with stores, newest first, with unread badges, live.
class ChatInboxScreen extends StatefulWidget {
  const ChatInboxScreen({super.key, this.locale = const Locale('en')});
  final Locale locale;

  @override
  State<ChatInboxScreen> createState() => _ChatInboxScreenState();
}

class _ChatInboxScreenState extends State<ChatInboxScreen> {
  final _store = ChatStore.instance;
  Object? _error;

  @override
  void initState() {
    super.initState();
    _reload(initial: true);
  }

  /// A failure on an empty screen is shown in place with a retry button; on a list already on screen it is a snackbar.
  Future<void> _reload({bool initial = false, bool more = false}) async {
    try {
      await _store.loadConversations(more: more);
      if (mounted) setState(() => _error = null);
    } catch (e) {
      if (!mounted) return;
      if (_store.loaded && _store.conversations.isNotEmpty) {
        showError(context, e);
      } else {
        setState(() => _error = e);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = Strings.of(context);
    return Scaffold(
      appBar: backAppBar(context, s.chatInboxTitle),
      body: ListenableBuilder(
        listenable: _store,
        builder: (context, _) {
          if (_error != null && _store.conversations.isEmpty) {
            return LoadFailed(error: _error!, onRetry: () {
              setState(() => _error = null);
              _reload();
            });
          }
          if (!_store.loaded) return const Center(child: CircularProgressIndicator());
          final rows = _store.conversations;
          return RefreshIndicator(
            onRefresh: () async {
              await _reload();
              await _store.refreshUnread().catchError((Object _) {});
            },
            child: ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
              children: [
                if (rows.isEmpty) Panel(child: Text(s.chatInboxEmpty, key: const ValueKey('chat-empty'), style: const TextStyle(color: AppColors.muted, height: 1.4))),
                for (final c in rows)
                  Padding(
                    padding: const EdgeInsets.only(bottom: AppSpace.md),
                    child: ConversationTile(
                      conversation: c,
                      onTap: () => Navigator.push(context, MaterialPageRoute<void>(builder: (_) => ChatThreadScreen(conversation: c, locale: widget.locale))),
                    ),
                  ),
                if (_store.hasMoreConversations)
                  Center(
                    child: TextButton(
                      key: const ValueKey('chat-more'),
                      onPressed: _store.loading ? null : () => _reload(more: true),
                      child: Text(_store.loading ? '…' : s.chatMoreConvs),
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

/// One conversation row: the store (logo, name), what it is about, the last message, its time and the unread badge.
class ConversationTile extends StatelessWidget {
  const ConversationTile({super.key, required this.conversation, required this.onTap});
  final ChatConversation conversation;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final s = Strings.of(context);
    final c = conversation;
    final unread = c.unread > 0;
    final ctx = chatContextLine(s, c);
    final name = chatStoreName(s, c);
    return Semantics(
      label: unread ? s.chatUnreadN(c.unread) : null,
      child: Material(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(20),
        elevation: 0,
        child: InkWell(
          key: ValueKey('chat-tile-${c.id}'),
          borderRadius: BorderRadius.circular(20),
          onTap: onTap,
          child: Ink(
            decoration: BoxDecoration(borderRadius: BorderRadius.circular(20), boxShadow: AppShadow.card),
            child: Padding(
              padding: const EdgeInsets.all(AppSpace.lg),
              child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                _StoreAvatar(name: name, logo: c.storeLogo),
                const SizedBox(width: AppSpace.md),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Row(children: [
                      Expanded(
                        child: Text(name,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(fontWeight: unread ? FontWeight.w800 : FontWeight.w700, fontSize: 14.5)),
                      ),
                      const SizedBox(width: AppSpace.sm),
                      Text(chatTime(s, c.lastMessageAt), maxLines: 1, style: const TextStyle(color: AppColors.muted, fontSize: 11.5)),
                    ]),
                    if (ctx != null) ...[
                      const SizedBox(height: 3),
                      Text(ctx, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(color: AppColors.primary, fontSize: 12, fontWeight: FontWeight.w600)),
                    ],
                    const SizedBox(height: 3),
                    Row(children: [
                      Expanded(
                        child: Text(c.lastMessagePreview,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(color: unread ? AppColors.ink : AppColors.muted, fontSize: 13, height: 1.3, fontWeight: unread ? FontWeight.w600 : FontWeight.w400)),
                      ),
                      if (unread) ...[const SizedBox(width: AppSpace.sm), CountBadge(c.unread, semanticLabel: s.chatUnreadN(c.unread))],
                    ]),
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

class _StoreAvatar extends StatelessWidget {
  const _StoreAvatar({required this.name, this.logo});
  final String name;
  final String? logo;

  @override
  Widget build(BuildContext context) {
    final initial = name.trim().isEmpty ? '?' : name.trim().substring(0, 1).toUpperCase();
    return Container(
      width: 44,
      height: 44,
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(color: AppColors.primary.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(14)),
      child: (logo ?? '').isNotEmpty
          ? RemoteImage(logo!, fallbackIcon: Icons.storefront_outlined)
          : Center(child: Text(initial, style: const TextStyle(color: AppColors.primary, fontWeight: FontWeight.w800, fontSize: 18))),
    );
  }
}
