import '../services/models.dart' show pickLang;
import '../util/delivery_estimate.dart';
import '../util/variants.dart';

/// View-models for the storefront. They are built from the live API payloads
/// (see catalog_live.dart) — there is no bundled sample catalogue.
class Product {
  /// Stable numeric key derived from [uuid]: used for widget keys / de-duplication.
  final int id;

  /// The backend id. Orders and the wishlist reference listings by this.
  final String uuid;
  final String name;
  final String nameFr;
  final double price;
  final double originalPrice;
  final int discount;
  final double rating;
  final int reviews;
  final String image;
  final String category;
  final String categoryFr;
  final int stock;
  final String? sellerId;
  final String? sellerName;
  final String? description;

  /// The French description; null when the server has none (older servers, or not translated yet).
  final String? descriptionFr;
  final DateTime? createdAt;

  /// The backend category id (null on older servers, which only send the name).
  final String? categoryId;

  /// Display labels per language for [variants]; the purchase key stays the canonical option text.
  final VariantLabels variantLabels;

  /// The language the seller wrote the listing in.
  final String sourceLang;

  /// Served fields the machine translator produced (`nameFr`, `descriptionFr`, `variantLabels`…).
  final List<String> machineTranslated;

  /// `done` | `pending` | `failed` | `off`.
  final String translationStatus;

  /// `base` | `flash` | `campaign`: what set [price] (the charged price).
  final String priceSource;
  final int campaignPct;

  /// Options (size, colour…) the shopper must pick before buying.
  final List<VariantGroup> variants;

  /// The seller's delivery time for this product, in days.
  final int deliveryDays;

  const Product({
    required this.id,
    required this.uuid,
    required this.name,
    required this.nameFr,
    required this.price,
    required this.originalPrice,
    required this.discount,
    required this.rating,
    required this.reviews,
    required this.image,
    required this.category,
    this.categoryFr = '',
    this.stock = 0,
    this.sellerId,
    this.sellerName,
    this.description,
    this.descriptionFr,
    this.createdAt,
    this.categoryId,
    this.variantLabels = const {},
    this.sourceLang = 'en',
    this.machineTranslated = const [],
    this.translationStatus = 'off',
    this.priceSource = 'base',
    this.campaignPct = 0,
    this.variants = const [],
    this.deliveryDays = deliveryDaysFallback,
  });

  String displayName(String lang) => pickLang(lang, name, nameFr);

  /// Category name in the app language (falls back to the English name).
  String displayCategory(String lang) => pickLang(lang, category, categoryFr);

  /// The description in the app language (the other language's text until a translation exists); empty when none.
  String displayDescription(String lang) => pickLang(lang, description, descriptionFr);

  /// The name of option type [groupIndex] (Size, Colour…) in [lang]; canonical when there is no label.
  String variantGroupLabel(int groupIndex, String lang) => variantGroupName(variants, variantLabels, groupIndex, lang);

  /// Option [optionIndex] of type [groupIndex] (Black, 42…) in [lang]; canonical when there is no label.
  String variantOptionLabel(int groupIndex, int optionIndex, String lang) =>
      variantOptionName(variants, variantLabels, groupIndex, optionIndex, lang);

  /// A cart/order choice ("Size: 42 · Colour: Black") worded in [lang]. Display only: the line keeps the canonical text.
  String displayVariant(String canonical, String lang) => localizeVariantText(variants, variantLabels, canonical, lang);

  /// The served field that carries the name in [lang]: it is `nameFr` for French unless only the English one exists.
  String nameField(String lang) => lang == 'fr' && nameFr.trim().isNotEmpty ? 'nameFr' : 'name';

  /// The served field that carries the description in [lang] (after the same fallback as [displayDescription]).
  String descriptionField(String lang) => lang == 'fr' && (descriptionFr ?? '').trim().isNotEmpty ? 'descriptionFr' : 'description';

  /// True when the name shown in [lang] came from the machine translator.
  bool nameIsMachine(String lang) => machineTranslated.contains(nameField(lang));

  /// True when the description shown in [lang] came from the machine translator.
  bool descriptionIsMachine(String lang) => displayDescription(lang).isNotEmpty && machineTranslated.contains(descriptionField(lang));

  /// True when the option labels shown in [lang] came from the machine translator. The labels travel as one field
  /// (`variantLabels`), so it concerns the language the seller did NOT write in; `variantLabels.fr` names one.
  bool variantsAreMachine(String lang) {
    if (variantLabels[lang] == null) return false;
    return machineTranslated.contains('variantLabels.$lang') || (machineTranslated.contains('variantLabels') && lang != sourceLang);
  }

  /// True when both listings sit in the same category: by id when both carry one, else by the English name.
  bool sameCategoryAs(Product other) {
    final a = categoryId, b = other.categoryId;
    if (a != null && a.isNotEmpty && b != null && b.isNotEmpty) return a == b;
    return category == other.category;
  }

  bool get inStock => stock > 0;

  /// The old price struck through next to [price]; null when not discounted.
  double? get strikePrice => originalPrice > price ? originalPrice : null;
}

class Category {
  final String id;
  final String name;
  final String nameFr;
  final String image;

  /// Live products in the category as the server counted them (null on older servers).
  final int? productCount;

  const Category({required this.id, required this.name, required this.nameFr, required this.image, this.productCount});

  String displayName(String lang) => pickLang(lang, name, nameFr);
}
