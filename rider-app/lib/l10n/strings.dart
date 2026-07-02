import 'package:flutter/widgets.dart';
import 'fr_map.dart';

/// Central translation helper for the rider app's per-screen labels. Returns the
/// French entry when [lang] is `fr` and a mapping exists; otherwise returns the
/// English source unchanged (so a missing key degrades gracefully to English
/// rather than a blank).
String trl(String lang, String en) => lang == 'fr' ? (kFr[en] ?? en) : en;

/// Context-based variant — reads the active locale from [Localizations].
String tr(BuildContext context, String en) => trl(Localizations.localeOf(context).languageCode, en);

/// Whether the active locale is French.
bool isFr(BuildContext context) => Localizations.localeOf(context).languageCode == 'fr';
