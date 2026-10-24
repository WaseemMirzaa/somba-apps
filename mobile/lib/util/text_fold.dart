/// Search folding: lower-case and accent-free, so "Électronique", "electronique" and "ELECTRONIQUE" are the same
/// word. Mirrors what the server does for `products:search`; used by the phone's own filter (L15).
String foldText(String input) {
  if (input.isEmpty) return input;
  final lower = input.toLowerCase();
  StringBuffer? out;
  for (var i = 0; i < lower.length; i++) {
    final ch = lower[i];
    final code = ch.codeUnitAt(0);
    // Combining marks (an "e" followed by U+0301) vanish; the base letter stays.
    final rep = (code >= _combiningStart && code <= _combiningEnd) ? '' : _fold[ch];
    if (rep != null) {
      out ??= StringBuffer(lower.substring(0, i));
      out.write(rep);
    } else {
      out?.write(ch);
    }
  }
  return out?.toString() ?? lower;
}

/// True when [haystack], folded, contains [foldedNeedle] (the caller folds the needle once).
bool foldedContains(String haystack, String foldedNeedle) => foldedNeedle.isEmpty || foldText(haystack).contains(foldedNeedle);

const _combiningStart = 0x0300;
const _combiningEnd = 0x036F;

const Map<String, String> _fold = {
  'à': 'a', 'á': 'a', 'â': 'a', 'ã': 'a', 'ä': 'a', 'å': 'a', 'ā': 'a', 'ă': 'a', 'ą': 'a',
  'ç': 'c', 'ć': 'c', 'ĉ': 'c', 'ċ': 'c', 'č': 'c',
  'ď': 'd', 'đ': 'd',
  'è': 'e', 'é': 'e', 'ê': 'e', 'ë': 'e', 'ē': 'e', 'ĕ': 'e', 'ė': 'e', 'ę': 'e', 'ě': 'e',
  'ĝ': 'g', 'ğ': 'g', 'ġ': 'g', 'ģ': 'g',
  'ĥ': 'h', 'ħ': 'h',
  'ì': 'i', 'í': 'i', 'î': 'i', 'ï': 'i', 'ĩ': 'i', 'ī': 'i', 'ĭ': 'i', 'į': 'i', 'ı': 'i',
  'ĵ': 'j', 'ķ': 'k',
  'ĺ': 'l', 'ļ': 'l', 'ľ': 'l', 'ł': 'l',
  'ñ': 'n', 'ń': 'n', 'ņ': 'n', 'ň': 'n',
  'ò': 'o', 'ó': 'o', 'ô': 'o', 'õ': 'o', 'ö': 'o', 'ø': 'o', 'ō': 'o', 'ŏ': 'o', 'ő': 'o',
  'ŕ': 'r', 'ŗ': 'r', 'ř': 'r',
  'ś': 's', 'ŝ': 's', 'ş': 's', 'š': 's',
  'ţ': 't', 'ť': 't',
  'ù': 'u', 'ú': 'u', 'û': 'u', 'ü': 'u', 'ũ': 'u', 'ū': 'u', 'ŭ': 'u', 'ů': 'u', 'ű': 'u', 'ų': 'u',
  'ŵ': 'w',
  'ý': 'y', 'ÿ': 'y', 'ŷ': 'y',
  'ź': 'z', 'ż': 'z', 'ž': 'z',
  'œ': 'oe', 'æ': 'ae', 'ß': 'ss',
  '’': "'", '‘': "'",
};
