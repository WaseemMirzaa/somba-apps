import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import '../l10n/strings.dart';
import '../services/upload_service.dart';
import '../theme/app_theme.dart';
import 'feedback.dart';

/// The photos a form is about to send: picked, uploaded at once, removable. Read [urls] when submitting and
/// check [busy] first (a photo still uploading blocks the send).
class PhotoAttachments extends ChangeNotifier {
  PhotoAttachments({this.max = 6});
  final int max;
  final List<PhotoEntry> entries = [];

  bool get busy => entries.any((e) => e.uploading);
  bool get isFull => entries.length >= max;
  bool get isEmpty => entries.isEmpty;

  /// The uploaded photos' URLs, in order.
  List<String> get urls => [for (final e in entries) if (e.url != null) e.url!];

  void clear() {
    entries.clear();
    notifyListeners();
  }

  void remove(PhotoEntry e) {
    entries.remove(e);
    notifyListeners();
  }

  /// Uploads [bytes] and keeps it in the list; a failure drops it again and is reported through [onError].
  Future<void> add(Uint8List bytes, {String filename = 'photo.jpg', void Function(Object error)? onError}) async {
    if (isFull) return;
    final e = PhotoEntry(bytes);
    entries.add(e);
    notifyListeners();
    try {
      e.url = await UploadService.uploadImage(bytes, filename: filename);
    } catch (err) {
      entries.remove(e);
      onError?.call(err);
    } finally {
      e.uploading = false;
      notifyListeners();
    }
  }
}

class PhotoEntry {
  PhotoEntry(this.bytes);
  final Uint8List bytes;
  String? url;
  bool uploading = true;
}

/// Tests choose the photos instead of the camera / library.
@visibleForTesting
Future<List<XFile>> Function(ImageSource source, int remaining)? debugPhotoSource;

Future<List<XFile>> _pick(ImageSource source, int remaining) async {
  final hook = debugPhotoSource;
  if (hook != null) return hook(source, remaining);
  final picker = ImagePicker();
  if (source == ImageSource.camera) {
    final f = await picker.pickImage(source: source, maxWidth: 1600, imageQuality: 82);
    return f == null ? const [] : [f];
  }
  return picker.pickMultiImage(maxWidth: 1600, imageQuality: 82, limit: remaining < 2 ? 2 : remaining);
}

/// A row of photo thumbnails with an "Add photo" button (take a photo / choose from the library).
class PhotoPickerField extends StatelessWidget {
  const PhotoPickerField({super.key, required this.attachments, this.label});
  final PhotoAttachments attachments;
  final String? label;

  Future<void> _choose(BuildContext context) async {
    final s = Strings.of(context);
    final source = await showModalBottomSheet<ImageSource>(
      context: context,
      showDragHandle: true,
      builder: (ctx) => SafeArea(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          ListTile(
            key: const ValueKey('photo-camera'),
            leading: const Icon(Icons.photo_camera_outlined),
            title: Text(s.photoTake),
            onTap: () => Navigator.pop(ctx, ImageSource.camera),
          ),
          ListTile(
            key: const ValueKey('photo-library'),
            leading: const Icon(Icons.photo_library_outlined),
            title: Text(s.photoChoose),
            onTap: () => Navigator.pop(ctx, ImageSource.gallery),
          ),
        ]),
      ),
    );
    if (source == null || !context.mounted) return;
    try {
      final files = await _pick(source, attachments.max - attachments.entries.length);
      for (final f in files.take(attachments.max - attachments.entries.length)) {
        final bytes = await f.readAsBytes();
        if (!context.mounted) return;
        // Not awaited one by one: the thumbnails appear at once and upload side by side.
        attachments.add(bytes, filename: f.name.isEmpty ? 'photo.jpg' : f.name, onError: (e) => showError(context, e));
      }
    } catch (e) {
      if (context.mounted) showError(context, e);
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = Strings.of(context);
    return ListenableBuilder(
      listenable: attachments,
      builder: (context, _) => Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        if (label != null) ...[
          Text(label!, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13, color: AppColors.inkSoft)),
          const SizedBox(height: 8),
        ],
        Wrap(spacing: 10, runSpacing: 10, children: [
          for (final e in attachments.entries) _Thumb(entry: e, onRemove: () => attachments.remove(e)),
          if (!attachments.isFull)
            OutlinedButton(
              key: const ValueKey('photo-add'),
              onPressed: () => _choose(context),
              child: ButtonLabelText(s.photoAdd),
            ),
        ]),
        const SizedBox(height: 4),
        Text(s.photoMax(attachments.max), style: const TextStyle(color: AppColors.muted, fontSize: 12)),
      ]),
    );
  }
}

/// A one-line label that shrinks rather than wrapping (French, large text).
class ButtonLabelText extends StatelessWidget {
  const ButtonLabelText(this.text, {super.key});
  final String text;
  @override
  Widget build(BuildContext context) => FittedBox(fit: BoxFit.scaleDown, child: Text(text, maxLines: 1));
}

class _Thumb extends StatelessWidget {
  const _Thumb({required this.entry, required this.onRemove});
  final PhotoEntry entry;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    final s = Strings.of(context);
    return SizedBox(
      width: 72,
      height: 72,
      child: Stack(clipBehavior: Clip.none, children: [
        Positioned.fill(
          child: ClipRRect(
            borderRadius: BorderRadius.circular(AppRadius.sm),
            child: Image.memory(entry.bytes, fit: BoxFit.cover, errorBuilder: (_, __, ___) => Container(color: AppColors.line)),
          ),
        ),
        if (entry.uploading)
          Positioned.fill(
            child: Container(
              decoration: BoxDecoration(color: Colors.black38, borderRadius: BorderRadius.circular(AppRadius.sm)),
              child: const Center(child: SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2.4, color: Colors.white))),
            ),
          ),
        Positioned(
          right: -6,
          top: -6,
          child: Semantics(
            label: s.photoRemove,
            button: true,
            child: GestureDetector(
              onTap: onRemove,
              child: Container(
                width: 24,
                height: 24,
                decoration: BoxDecoration(color: AppColors.ink, shape: BoxShape.circle, border: Border.all(color: Colors.white, width: 1.5)),
                child: const Icon(Icons.close_rounded, size: 14, color: Colors.white),
              ),
            ),
          ),
        ),
      ]),
    );
  }
}
