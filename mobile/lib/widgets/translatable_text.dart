import 'package:flutter/material.dart';
import '../l10n/strings.dart';
import '../services/models.dart';
import '../services/realtime_store.dart';
import '../theme/app_theme.dart';

/// Small "Translated automatically" caption shown under text a machine produced.
class MachineNote extends StatelessWidget {
  const MachineNote({super.key});

  static const double _size = 11.5;
  static const double _linkSize = 12;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: AppSpace.xs),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        const Icon(Icons.translate_rounded, size: _linkSize, color: AppColors.faint),
        const SizedBox(width: AppSpace.xs),
        Flexible(child: Text(Strings.of(context).translatedAuto, style: const TextStyle(color: AppColors.faint, fontSize: _size))),
      ]),
    );
  }
}

/// A review, seller reply, question or answer with a "See translation" / "See original" link under it.
///
/// The text is translated on demand through `translate:text`, which only accepts a stored [id] (never free
/// text). The link disappears when the server says the text is already in the shopper's language; a failure is
/// announced in a snackbar and the original stays on screen.
class TranslatableText extends StatefulWidget {
  /// `review` | `review_reply` | `question` | `answer`.
  final String kind;

  /// The stored record: the review for `review` / `review_reply`, the question for `question` / `answer`.
  final String id;
  final String text;
  final TextStyle? style;

  const TranslatableText({super.key, required this.kind, required this.id, required this.text, this.style});

  @override
  State<TranslatableText> createState() => _TranslatableTextState();
}

class _TranslatableTextState extends State<TranslatableText> {
  TextTranslation? _translation;
  String _translatedFor = '';
  bool _showTranslated = false;
  bool _busy = false;

  @override
  void didUpdateWidget(covariant TranslatableText old) {
    super.didUpdateWidget(old);
    if (old.text != widget.text || old.id != widget.id || old.kind != widget.kind) _reset();
  }

  void _reset() {
    _translation = null;
    _translatedFor = '';
    _showTranslated = false;
    _busy = false;
  }

  Future<void> _toggle(Strings s) async {
    if (_busy) return;
    if (_showTranslated) {
      setState(() => _showTranslated = false);
      return;
    }
    if (_translation != null && _translatedFor == s.lang) {
      setState(() => _showTranslated = true);
      return;
    }
    final messenger = ScaffoldMessenger.of(context);
    setState(() => _busy = true);
    try {
      final t = await RealtimeStore.instance.translateText(widget.kind, widget.id, s.lang, text: widget.text);
      if (!mounted) return;
      setState(() {
        _translation = t;
        _translatedFor = s.lang;
        _showTranslated = !t.same;
        _busy = false;
      });
      if (t.same) {
        messenger
          ..hideCurrentSnackBar()
          ..showSnackBar(SnackBar(content: Text(s.translateSame)));
      }
    } catch (e) {
      if (mounted) setState(() => _busy = false);
      messenger
        ..hideCurrentSnackBar()
        ..showSnackBar(SnackBar(content: Text(Strings.current.errorText(e))));
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = Strings.of(context);
    // The language changed since the translation was fetched: start again from the original.
    if (_translation != null && _translatedFor != s.lang) _reset();
    final t = _translation;
    final showing = _showTranslated && t != null;
    final hideLink = t != null && t.same;
    return Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
      Text(showing ? t.text : widget.text, key: ValueKey('tt-text-${widget.kind}-${widget.id}'), style: widget.style),
      if (showing) const MachineNote(),
      if (!hideLink)
        Align(
          alignment: Alignment.centerLeft,
          child: TextButton(
            key: ValueKey('tt-link-${widget.kind}-${widget.id}'),
            onPressed: _busy ? null : () => _toggle(s),
            style: TextButton.styleFrom(
              foregroundColor: AppColors.primary,
              padding: const EdgeInsets.symmetric(vertical: AppSpace.xs),
              minimumSize: Size.zero,
              tapTargetSize: MaterialTapTargetSize.shrinkWrap,
              visualDensity: VisualDensity.compact,
              textStyle: const TextStyle(fontWeight: FontWeight.w700, fontSize: MachineNote._linkSize),
            ),
            child: Text(_busy ? '…' : (showing ? s.seeOriginal : s.seeTranslation)),
          ),
        ),
    ]);
  }
}
