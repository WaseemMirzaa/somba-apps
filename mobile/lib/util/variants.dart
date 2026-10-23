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
