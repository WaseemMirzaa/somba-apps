// "Nothing untranslated" audit helpers (not a test itself).
//
// The layout matrix pumps every screen in English and in French with the SAME realistic data, where every served
// field has a different English and French text. So any text that comes out identical in both languages, with at
// least two real words, is a string that bypasses the localisation layer (a hard-coded literal, a served field read
// without its `Fr` twin, an enum printed raw...). `layoutProblems` records what each pumped screen shows and reports
// the identical ones as `i18n: ...` problems; `i18n_audit_test.dart` covers the screens the matrices do not.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

/// Texts that are the same in both languages on purpose: people, places, brands, codes, and user-written content
/// (support messages typed by people).
/// Each entry says why. A new entry must be data, never a UI label.
final i18nAllowlist = <Pattern>[
  // Seeded names of people, shops and places (proper nouns are never translated).
  RegExp(r'^(Kinshasa Traders|Mama Tech|Kin Tech|Jean-Pierre Mukendi( Kabongo)?|Kinshasa Hub|Lubumbashi Hub|Mont-Amba)$'),
  // Place names, only when every word is capitalised (a proper-noun string, not a sentence that mentions a city).
  RegExp(r'^(?=(?:[A-ZÀ-Ý0-9][\wÀ-ÿ.\-]*[ ,]*)+$).*(Kinshasa|Gombe|Limete|Lubumbashi|Brazzaville|Goma|Mont-Amba)'),
  // The seeded customer's name and street (the rider app shows them as the customer's address book has them).
  RegExp(r'^(Aline Kabila Mwamba|.*Kasa-Vubu.*|.*avenue du Commerce.*)$'),
  // The seeded account e-mail.
  RegExp(r'^[\w.+-]+@[\w.-]+$'),
  // Parcel codes and order references (identifiers, e.g. "PKG-7KQ2M9XA", "SOM-1042 · SOM-1043").
  RegExp(r'^(PKG|SOM)-[A-Z0-9]+( · (PKG|SOM)-[A-Z0-9]+)*$'),
  // Brands and payment-method names.
  RegExp(r'^(KOMORIKO|Airtel Money|Orange Money|Vodacom M-Pesa|M-Pesa|Mobile Money|Google Maps)\b'),
  // Text people typed (support tickets and replies) is theirs, not the app's.
  RegExp(r'^(Customer is not answering|Parcel arrived damaged)'),
];

/// Words made of letters only (2+), in any script the markets use.
int _wordCount(String s) => RegExp(r'[A-Za-zÀ-ÿ]{2,}').allMatches(s).length;

/// Text that is plainly French (an accent or a French function word): content a seed wrote in French on both sides, or
/// a French string shown in English mode, is not an English string leaking into the French UI, which is what this
/// audit hunts. Untranslated UI is English, so it carries none of these.
bool _looksFrench(String s) =>
    RegExp(r'[àâçéèêëîïôùûœ]', caseSensitive: false).hasMatch(s) ||
    RegExp(r'\b(le|la|les|du|des|une|et|est|votre|vos|vous|nous|pour|avec|sur|dans|pas|cette|mon|mes|qui|aux|je|sont|ont|bonjour|merci|oui|non)\b', caseSensitive: false).hasMatch(s);

bool _isAllowed(String text) => i18nAllowlist.any((p) => p is RegExp ? p.hasMatch(text) : text.contains(p));

/// Everything a pumped screen shows that is not a plain Text: tooltips, semantic labels (screen readers), image
/// labels. Visible Text/RichText strings come from the layout checks, which already know what is on screen.
Set<String> extraVisibleStrings(WidgetTester tester) {
  final out = <String>{};
  for (final w in tester.widgetList<Tooltip>(find.byType(Tooltip))) {
    final m = w.message;
    if (m != null && m.isNotEmpty) out.add(m);
  }
  for (final w in tester.widgetList<Semantics>(find.byType(Semantics))) {
    final l = w.properties.label;
    if (l != null && l.isNotEmpty) out.add(l);
    final h = w.properties.hint;
    if (h != null && h.isNotEmpty) out.add(h);
  }
  // SelectableText and text fields draw through EditableText, not through a plain paragraph.
  for (final w in tester.widgetList<EditableText>(find.byType(EditableText))) {
    if (!w.obscureText && w.controller.text.trim().isNotEmpty) out.add(w.controller.text.trim());
  }
  for (final w in tester.widgetList<Image>(find.byType(Image))) {
    final l = w.semanticLabel;
    if (l != null && l.isNotEmpty) out.add(l);
  }
  return out;
}

/// What one pump of a screen showed, per (language, viewport width), kept so the French run can be compared with the
/// English run of the same test. [Expando] keyed by the test's own [WidgetTester] keeps tests apart.
final _seen = Expando<Map<String, Set<String>>>('i18n-audit');

/// Records [shown] for [lang] at [width]; for French returns the strings identical to the English run.
List<String> i18nCompare(WidgetTester tester, String lang, double width, Set<String> shown) {
  final map = (_seen[tester] ??= <String, Set<String>>{});
  map['$lang@$width'] = shown;
  if (lang != 'fr') return const [];
  final en = map['en@$width'];
  if (en == null) return const [];
  return [
    for (final t in shown)
      if (en.contains(t) && _wordCount(t) >= 2 && !_looksFrench(t) && !_isAllowed(t.trim())) 'i18n: same text in English and French: "$t"',
  ];
}
