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
///
/// With [auto] the translation is fetched by itself and shown at once, in the language the app is in now, and it follows
/// the app's language: switching English <-> French fetches (or re-uses) the other translation without a tap. "See original"
/// still gives the written text back (until the language changes again). A failure is silent here (nobody asked for it);
/// the link stays so the shopper can try again.
class TranslatableText extends StatefulWidget {
  /// `review` | `review_reply` | `question` | `answer`.
  final String kind;

  /// The stored record: the review for `review` / `review_reply`, the question for `question` / `answer`.
  final String id;
  final String text;
  final TextStyle? style;

  /// Translate into the app's language by itself (questions and answers), and follow a language switch.
  final bool auto;

  const TranslatableText({super.key, required this.kind, required this.id, required this.text, this.style, this.auto = false});

  @override
  State<TranslatableText> createState() => _TranslatableTextState();
}

class _TranslatableTextState extends State<TranslatableText> {
  TextTranslation? _translation;
  String _translatedFor = '';
  bool _showTranslated = false;
  bool _busy = false;

  /// The shopper asked for the original (until the language or the text changes): do not translate again by itself.
  bool _wantsOriginal = false;

  /// The automatic attempt failed: do not retry by itself (the link is there to try again).
  bool _autoFailed = false;

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
    _wantsOriginal = false;
    _autoFailed = false;
  }

  Future<void> _toggle(Strings s) async {
    if (_busy) return;
    if (_showTranslated) {
      setState(() {
        _showTranslated = false;
        _wantsOriginal = true;
      });
      return;
    }
    _wantsOriginal = false;
    if (_translation != null && _translatedFor == s.lang) {
      setState(() => _showTranslated = true);
      return;
    }
    await _fetch(s, silent: false);
  }

  /// Asks the server for the translation into [s]'s language. [silent]: nobody tapped, so neither the "already in your
  /// language" notice nor a failure is announced.
  Future<void> _fetch(Strings s, {required bool silent}) async {
    final messenger = ScaffoldMessenger.of(context);
    setState(() => _busy = true);
    try {
      final t = await RealtimeStore.instance.translateText(widget.kind, widget.id, s.lang, text: widget.text);
      if (!mounted) return;
      // The language moved on while this was on its way: that answer is for another language, drop it (build starts again).
      if (Strings.of(context).lang != s.lang) {
        setState(() => _busy = false);
        return;
      }
      setState(() {
        _translation = t;
        _translatedFor = s.lang;
        // An empty answer is no translation: keep the written text.
        _showTranslated = !t.same && t.text.trim().isNotEmpty;
        _busy = false;
      });
      if (t.same && !silent) {
        messenger
          ..hideCurrentSnackBar()
          ..showSnackBar(SnackBar(content: Text(s.translateSame)));
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _busy = false;
          if (silent) _autoFailed = true;
        });
      }
      if (!silent) {
        messenger
          ..hideCurrentSnackBar()
          ..showSnackBar(SnackBar(content: Text(Strings.current.errorText(e))));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = Strings.of(context);
    // The language changed since the translation was fetched: start again from the original.
    if (_translation != null && _translatedFor != s.lang) _reset();
    final t = _translation;
    final showing = _showTranslated && t != null;
    // No translation service on this server: the text stands alone (a link that only ever fails is worse than none).
    final hideLink = (t != null && t.same) || !RealtimeStore.instance.translationAvailable;
    // Automatic: translate into the app's language once per language, unless the shopper chose the original or it failed.
    if (widget.auto && !hideLink && t == null && !_busy && !_wantsOriginal && !_autoFailed && widget.text.trim().isNotEmpty) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted && widget.auto && _translation == null && !_busy && !_wantsOriginal && !_autoFailed) _fetch(Strings.of(context), silent: true);
      });
    }
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
            ),
            // Size on the Text, not the button's textStyle (that would drop the theme font).
            child: Text(_busy ? '…' : (showing ? s.seeOriginal : s.seeTranslation),
                style: const TextStyle(fontWeight: FontWeight.w700, fontSize: MachineNote._linkSize)),
          ),
        ),
    ]);
  }
}
