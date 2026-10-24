import 'dart:convert';

/// A product option type the shopper picks, e.g. Size (39, 40…) or Colour (Black, White).
/// Mirrors api/src/common/variants/variants.ts: the choice travels as "Size: 42 · Colour: Black" ("Default" = none).
class VariantGroup {
  final String name;
  final List<String> options;
  const VariantGroup(this.name, this.options);
}

const defaultVariant = 'Default';

/// Reads the API value (JSON text or list); anything malformed means "no options".
List<VariantGroup> readVariants(Object? raw) {
  Object? v = raw;
  if (raw is String) {
    try {
      v = jsonDecode(raw);
    } catch (_) {
      return const [];
    }
  }
  if (v is! List) return const [];
  final out = <VariantGroup>[];
  for (final g in v) {
    if (g is! Map) continue;
    final name = '${g['name'] ?? ''}'.trim();
    final opts = (g['options'] is List ? g['options'] as List : const []).map((o) => '$o'.trim()).where((o) => o.isNotEmpty).toList();
    if (name.isNotEmpty && opts.isNotEmpty) out.add(VariantGroup(name, opts));
  }
  return out;
}

/// Display labels per language for the option groups, `{ 'fr': [Group…], 'en': [Group…] }`. Every list is
/// index-aligned with the canonical groups. DISPLAY ONLY: the purchase key (cart, stock, order lines) is always
/// the canonical option text, never a label.
typedef VariantLabels = Map<String, List<VariantGroup>>;

/// Reads the API's `variantLabels` (a JSON object or its text). A language whose shape does not match the
/// canonical [groups] (different number of groups or options) is dropped, so the canonical text shows instead (C-I4).
VariantLabels readVariantLabels(Object? raw, List<VariantGroup> groups) {
  Object? v = raw;
  if (raw is String) {
    try {
      v = jsonDecode(raw);
    } catch (_) {
      return const {};
    }
  }
  if (v is! Map || groups.isEmpty) return const {};
  final out = <String, List<VariantGroup>>{};
  v.forEach((lang, list) {
    final aligned = _alignedLabels(groups, list);
    if (aligned != null) out['$lang'] = aligned;
  });
  return out;
}

List<VariantGroup>? _alignedLabels(List<VariantGroup> groups, Object? raw) {
  if (raw is! List || raw.length != groups.length) return null;
  final out = <VariantGroup>[];
  for (var gi = 0; gi < groups.length; gi++) {
    final g = raw[gi];
    final canonical = groups[gi];
    if (g is! Map) return null;
    final opts = g['options'];
    if (opts is! List || opts.length != canonical.options.length) return null;
    final name = '${g['name'] ?? ''}'.trim();
    out.add(VariantGroup(
      name.isEmpty ? canonical.name : name,
      [
        for (var oi = 0; oi < opts.length; oi++) '${opts[oi]}'.trim().isEmpty ? canonical.options[oi] : '${opts[oi]}'.trim(),
      ],
    ));
  }
  return out;
}

/// The option type's name (Size, Colour…) in [lang]; the canonical name when there is no label.
String variantGroupName(List<VariantGroup> groups, VariantLabels labels, int groupIndex, String lang) {
  final l = labels[lang];
  if (l != null && groupIndex >= 0 && groupIndex < l.length) return l[groupIndex].name;
  return groupIndex >= 0 && groupIndex < groups.length ? groups[groupIndex].name : '';
}

/// One option (Black, 42…) in [lang]; the canonical text when there is no label.
String variantOptionName(List<VariantGroup> groups, VariantLabels labels, int groupIndex, int optionIndex, String lang) {
  final l = labels[lang];
  if (l != null && groupIndex >= 0 && groupIndex < l.length && optionIndex >= 0 && optionIndex < l[groupIndex].options.length) {
    return l[groupIndex].options[optionIndex];
  }
  if (groupIndex >= 0 && groupIndex < groups.length && optionIndex >= 0 && optionIndex < groups[groupIndex].options.length) {
    return groups[groupIndex].options[optionIndex];
  }
  return '';
}

/// "Name: option": the same shape as the canonical choice, so the screens read alike in both languages.
String variantPair(String group, String option) => '$group: $option';

/// Turns a canonical choice ("Size: 42 · Colour: Black") into [lang] using the labels. Only the text SHOWN changes:
/// the cart line keeps the canonical value. Anything that does not parse is returned unchanged.
String localizeVariantText(List<VariantGroup> groups, VariantLabels labels, String canonicalText, String lang) {
  if (canonicalText == defaultVariant || labels[lang] == null || groups.isEmpty) return canonicalText;
  final parts = canonicalText.split(' · ');
  final out = <String>[];
  for (final part in parts) {
    var shown = part;
    for (var gi = 0; gi < groups.length; gi++) {
      final prefix = '${groups[gi].name}: ';
      if (!part.startsWith(prefix)) continue;
      final oi = groups[gi].options.indexOf(part.substring(prefix.length));
      if (oi != -1) {
        shown = variantPair(variantGroupName(groups, labels, gi, lang), variantOptionName(groups, labels, gi, oi, lang));
      }
      break;
    }
    out.add(shown);
  }
  return out.join(' · ');
}

String variantLabel(List<VariantGroup> groups, Map<String, String> picks) =>
    groups.isEmpty ? defaultVariant : groups.map((g) => '${g.name}: ${picks[g.name] ?? ''}').join(' · ');

/// The first option type not chosen yet, or null when the choice is complete.
VariantGroup? missingPick(List<VariantGroup> groups, Map<String, String> picks) {
  for (final g in groups) {
    final p = picks[g.name];
    if (p == null || !g.options.contains(p)) return g;
  }
  return null;
}
