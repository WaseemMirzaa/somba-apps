import 'package:flutter/material.dart';
import '../../l10n/strings.dart';
import '../../services/chat_store.dart';
import '../../services/realtime_store.dart';
import '../../theme/app_theme.dart';
import '../../widgets/feedback.dart';
import '../../widgets/kit.dart';
import '../../widgets/photo_picker.dart';
import 'chat_thread.dart';

/// The first message to a store. Nothing is created until it is sent (`chat:start`); then the chat continues in the
/// thread screen. [productId] / [orderId] say what the question is about.
class ChatComposeScreen extends StatefulWidget {
  const ChatComposeScreen({super.key, required this.sellerId, this.storeName, this.productId, this.orderId, this.locale = const Locale('en')});
  final String sellerId;
  final String? storeName;
  final String? productId;
  final String? orderId;
  final Locale locale;

  @override
  State<ChatComposeScreen> createState() => _ChatComposeScreenState();
}

class _ChatComposeScreenState extends State<ChatComposeScreen> {
  final _text = TextEditingController();
  final _attachments = PhotoAttachments(max: kChatMaxPhotos);
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _text.dispose();
    _attachments.dispose();
    super.dispose();
  }

  String _store(Strings s) => (widget.storeName ?? '').isEmpty ? s.chatStoreFallback : widget.storeName!;

  /// The product or order the message is about, from what the app already has.
  String? _contextLine(Strings s) {
    final store = RealtimeStore.instance;
    final orderId = widget.orderId;
    if ((orderId ?? '').isNotEmpty) {
      final o = store.orderById(orderId!);
      return o == null ? s.chatCtxOrderPlain : s.chatCtxOrder(o.reference);
    }
    final productId = widget.productId;
    if ((productId ?? '').isNotEmpty) {
      for (final p in store.products) {
        if (p.id == productId) return s.chatCtxProduct(s.isFr && p.nameFr.isNotEmpty ? p.nameFr : p.name);
      }
    }
    return null;
  }

  Future<void> _send() async {
    final s = Strings.of(context);
    final text = _text.text.trim();
    if (text.isEmpty) {
      setState(() => _error = s.chatComposeRequired);
      showSnack(context, s.socialCheckFields);
      return;
    }
    if (_attachments.busy) {
      showSnack(context, s.photoWait);
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    final nav = Navigator.of(context);
    try {
      final r = await ChatStore.instance.start(
        sellerId: widget.sellerId,
        productId: widget.productId,
        orderId: widget.orderId,
        text: text,
        attachments: _attachments.urls,
      );
      if (!mounted) return;
      showSnack(context, s.chatSentTo(_store(s)));
      nav.pushReplacement(MaterialPageRoute<void>(builder: (_) => ChatThreadScreen(conversation: r.conversation, locale: widget.locale)));
    } catch (e) {
      if (!mounted) return;
      setState(() => _busy = false);
      showError(context, e);
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = Strings.of(context);
    final ctx = _contextLine(s);
    return Scaffold(
      appBar: backAppBar(context, s.chatComposeTitle),
      body: ListView(padding: const EdgeInsets.fromLTRB(16, 8, 16, 24), children: [
        Panel(
          child: Row(children: [
            Container(
              width: 44,
              height: 44,
              decoration: BoxDecoration(color: AppColors.primary.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(14)),
              child: const Icon(Icons.storefront_outlined, color: AppColors.primary),
            ),
            const SizedBox(width: AppSpace.md),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(_store(s), maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
                if (ctx != null) ...[
                  const SizedBox(height: 2),
                  Text(ctx, key: const ValueKey('compose-context'), maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(color: AppColors.primary, fontSize: 12.5, fontWeight: FontWeight.w600)),
                ],
              ]),
            ),
          ]),
        ),
        const SizedBox(height: AppSpace.lg),
        Text(s.chatComposeIntro(_store(s)), style: const TextStyle(color: AppColors.muted, fontSize: 13, height: 1.4)),
        const SizedBox(height: AppSpace.lg),
        TextField(
          key: const ValueKey('compose-text'),
          controller: _text,
          minLines: 5,
          maxLines: 8,
          maxLength: 2000,
          textCapitalization: TextCapitalization.sentences,
          onChanged: (_) {
            if (_error != null) setState(() => _error = null);
          },
          decoration: InputDecoration(hintText: s.chatComposeHint, errorText: _error),
        ),
        const SizedBox(height: AppSpace.sm),
        PhotoPickerField(attachments: _attachments),
        const SizedBox(height: AppSpace.lg + AppSpace.sm),
        PrimaryButton(s.chatComposeSend, busy: _busy, onPressed: _send),
      ]),
    );
  }
}
