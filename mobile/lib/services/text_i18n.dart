/// A user-written text (review, seller reply, question, answer, chat message) in the languages the server already
/// knows it in. The translations ride in the payload next to the text, so the app shows the shopper's language at
/// once and a language switch needs no request. The whole object is absent when the server has nothing.
class TextI18n {
  const TextI18n({this.sourceLang, this.en, this.fr});

  /// The language the author wrote in; null when unknown.
  final String? sourceLang;

  /// The text in English / French (the original for the source language, the machine translation for the other).
  /// A language is null when the server has no value for it.
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
    final lang = src is String && src.trim().isNotEmpty ? src.trim().toLowerCase() : null;
    return TextI18n(sourceLang: lang, en: en, fr: fr);
  }

  @override
  bool operator ==(Object other) => other is TextI18n && other.sourceLang == sourceLang && other.en == en && other.fr == fr;

  @override
  int get hashCode => Object.hash(sourceLang, en, fr);
}
