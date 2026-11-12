import 'package:flutter/material.dart';
import '../l10n/strings.dart';
import '../services/text_i18n.dart';
import '../theme/app_theme.dart';

/// The text for [lang] from [i18n] (the translation that came with it), else [text] as written. For one-line spots (a list row).
String i18nText(String lang, String text, TextI18n? i18n) => i18n?.forLang(lang) ?? text;

/// A ticket subject or message in the rider's language with no tap: the server's translation is shown at once, with a small
/// "Translated automatically" note and a "See original" link (it sticks until the language changes). Text the author wrote in
/// the app's language shows as it is, with no note. Without translations from the server the text stands as written.
class TranslatedText extends StatefulWidget {
  const TranslatedText({super.key, required this.text, this.i18n, this.style, this.idKey = ''});

  final String text;
  final TextI18n? i18n;
  final TextStyle? style;

  /// Names the widgets in tests (`tt-text-<idKey>`, `tt-link-<idKey>`).
  final String idKey;

  @override
  State<TranslatedText> createState() => _TranslatedTextState();
}

class _TranslatedTextState extends State<TranslatedText> {
  /// The language in which the rider asked for the written text (null: none asked).
  String? _originalFor;

  @override
  void didUpdateWidget(covariant TranslatedText old) {
    super.didUpdateWidget(old);
    if (old.text != widget.text || old.i18n != widget.i18n) _originalFor = null;
  }

  @override
  Widget build(BuildContext context) {
    final s = Strings.of(context);
    final value = widget.i18n?.forLang(s.lang);
    if (value == null) return Text(widget.text, key: ValueKey('tt-text-${widget.idKey}'), style: widget.style);
    final src = widget.i18n!.sourceLang;
    // Written in the app's language (or unknown and identical to what was written): nothing was translated.
    final machine = src != null ? src != s.lang : value.trim() != widget.text.trim();
    if (_originalFor != null && _originalFor != s.lang) _originalFor = null; // the language moved on
    final showing = machine && _originalFor != s.lang;
    return Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
      Text(machine ? (showing ? value : widget.text) : value, key: ValueKey('tt-text-${widget.idKey}'), style: widget.style),
      if (showing)
        Padding(
          padding: const EdgeInsets.only(top: 4),
          child: Row(mainAxisSize: MainAxisSize.min, children: [
            const Icon(Icons.translate_rounded, size: 12, color: AppColors.faint),
            const SizedBox(width: 4),
            Flexible(child: Text(s.translatedAuto, style: const TextStyle(color: AppColors.faint, fontSize: 11.5))),
          ]),
        ),
      if (machine)
        Align(
          alignment: Alignment.centerLeft,
          child: TextButton(
            key: ValueKey('tt-link-${widget.idKey}'),
            onPressed: () => setState(() => _originalFor = showing ? s.lang : null),
            style: TextButton.styleFrom(
              foregroundColor: AppColors.primary,
              padding: const EdgeInsets.symmetric(vertical: 4),
              minimumSize: Size.zero,
              tapTargetSize: MaterialTapTargetSize.shrinkWrap,
              visualDensity: VisualDensity.compact,
            ),
            child: Text(showing ? s.seeOriginal : s.seeTranslation, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 12)),
          ),
        ),
    ]);
  }
}
