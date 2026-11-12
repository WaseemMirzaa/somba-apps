/// A user-written text (a ticket's subject or message) in the languages the server already knows it in. The translations ride in
/// the payload next to the text, so the app shows the rider's language at once, with no request, and a language switch needs
/// none either. The whole object is absent when the server has nothing (see `docs/contracts/stored-text-i18n.md`).
class TextI18n {
  const TextI18n({this.sourceLang, this.en, this.fr});

  /// The language the author wrote in; null when unknown.
  final String? sourceLang;

  /// The text in English / French (the original for the source language, the machine translation for the other).
  final String? en, fr;

  /// The text in [lang] (`en` | `fr`), or null when the payload has none.
  String? forLang(String lang) => lang == 'fr' ? fr : (lang == 'en' ? en : null);

  /// Tolerant parse: anything that is not a map with at least one usable text is "no translations" (null).
  static TextI18n? tryParse(Object? j) {
    if (j is! Map) return null;
    String? value(Object? v) => v is String && v.trim().isNotEmpty ? v : null;
    final en = value(j['en']);
    final fr = value(j['fr']);
    if (en == null && fr == null) return null;
    final src = j['sourceLang'];
    return TextI18n(sourceLang: src is String && src.trim().isNotEmpty ? src.trim().toLowerCase() : null, en: en, fr: fr);
  }

  @override
  bool operator ==(Object other) => other is TextI18n && other.sourceLang == sourceLang && other.en == en && other.fr == fr;

  @override
  int get hashCode => Object.hash(sourceLang, en, fr);
}
