import 'package:flutter/material.dart';
import '../../l10n/strings.dart';
import '../../services/chat_store.dart';
import '../../services/realtime_store.dart';
import '../../widgets/feedback.dart';
import '../../widgets/kit.dart';
import 'chat_compose.dart';
import 'chat_thread.dart';

/// "Message the seller": opens (or starts) the chat with a store, from a product, a store page or an order.
/// The chat module owns this widget; other screens only place it. Give the context you start from.
///
/// Opening the compose screen creates nothing: the conversation is created by the first message. When the inbox
/// already holds a thread for the same store and context, that thread opens instead.
class MessageSellerButton extends StatefulWidget {
  const MessageSellerButton({super.key, required this.sellerId, this.storeName, this.productId, this.orderId, this.locale = const Locale('en')});

  final String sellerId;
  final String? storeName;
  final String? productId;
  final String? orderId;
  final Locale locale;

  @override
  State<MessageSellerButton> createState() => _MessageSellerButtonState();
}

class _MessageSellerButtonState extends State<MessageSellerButton> {
  bool _busy = false;

  Future<void> _open() async {
    if (_busy) return;
    final store = ChatStore.instance;
    final nav = Navigator.of(context);
    setState(() => _busy = true);
    try {
      // The inbox may not be loaded yet (first launch, slow network): ask before deciding there is no thread.
      if (!store.loaded) {
        try {
          await store.loadConversations();
        } catch (_) {
          // Offline: the compose screen still opens, and sending reports the failure.
        }
      }
      final existing = store.existingFor(sellerId: widget.sellerId, productId: widget.productId, orderId: widget.orderId);
      if (!mounted) return;
      nav.push(MaterialPageRoute<void>(
        builder: (_) => existing != null
            ? ChatThreadScreen(conversation: existing, locale: widget.locale)
            : ChatComposeScreen(
                sellerId: widget.sellerId,
                storeName: widget.storeName,
                productId: widget.productId,
                orderId: widget.orderId,
                locale: widget.locale,
              ),
      ));
    } catch (e) {
      if (mounted) showError(context, e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final user = RealtimeStore.instance.user;
    // Only a signed-in shopper can message a store.
    if (user == null || (user.role != 'customer')) return const SizedBox.shrink();
    final s = Strings.of(context);
    return OutlinedButton(
      key: const ValueKey('message-seller'),
      onPressed: _busy ? null : _open,
      child: _busy ? const ButtonSpinner() : ButtonLabel(s.chatMessageSeller),
    );
  }
}
