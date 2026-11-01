import 'package:flutter/material.dart';
import '../../l10n/strings.dart';
import '../../services/env.dart';
import '../../theme/app_theme.dart';
import '../../widgets/kit.dart';
import '../../widgets/photo_picker.dart';

/// A stored upload as a loadable address (the platform answers `/uploads/…` paths relative to its host).
String chatImageUrl(String url) {
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  return '${Env.apiUrl}${url.startsWith('/') ? '' : '/'}$url';
}

/// A network picture that falls back to a quiet tile when it can't load (offline, removed).
class RemoteImage extends StatelessWidget {
  const RemoteImage(this.url, {super.key, this.fit = BoxFit.cover, this.fallbackIcon = Icons.image_outlined});
  final String url;
  final BoxFit fit;
  final IconData fallbackIcon;

  @override
  Widget build(BuildContext context) => Image.network(
        chatImageUrl(url),
        fit: fit,
        errorBuilder: (_, __, ___) => ColoredBox(color: AppColors.line, child: Center(child: Icon(fallbackIcon, color: AppColors.faint))),
      );
}

/// The red count badge on a menu row or a conversation (nothing at zero; 99+ above).
class CountBadge extends StatelessWidget {
  const CountBadge(this.count, {super.key, this.semanticLabel});
  final int count;
  final String? semanticLabel;

  @override
  Widget build(BuildContext context) {
    if (count <= 0) return const SizedBox.shrink();
    return Semantics(
      label: semanticLabel,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
        constraints: const BoxConstraints(minWidth: 20, minHeight: 20),
        decoration: const BoxDecoration(color: AppColors.primary, borderRadius: AppRadius.pill),
        alignment: Alignment.center,
        child: ExcludeSemantics(
          child: Text(count > 99 ? '99+' : '$count',
              maxLines: 1, style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w800, height: 1.1)),
        ),
      ),
    );
  }
}

/// Photos attached to a message, as thumbnails; a tap opens them full screen.
class AttachmentThumbs extends StatelessWidget {
  const AttachmentThumbs(this.urls, {super.key, this.size = 96, this.keyPrefix = 'chat-photo'});
  final List<String> urls;
  final double size;
  final String keyPrefix;

  @override
  Widget build(BuildContext context) {
    if (urls.isEmpty) return const SizedBox.shrink();
    final s = Strings.of(context);
    return Wrap(spacing: AppSpace.sm, runSpacing: AppSpace.sm, children: [
      for (var i = 0; i < urls.length; i++)
        Semantics(
          label: s.chatPhotoAlt,
          button: true,
          image: true,
          child: GestureDetector(
            key: ValueKey('$keyPrefix-$i'),
            onTap: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => PhotoViewerScreen(urls: urls, initial: i))),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(AppRadius.sm),
              child: SizedBox(width: size, height: size, child: RemoteImage(urls[i])),
            ),
          ),
        ),
    ]);
  }
}

/// Full-screen photo viewer: swipe between the photos of a message, pinch to zoom.
class PhotoViewerScreen extends StatefulWidget {
  const PhotoViewerScreen({super.key, required this.urls, this.initial = 0});
  final List<String> urls;
  final int initial;

  @override
  State<PhotoViewerScreen> createState() => _PhotoViewerScreenState();
}

class _PhotoViewerScreenState extends State<PhotoViewerScreen> {
  late final PageController _page = PageController(initialPage: widget.initial);
  late int _index = widget.initial;

  @override
  void dispose() {
    _page.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final s = Strings.of(context);
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.black,
        foregroundColor: Colors.white,
        elevation: 0,
        title: Text(s.chatViewPhoto(_index + 1, widget.urls.length), style: const TextStyle(color: Colors.white, fontSize: 15)),
        leading: IconButton(
          key: const ValueKey('photo-viewer-close'),
          tooltip: s.close,
          icon: const Icon(Icons.close_rounded, color: Colors.white),
          onPressed: () => Navigator.of(context).maybePop(),
        ),
      ),
      body: PageView.builder(
        controller: _page,
        itemCount: widget.urls.length,
        onPageChanged: (i) => setState(() => _index = i),
        itemBuilder: (_, i) => InteractiveViewer(
          minScale: 1,
          maxScale: 4,
          child: Center(child: RemoteImage(widget.urls[i], fit: BoxFit.contain, fallbackIcon: Icons.broken_image_outlined)),
        ),
      ),
    );
  }
}

