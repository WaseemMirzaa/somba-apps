// A last resort for product options the server did not translate (`variantLabels` absent): the option types and the
// values every shop uses (Size, Colour, Black, Navy blue...) in French. DISPLAY ONLY, like `variantLabels`: the cart
// line and the stock keep the canonical option text. Anything not listed is shown as the seller wrote it.

const _groupsFr = {
  'size': 'Taille',
  'sizes': 'Tailles',
  'shoe size': 'Pointure',
  'colour': 'Couleur',
  'color': 'Couleur',
  'colours': 'Couleurs',
  'colors': 'Couleurs',
  'storage': 'Stockage',
  'memory': 'Mémoire',
  'capacity': 'Capacité',
  'material': 'Matière',
  'style': 'Style',
  'type': 'Type',
  'model': 'Modèle',
  'pattern': 'Motif',
  'flavour': 'Parfum',
  'flavor': 'Parfum',
  'scent': 'Parfum',
  'weight': 'Poids',
  'length': 'Longueur',
  'width': 'Largeur',
  'pack': 'Lot',
  'pack size': 'Taille du lot',
  'quantity': 'Quantité',
  'version': 'Version',
  'edition': 'Édition',
  'plug': 'Prise',
  'power': 'Puissance',
  'voltage': 'Tension',
};

const _valuesFr = {
  'black': 'Noir',
  'white': 'Blanc',
  'red': 'Rouge',
  'blue': 'Bleu',
  'navy': 'Bleu marine',
  'navy blue': 'Bleu marine',
  'light blue': 'Bleu clair',
  'dark blue': 'Bleu foncé',
  'sky blue': 'Bleu ciel',
  'royal blue': 'Bleu roi',
  'green': 'Vert',
  'light green': 'Vert clair',
  'dark green': 'Vert foncé',
  'yellow': 'Jaune',
  'orange': 'Orange',
  'pink': 'Rose',
  'purple': 'Violet',
  'violet': 'Violet',
  'grey': 'Gris',
  'gray': 'Gris',
  'dark grey': 'Gris foncé',
  'light grey': 'Gris clair',
  'brown': 'Marron',
  'beige': 'Beige',
  'cream': 'Crème',
  'gold': 'Or',
  'golden': 'Doré',
  'silver': 'Argent',
  'rose gold': 'Or rose',
  'bronze': 'Bronze',
  'burgundy': 'Bordeaux',
  'maroon': 'Bordeaux',
  'khaki': 'Kaki',
  'turquoise': 'Turquoise',
  'multicolour': 'Multicolore',
  'multicolor': 'Multicolore',
  'multi-colour': 'Multicolore',
  'multi': 'Multicolore',
  'transparent': 'Transparent',
  'small': 'Petit',
  'medium': 'Moyen',
  'large': 'Grand',
  'extra large': 'Très grand',
  'one size': 'Taille unique',
  'standard': 'Standard',
  'cotton': 'Coton',
  'leather': 'Cuir',
  'plastic': 'Plastique',
  'wood': 'Bois',
  'metal': 'Métal',
  'steel': 'Acier',
  'stainless steel': 'Acier inoxydable',
  'glass': 'Verre',
  'wool': 'Laine',
  'silk': 'Soie',
  'linen': 'Lin',
  'men': 'Homme',
  'women': 'Femme',
  'kids': 'Enfant',
  'unisex': 'Unisexe',
  'yes': 'Oui',
  'no': 'Non',
};

/// "Navy blue" -> "Bleu marine", case-insensitively; a value that is not a known word is returned as it is.
/// A first capital letter is kept when the seller's text had one.
String frenchOptionWord(String value, {required bool group}) {
  final key = value.trim().toLowerCase();
  return (group ? _groupsFr[key] : _valuesFr[key]) ?? value;
}

/// A canonical choice ("Size: 42 · Colour: Navy blue") with the known words in French
/// ("Taille: 42 · Couleur: Bleu marine", the same shape the server's own labels give). Unknown words and "Default"
/// stay as they are.
String frenchVariantText(String canonical) {
  if (canonical == 'Default') return canonical;
  final parts = canonical.split(' · ');
  return parts.map((part) {
    final i = part.indexOf(': ');
    if (i <= 0) return frenchOptionWord(part, group: false);
    final name = frenchOptionWord(part.substring(0, i), group: true);
    final value = frenchOptionWord(part.substring(i + 2), group: false);
    return '$name: $value';
  }).join(' · ');
}

/// The option text of an order line in French: the server's `variantFr` when it really differs from the canonical text,
/// else (absent, or just a copy of the English because nothing translated it) the phone's own wording.
String variantInFrench(String canonical, String? variantFr) {
  final fr = (variantFr ?? '').trim();
  return fr.isNotEmpty && fr != canonical.trim() ? fr : frenchVariantText(canonical);
}