/// The message box of a chat or a ticket: text, an attach button that opens the photo tray, and a send button.
/// Both buttons are icon-only; while [sending] the send icon becomes a spinner of the same size.
/// Put it in a Scaffold's `bottomNavigationBar` so a snackbar floats above it and the keyboard lifts it.
class MessageComposer extends StatefulWidget {
  const MessageComposer({
    super.key,
    required this.controller,
    required this.attachments,
    required this.onSend,
    this.sending = false,
    this.hint,
    this.maxLength = 2000,
  });

  final TextEditingController controller;
  final PhotoAttachments attachments;
  final VoidCallback onSend;
  final bool sending;
  final String? hint;
  final int maxLength;

  @override
  State<MessageComposer> createState() => _MessageComposerState();
}

class _MessageComposerState extends State<MessageComposer> {
  bool _tray = false;

  @override
  Widget build(BuildContext context) {
    final s = Strings.of(context);
    return Material(
      color: AppColors.surface,
      elevation: 6,
      child: Padding(
        padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
        child: SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(AppSpace.sm, AppSpace.sm, AppSpace.md, AppSpace.sm),
            child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              ListenableBuilder(
                listenable: widget.attachments,
                builder: (context, _) => (_tray || !widget.attachments.isEmpty)
                    ? Padding(
                        padding: const EdgeInsets.fromLTRB(AppSpace.sm, AppSpace.xs, 0, AppSpace.sm),
                        child: PhotoPickerField(attachments: widget.attachments),
                      )
                    : const SizedBox.shrink(),
              ),
              Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
                IconButton(
                  key: const ValueKey('chat-attach'),
                  tooltip: s.chatAttach,
                  onPressed: () => setState(() => _tray = !_tray),
                  icon: Icon(Icons.add_photo_alternate_outlined, color: _tray ? AppColors.primary : AppColors.muted),
                ),
                Expanded(
                  child: TextField(
                    key: const ValueKey('chat-input'),
                    controller: widget.controller,
                    minLines: 1,
                    maxLines: 4,
                    maxLength: widget.maxLength,
                    buildCounter: (_, {required currentLength, required isFocused, maxLength}) => null,
                    textCapitalization: TextCapitalization.sentences,
                    decoration: InputDecoration(
                      hintText: widget.hint ?? s.chatInputHint,
                      filled: true,
                      fillColor: AppColors.background,
                      isDense: true,
                      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(22), borderSide: const BorderSide(color: AppColors.line)),
                      enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(22), borderSide: const BorderSide(color: AppColors.line)),
                    ),
                  ),
                ),
                const SizedBox(width: AppSpace.sm),
                Material(
                  color: AppColors.primary,
                  shape: const CircleBorder(),
                  child: InkWell(
                    key: const ValueKey('chat-send'),
                    customBorder: const CircleBorder(),
                    onTap: widget.sending ? null : widget.onSend,
                    child: Semantics(
                      button: true,
                      label: s.send,
                      child: SizedBox(
                        width: 46,
                        height: 46,
                        child: Center(
                          child: widget.sending
                              ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2.4, color: Colors.white))
                              : const Icon(Icons.send_rounded, color: Colors.white, size: 21),
                        ),
                      ),
                    ),
                  ),
                ),
              ]),
            ]),
          ),
        ),
      ),
    );
  }
}

/// A rounded, soft-shadow info line (suspended store, closed ticket…) in the app's card style.
class NoteBar extends StatelessWidget {
  const NoteBar({super.key, required this.text, this.children = const []});
  final String text;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) => Material(
        color: AppColors.surface,
        elevation: 6,
        child: SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.all(AppSpace.lg),
            child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Text(text, textAlign: TextAlign.center, style: const TextStyle(color: AppColors.inkSoft, fontSize: 13.5, height: 1.35)),
              for (final c in children) ...[const SizedBox(height: AppSpace.md), c],
            ]),
          ),
        ),
      );
}

/// A centred message with a retry button (a list or thread that could not load).
class LoadFailed extends StatelessWidget {
  const LoadFailed({super.key, required this.error, required this.onRetry});
  final Object error;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final s = Strings.of(context);
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Text(s.errorText(error), textAlign: TextAlign.center, style: const TextStyle(color: AppColors.muted)),
          const SizedBox(height: AppSpace.lg),
          PrimaryButton(s.retry, onPressed: onRetry),
        ]),
      ),
    );
  }
}
