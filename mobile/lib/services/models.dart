import 'dart:convert';
import '../util/delivery_estimate.dart';
import '../util/freshness.dart';
import '../util/variants.dart';
import 'geo_models.dart';
// Lightweight DTOs mirroring the API payloads (api/src/database/entities).

/// A non-empty, trimmed text field; null when missing, blank or not a string (old servers omit the new fields).
String? textOrNull(Object? v) => v is String && v.trim().isNotEmpty ? v.trim() : null;

/// The text in the user's language: [fr] when French is asked and present, else [en], else whichever exists.
String pickLang(String lang, String? en, String? fr) {
  final e = (en ?? '').trim();
  final f = (fr ?? '').trim();
  if (lang == 'fr') return f.isNotEmpty ? f : e;
  return e.isNotEmpty ? e : f;
}

/// Field names the server marked as machine translated (`["nameFr","descriptionFr"]`); empty when absent.
List<String> _readFieldList(Object? raw) {
  Object? v = raw;
  if (raw is String) {
    try {
      v = jsonDecode(raw);
    } catch (_) {
      return const [];
    }
  }
  return v is List ? v.map((e) => '$e').where((e) => e.isNotEmpty).toList() : const [];
}

/// The gallery of a served product: `images` (cover first), else the single `image` (older servers), else none.
List<String> readImageList(Object? images, Object? cover) {
  final out = <String>[];
  if (images is List) {
    for (final e in images) {
      final u = textOrNull(e);
      if (u != null && !out.contains(u)) out.add(u);
    }
  }
  final c = textOrNull(cover);
  if (out.isEmpty && c != null) out.add(c);
  return out;
}

/// A bilingual text `{en, fr}` (the vacation notice); null when missing or empty in both languages.
Map<String, String>? readBilingual(Object? raw) {
  if (raw is! Map) return null;
  final en = textOrNull(raw['en']);
  final fr = textOrNull(raw['fr']);
  if (en == null && fr == null) return null;
  return {if (en != null) 'en': en, if (fr != null) 'fr': fr};
}

class BackendUser {
  final String id;
  final String email;
  final String name;
  final String role;
  final String? phone;
  final double walletBalance;
  final bool emailVerified;
  final bool phoneVerified;
  final String? avatar;

  /// The account's language (`en` | `fr`). Null when the payload does not say (an older server): never guessed as
  /// English, or the app would switch a French user to English.
  final String? locale;

  BackendUser({
    required this.id,
    required this.email,
    required this.name,
    required this.role,
    this.phone,
    this.walletBalance = 0,
    this.emailVerified = false,
    this.phoneVerified = false,
    this.avatar,
    this.locale,
  });

  factory BackendUser.fromJson(Map<String, dynamic> j) => BackendUser(
        id: j['id'] as String,
        email: j['email'] as String? ?? '',
        name: j['name'] as String? ?? '',
        role: j['role'] as String? ?? 'customer',
        phone: j['phone'] as String?,
        walletBalance: (j['walletBalance'] as num?)?.toDouble() ?? 0,
        emailVerified: j['emailVerified'] as bool? ?? false,
        phoneVerified: j['phoneVerified'] as bool? ?? false,
        avatar: j['avatar'] as String?,
        locale: switch (j['locale']) {
          'en' => 'en',
          'fr' => 'fr',
          _ => null,
        },
      );
}

class ProductDto {
  final String id;
  final String name;
  final String nameFr;
  final double price;
  final double originalPrice;
  final int discount;
  final String category;
  final String categoryFr;
  final String image;
  final int stock;
  final double rating;
  final int reviews;
  final String? sellerId;
  final String? sellerName;
  final String? description;
  final DateTime? createdAt;

  /// The French description (null when the server has none, or is an older build).
  final String? descriptionFr;

  /// The category this listing belongs to (null on older servers, which only send the name).
  final String? categoryId;

  /// Display labels for the option groups, per language. Display only: [variants] stay the purchase keys.
  final VariantLabels variantLabels;

  /// The language the seller wrote the listing in (`en` | `fr`).
  final String sourceLang;

  /// Served fields that came from the machine translator (`nameFr`, `descriptionFr`, `variantLabels`…).
  final List<String> machineTranslated;

  /// `done` | `pending` | `failed` | `off`.
  final String translationStatus;

  /// The stored listing price (`price` is what is charged: the lowest of the
  /// listing, a running flash sale and a running campaign).
  final double basePrice;

  /// Percent off from the winning seller campaign (0 when none).
  final int campaignPct;

  /// `base` | `flash` | `campaign`: what set [price].
  final String priceSource;

  /// Options the shopper must pick before buying (empty = none).
  final List<VariantGroup> variants;

  /// The seller's delivery time for this product, in days.
  final int deliveryDays;

  /// The gallery, cover first (`image` is `images[0]`). A single-image or older payload gives a gallery of one;
  /// a product with no picture gives an empty list.
  final List<String> images;

  /// The seller's own reference and the brand (null when not set, or on older servers).
  final String? sku;
  final String? brand;

  /// The campaign that set [price] (only while `priceSource == 'campaign'`); what view/click tracking reports.
  final String? campaignId;

  /// The store is away: the product cannot be bought until [sellerVacationUntil].
  final bool sellerOnVacation;
  final DateTime? sellerVacationUntil;

  /// The notice to show, per language (`en`, `fr`); null when the store is open.
  final Map<String, String>? sellerVacationNotice;

  /// Days the store needs to hand a parcel over, and the delivery time with it added (null on older servers).
  final int sellerHandlingDays;
  final int? totalDeliveryDays;

  /// When this copy was received (see `nextStamp`): a newer `store:vacation` push beats it, an older one does not.
  final int stamp;

  ProductDto({
    required this.id,
    required this.name,
    required this.nameFr,
    required this.price,
    required this.originalPrice,
    required this.discount,
    required this.category,
    required this.categoryFr,
    required this.image,
    required this.stock,
    required this.rating,
    required this.reviews,
    this.sellerId,
    this.sellerName,
    this.description,
    this.createdAt,
    this.descriptionFr,
    this.categoryId,
    this.variantLabels = const {},
    this.sourceLang = 'en',
    this.machineTranslated = const [],
    this.translationStatus = 'off',
    double? basePrice,
    this.campaignPct = 0,
    this.priceSource = 'base',
    this.variants = const [],
    this.deliveryDays = deliveryDaysFallback,
    this.images = const [],
    this.sku,
    this.brand,
    this.campaignId,
    this.sellerOnVacation = false,
    this.sellerVacationUntil,
    this.sellerVacationNotice,
    this.sellerHandlingDays = 0,
    this.totalDeliveryDays,
    int? stamp,
  })  : basePrice = basePrice ?? price,
        stamp = stamp ?? nextStamp();

  /// Localised display name (falls back to the other language's name).
  String displayName(String lang) => pickLang(lang, name, nameFr);

  /// The description in [lang] (the other language's text while a translation is missing); empty when none.
  String displayDescription(String lang) => pickLang(lang, description, descriptionFr);

  factory ProductDto.fromJson(Map<String, dynamic> j) {
    final variants = readVariants(j['variants']);
    return ProductDto(
      variants: variants,
      variantLabels: readVariantLabels(j['variantLabels'], variants),
      descriptionFr: textOrNull(j['descriptionFr']),
      categoryId: textOrNull(j['categoryId']),
      sourceLang: j['sourceLang'] == 'fr' ? 'fr' : 'en',
      machineTranslated: _readFieldList(j['machineTranslated']),
      translationStatus: textOrNull(j['translationStatus']) ?? 'off',
      deliveryDays: deliveryDaysOf(j['deliveryDays']),
      id: j['id'] as String,
      name: j['name'] as String? ?? '',
      nameFr: j['nameFr'] as String? ?? '',
      price: (j['price'] as num?)?.toDouble() ?? 0,
      originalPrice: (j['originalPrice'] as num?)?.toDouble() ?? (j['price'] as num?)?.toDouble() ?? 0,
      discount: (j['discount'] as num?)?.toInt() ?? 0,
      category: j['category'] as String? ?? '',
      categoryFr: j['categoryFr'] as String? ?? '',
      image: j['image'] as String? ?? '',
      stock: (j['stock'] as num?)?.toInt() ?? 0,
      rating: (j['rating'] as num?)?.toDouble() ?? 0,
      reviews: (j['reviewsCount'] as num?)?.toInt() ?? (j['reviews'] as num?)?.toInt() ?? 0,
      sellerId: j['sellerId'] as String?,
      sellerName: j['sellerName'] as String?,
      description: j['description'] as String?,
      createdAt: j['createdAt'] is String ? DateTime.tryParse(j['createdAt'] as String) : null,
      basePrice: (j['basePrice'] as num?)?.toDouble(),
      campaignPct: (j['campaignPct'] as num?)?.toInt() ?? 0,
      priceSource: j['priceSource'] as String? ?? 'base',
      images: readImageList(j['images'], j['image']),
      sku: textOrNull(j['sku']),
      brand: textOrNull(j['brand']),
      campaignId: textOrNull(j['campaignId']),
      sellerOnVacation: j['sellerOnVacation'] == true,
      sellerVacationUntil: j['sellerVacationUntil'] is String ? DateTime.tryParse(j['sellerVacationUntil'] as String)?.toLocal() : null,
      sellerVacationNotice: j['sellerOnVacation'] == true ? readBilingual(j['sellerVacationNotice']) : null,
      sellerHandlingDays: ((j['sellerHandlingDays'] is num ? (j['sellerHandlingDays'] as num).toInt() : 0)).clamp(0, 14),
      totalDeliveryDays: j['totalDeliveryDays'] is num && (j['totalDeliveryDays'] as num) >= 1 ? (j['totalDeliveryDays'] as num).round() : null,
    );
  }
}

class BannerDto {
  final String title;
  final String body;

  /// The French wording (empty on older servers).
  final String titleFr;
  final String bodyFr;
  const BannerDto({required this.title, required this.body, this.titleFr = '', this.bodyFr = ''});

  factory BannerDto.fromJson(Map<String, dynamic> j) =>
      BannerDto(title: (j['title'] ?? '').toString(), body: (j['body'] ?? '').toString(), titleFr: textOrNull(j['titleFr']) ?? '', bodyFr: textOrNull(j['bodyFr']) ?? '');

  String displayTitle(String lang) => pickLang(lang, title, titleFr);
  String displayBody(String lang) => pickLang(lang, body, bodyFr);
}

class ReviewDto {
  final String id;
  final String author;
  final int rating;
  final String text;
  final int helpful;
  final DateTime? createdAt;

  /// The seller's public answer to this review (null when none).
  final String? sellerReply;

  ReviewDto({required this.id, required this.author, required this.rating, required this.text, this.helpful = 0, this.createdAt, this.sellerReply});

  factory ReviewDto.fromJson(Map<String, dynamic> j) => ReviewDto(
        id: j['id'] as String,
        author: j['author'] as String? ?? '',
        rating: (j['rating'] as num?)?.toInt() ?? 5,
        text: j['text'] as String? ?? '',
        helpful: (j['helpful'] as num?)?.toInt() ?? 0,
        createdAt: j['createdAt'] is String ? DateTime.tryParse(j['createdAt'] as String)?.toLocal() : null,
        sellerReply: (j['sellerReply'] as String?)?.trim().isNotEmpty == true ? (j['sellerReply'] as String).trim() : null,
      );
}

class QuestionDto {
  final String id;
  final String question;
  final String? answer;

  /// The product the question is about (null on payloads that predate it).
  final String? productId;

  /// The account that asked, and the store that answers (null on old questions).
  final String? askerId;
  final String? sellerId;
  final DateTime? createdAt;

  /// When the seller answered (null while unanswered, and on answers given before this was stored).
  final DateTime? answeredAt;

  QuestionDto({required this.id, required this.question, this.answer, this.productId, this.askerId, this.sellerId, this.createdAt, this.answeredAt});

  bool get isAnswered => (answer ?? '').trim().isNotEmpty;

  factory QuestionDto.fromJson(Map<String, dynamic> j) => QuestionDto(
        id: j['id'] as String,
        question: j['question'] as String? ?? '',
        answer: textOrNull(j['answer']),
        productId: textOrNull(j['productId']),
        askerId: textOrNull(j['askerId']),
        sellerId: textOrNull(j['sellerId']),
        createdAt: j['createdAt'] is String ? DateTime.tryParse(j['createdAt'] as String)?.toLocal() : null,
        answeredAt: j['answeredAt'] is String ? DateTime.tryParse(j['answeredAt'] as String)?.toLocal() : null,
      );
}

class CategoryDto {
  final String id;
  final String name;
  final String nameFr;
  final String image;

  /// How many live products the category holds (null on older servers).
  final int? productCount;

  /// The language the admin wrote the category in (`en` | `fr`).
  final String sourceLang;

  CategoryDto({required this.id, required this.name, required this.nameFr, required this.image, this.productCount, this.sourceLang = 'en'});

  factory CategoryDto.fromJson(Map<String, dynamic> j) => CategoryDto(
        id: j['id'] as String,
        name: j['name'] as String? ?? '',
        nameFr: (j['nameFr'] as String?)?.isNotEmpty == true ? j['nameFr'] as String : (j['name'] as String? ?? ''),
        image: j['image'] as String? ?? '',
        productCount: (j['productCount'] as num?)?.toInt(),
        sourceLang: j['sourceLang'] == 'fr' ? 'fr' : 'en',
      );
}

({double lat, double lng, String? placeId, String? formatted})? _geoFrom(Object? raw) {
  if (raw is! Map) return null;
  final lat = (raw['lat'] as num?)?.toDouble();
  final lng = (raw['lng'] as num?)?.toDouble();
  if (lat == null || lng == null) return null;
  return (lat: lat, lng: lng, placeId: raw['placeId'] as String?, formatted: raw['formatted'] as String?);
}

class AddressDto {
  final String id;
  final String label;
  final String line1;
  final String? line2;
  final String city;
  final String? commune;
  final String? phone;
  final bool isDefault;

  /// Map pin the customer picked (null when the address was typed by hand).
  final ({double lat, double lng, String? placeId, String? formatted})? geo;

  /// The most specific delivery area of this address (docs/contracts/areas.md); null on an older server or when
  /// the address matched no area.
  final String? areaId;

  /// The areas from the country down to [areaId]; empty when the server did not send them.
  final List<AreaDto> areaChain;

  /// A warehouse delivers to this address. Null when the server did not say (an older server): treated as served.
  final bool? served;

  AddressDto({
    required this.id,
    required this.label,
    required this.line1,
    this.line2,
    required this.city,
    this.commune,
    this.phone,
    this.isDefault = false,
    this.geo,
    this.areaId,
    this.areaChain = const [],
    this.served,
  });

  factory AddressDto.fromJson(Map<String, dynamic> j) => AddressDto(
        id: j['id'] as String,
        label: j['label'] as String? ?? '',
        line1: j['line1'] as String? ?? '',
        line2: j['line2'] as String?,
        city: j['city'] as String? ?? '',
        commune: j['commune'] as String?,
        phone: j['phone'] as String?,
        isDefault: j['isDefault'] as bool? ?? false,
        geo: _geoFrom(j['geo']),
        areaId: textOrNull(j['areaId']),
        areaChain: AreaDto.listFrom(j['areaChain']),
        served: j['served'] is bool ? j['served'] as bool : null,
      );

  bool get hasPin => geo != null;

  /// The server says no warehouse delivers here yet.
  bool get notServed => served == false;

  String get oneLine => [line1, if ((commune ?? '').isNotEmpty) commune, city].join(', ');

  /// The area at [level] (`province`, `city`, `commune`, `quartier`…), if the server sent the chain.
  AreaDto? areaAt(String level) => _areaAt(areaChain, level);

  /// The street and the areas, named in [lang]: "12 avenue du Commerce, Gombe, Kinshasa" / the same in English where
  /// the names differ. Without an area chain it is [oneLine] (the text the server stored).
  String oneLineIn(String lang) {
    if (areaChain.isEmpty) return oneLine;
    final names = <String>[];
    for (final level in const [AreaLevel.quartier, AreaLevel.commune, AreaLevel.city]) {
      final a = areaAt(level);
      if (a != null) names.add(a.nameFor(lang));
    }
    if (names.isEmpty) return oneLine;
    return [line1, ...names].join(', ');
  }

  /// The name of the area to quote in a "we don't deliver to…" notice: the most specific one, in [lang].
  String? areaNameIn(String lang) {
    if (areaChain.isNotEmpty) return areaChain.last.nameFor(lang);
    final t = (commune ?? '').isNotEmpty ? commune : city;
    return (t ?? '').isEmpty ? null : t;
  }
}

AreaDto? _areaAt(List<AreaDto> chain, String level) => areaAt(chain, level);

class OrderItemDto {
  final String productId;
  final String productName;

  /// The name as the order snapshotted it in French (empty on older servers and old orders).
  final String productNameFr;

  /// The chosen options, canonical ("Size: 42 · Colour: Black"): the purchase key, never translated.
  final String variant;

  /// The same choice worded in French (empty when the server has no snapshot).
  final String variantFr;
  final int qty;
  final double priceUsd;

  /// The normal (undiscounted) unit price; equals [priceUsd] when nothing was discounted.
  final double listPriceUsd;

  /// The seller who packs this line (null on old orders).
  final String? sellerId;
  final String? sellerName;

  /// `open` (seller is packing) | `ready` (packed, waiting for pickup) | `received` (at the hub)
  /// | `cancelled` (the seller could not supply it).
  final String fulfilment;
  final DateTime? readyAt;
  final DateTime? receivedAt;
  final String? cancelReason;

  /// Money refunded to the wallet for this line (0 when none).
  final double refundedUsd;

  OrderItemDto({
    required this.productId,
    required this.productName,
    this.productNameFr = '',
    required this.variant,
    this.variantFr = '',
    required this.qty,
    required this.priceUsd,
    double? listPriceUsd,
    this.sellerId,
    this.sellerName,
    this.fulfilment = 'open',
    this.readyAt,
    this.receivedAt,
    this.cancelReason,
    this.refundedUsd = 0,
  }) : listPriceUsd = listPriceUsd ?? priceUsd;

  bool get isCancelled => fulfilment == 'cancelled';

  /// The line's name in [lang]: the French snapshot when French is asked and present, else the stored name.
  String displayName(String lang) => pickLang(lang, productName, productNameFr);

  /// True when the line carries a real option choice (not the 'Default' placeholder).
  bool get hasVariant => variant.isNotEmpty && variant != defaultVariant;

  /// The option choice in [lang] (French snapshot when present, else the canonical text).
  String displayVariant(String lang) => lang == 'fr' && variantFr.trim().isNotEmpty ? variantFr.trim() : variant;

  static DateTime? _date(Object? v) => v is String ? DateTime.tryParse(v)?.toLocal() : null;

  factory OrderItemDto.fromJson(Map<String, dynamic> j) => OrderItemDto(
        productId: j['productId'] as String? ?? '',
        productName: j['productName'] as String? ?? '',
        productNameFr: textOrNull(j['productNameFr']) ?? '',
        variant: j['variant'] as String? ?? 'Default',
        variantFr: textOrNull(j['variantFr']) ?? '',
        qty: (j['qty'] as num?)?.toInt() ?? 1,
        priceUsd: (j['priceUsd'] as num?)?.toDouble() ?? 0,
        listPriceUsd: (j['listPriceUsd'] as num?)?.toDouble(),
        sellerId: j['sellerId'] as String?,
        sellerName: j['sellerName'] as String?,
        fulfilment: j['fulfilment'] as String? ?? 'open',
        readyAt: _date(j['readyAt']),
        receivedAt: _date(j['receivedAt']),
        cancelReason: j['cancelReason'] as String?,
        refundedUsd: (j['refundedUsd'] as num?)?.toDouble() ?? 0,
      );
}

/// One seller's share of an order, with its own progress.
class OrderPackage {
  final String? sellerId;
  final String? sellerName;
  final List<OrderItemDto> items;

  /// `cancelled` | `pending` | `to_pack` | `ready` | `at_hub` | `shipped` | `out_for_delivery` | `delivered` | `returned`.
  final String status;

  const OrderPackage({required this.sellerId, required this.sellerName, required this.items, required this.status});
}

/// The step of one package, given the order and its lines (mirrors the server's rule).
String packageStatusOf(OrderDto o, List<OrderItemDto> items) {
  final live = items.where((i) => !i.isCancelled).toList();
  if (live.isEmpty || o.status == 'cancelled') return 'cancelled';
  if (o.status == 'pending' && o.paymentMethod != 'cod') return 'pending';
  if (live.every((i) => i.fulfilment == 'received')) {
    return const {'shipped', 'out_for_delivery', 'delivered', 'returned'}.contains(o.status) ? o.status : 'at_hub';
  }
  if (live.every((i) => i.fulfilment != 'open')) return 'ready';
  return 'to_pack';
}

/// The order's lines grouped by seller (first-seen order), each with its derived status.
List<OrderPackage> packagesOf(OrderDto o) {
  final groups = <String, List<OrderItemDto>>{};
  for (final i in o.items) {
    groups.putIfAbsent(i.sellerId ?? i.sellerName ?? '', () => []).add(i);
  }
  return [
    for (final g in groups.values)
      OrderPackage(
        sellerId: g.first.sellerId,
        sellerName: g.map((i) => i.sellerName).firstWhere((n) => (n ?? '').isNotEmpty, orElse: () => null),
        items: g,
        status: packageStatusOf(o, g),
      ),
  ];
}

class OrderDto {
  final String id;
  final String reference;
  final String customerName;
  final String status;
  final String paymentMethod;
  final double subtotalUsd;
  final double deliveryFeeUsd;
  final double discountUsd;
  final String? promoCode;
  final double totalUsd;
  final DateTime? createdAt;

  /// When the server last changed this order. Two copies of one order (a late reply, a live push) are
  /// ordered by it, so an older copy never replaces a newer one. Null when the server sent none.
  final DateTime? updatedAt;
  final List<OrderItemDto> items;

  /// Campaign savings already deducted from [subtotalUsd] / [totalUsd].
  final double campaignDiscountUsd;

  /// The delivery address as the order stored it (JSON text, sent back only to the order's own customer).
  final String? shippingRaw;

  /// Chosen delivery window "YYYY-MM-DD HH:MM-HH:MM" (null = as soon as possible).
  /// Expected delivery day (YYYY-MM-DD), from the sellers' delivery times.
  final String? estimatedDeliveryDate;

  /// Who to call: the server sends it to the customer only while the order is shipped / out for delivery.
  final RiderContact? rider;

  /// The warehouse that delivers to the customer, and the warehouses that collect from each seller (one per seller,
  /// in the order the sellers first appear). Null / empty on orders from before the warehouse routing.
  final String? destinationHubId;
  final List<String> originHubIds;

  /// The journey of the parcel leg by leg with times, when the server sends it (`tracking.legs`, the same shape the
  /// seller sees); empty on servers that do not, then the journey is worked out from the order's status.
  final List<OrderLeg> legs;

  /// The planned route of each seller's parcels, as warehouse ids from the collecting one to the delivering one
  /// (`routeBySeller`): more than two ids means the parcel is relayed through other warehouses. Empty on older servers.
  final Map<String, List<String>> routeBySeller;

  OrderDto({
    required this.id,
    required this.reference,
    required this.customerName,
    required this.status,
    required this.paymentMethod,
    required this.totalUsd,
    this.subtotalUsd = 0,
    this.deliveryFeeUsd = 0,
    this.discountUsd = 0,
    this.promoCode,
    this.createdAt,
    this.updatedAt,
    this.items = const [],
    this.campaignDiscountUsd = 0,
    this.shippingRaw,
    this.estimatedDeliveryDate,
    this.rider,
    this.destinationHubId,
    this.originHubIds = const [],
    this.legs = const [],
    this.routeBySeller = const {},
  });

  Map<String, dynamic>? get _shipping {
    final raw = shippingRaw;
    if (raw == null || raw.isEmpty) return null;
    try {
      final m = jsonDecode(raw);
      return m is Map ? m.map((k, v) => MapEntry(k.toString(), v)) : null;
    } catch (_) {
      return null;
    }
  }

  /// "12 Avenue de la Paix, Gombe, Kinshasa" (empty when unknown).
  String get shippingText {
    final m = _shipping;
    if (m == null) return '';
    return [m['line1'], m['line2'], m['commune'], m['city']].where((e) => e != null && '$e'.trim().isNotEmpty).join(', ');
  }

  /// The pin the customer chose for this delivery, if any.
  ({double lat, double lng})? get destination {
    final g = _shipping?['geo'];
    if (g is! Map) return null;
    final lat = (g['lat'] as num?)?.toDouble();
    final lng = (g['lng'] as num?)?.toDouble();
    return lat == null || lng == null ? null : (lat: lat, lng: lng);
  }

  int get itemCount => items.fold(0, (s, i) => s + i.qty);

  /// Number of lines the seller(s) cancelled.
  int get cancelledLineCount => items.where((i) => i.isCancelled).length;

  /// Money already refunded to the wallet for cancelled lines.
  double get refundedUsd => items.fold(0.0, (s, i) => s + i.refundedUsd);

  factory OrderDto.fromJson(Map<String, dynamic> j) => OrderDto(
        id: j['id'] as String,
        reference: j['reference'] as String? ?? '',
        customerName: j['customerName'] as String? ?? '',
        status: j['status'] as String? ?? 'pending',
        paymentMethod: j['paymentMethod'] as String? ?? 'wallet',
        subtotalUsd: (j['subtotalUsd'] as num?)?.toDouble() ?? 0,
        deliveryFeeUsd: (j['deliveryFeeUsd'] as num?)?.toDouble() ?? 0,
        discountUsd: (j['discountUsd'] as num?)?.toDouble() ?? 0,
        promoCode: j['promoCode'] as String?,
        totalUsd: (j['totalUsd'] as num?)?.toDouble() ?? 0,
        campaignDiscountUsd: (j['campaignDiscountUsd'] as num?)?.toDouble() ?? 0,
        shippingRaw: j['shippingAddress'] as String?,
        estimatedDeliveryDate: j['estimatedDeliveryDate'] as String?,
        rider: RiderContact.tryParse(j['rider']),
        destinationHubId: textOrNull(j['destinationHubId']),
        legs: OrderLeg.listFrom(j['tracking']),
        routeBySeller: _routes(j['routeBySeller']),
        originHubIds: j['originHubIds'] is List ? [for (final e in j['originHubIds'] as List) if (e is String && e.isNotEmpty) e] : const [],
        createdAt: j['createdAt'] is String ? DateTime.tryParse(j['createdAt'] as String)?.toLocal() : null,
        updatedAt: j['updatedAt'] is String ? DateTime.tryParse(j['updatedAt'] as String)?.toLocal() : null,
        items: ((j['items'] as List?) ?? const [])
            .map((e) => OrderItemDto.fromJson((e as Map).map((k, v) => MapEntry(k.toString(), v))))
            .toList(),
      );
}

/// `routeBySeller` of an order: {sellerId: [hubId, ...]}; also accepted as JSON text. Malformed entries are dropped.
Map<String, List<String>> _routes(Object? raw) {
  Object? v = raw;
  if (raw is String) {
    try {
      v = jsonDecode(raw);
    } catch (_) {
      return const {};
    }
  }
  if (v is! Map) return const {};
  return {
    for (final e in v.entries)
      if (e.value is List) e.key.toString(): [for (final h in e.value as List) if (h is String && h.isNotEmpty) h],
  };
}

/// One leg of a parcel's journey (`pickup` | `transfer` | `delivery`, and the return kinds) with its times.
/// A transfer leg is one hop of the route: [hop] (1-based) of [hops], between two named warehouses, and belongs to a
/// transfer run ([runReference], "TR-0042") when the warehouse grouped it with other parcels for the trip.
class OrderLeg {
  const OrderLeg({
    required this.kind,
    required this.status,
    this.pickedUpAt,
    this.receivedAt,
    this.deliveredAt,
    this.readyAt,
    this.updatedAt,
    this.hop,
    this.hops,
    this.fromHubId,
    this.toHubId,
    this.fromHubName,
    this.toHubName,
    this.driverFirstName,
    this.runId,
    this.runReference,
  });

  final String kind;
  final String status;

  /// Which hop of the route this transfer is, and how many there are (null on older servers: one hop).
  final int? hop;
  final int? hops;
  final String? fromHubId, toHubId, fromHubName, toHubName;

  /// First name of the driver who carries this leg, when the server sends it.
  final String? driverFirstName;

  /// The transfer run this leg travels in and its reference ("TR-0042"); null off a run and on older servers.
  final String? runId, runReference;
  final DateTime? readyAt;
  final DateTime? pickedUpAt;
  final DateTime? receivedAt;
  final DateTime? deliveredAt;
  final DateTime? updatedAt;

  static DateTime? _t(Object? v) => v is String ? DateTime.tryParse(v)?.toLocal() : null;

  factory OrderLeg.fromJson(Map<String, dynamic> j) => OrderLeg(
        kind: textOrNull(j['kind']) ?? 'delivery',
        status: textOrNull(j['status']) ?? '',
        readyAt: _t(j['readyAt']),
        pickedUpAt: _t(j['pickedUpAt']),
        receivedAt: _t(j['receivedAt']),
        deliveredAt: _t(j['deliveredAt']),
        updatedAt: _t(j['updatedAt']),
        hop: j['hop'] is num ? (j['hop'] as num).toInt() : null,
        hops: j['hops'] is num ? (j['hops'] as num).toInt() : null,
        fromHubId: textOrNull(j['fromHubId']) ?? _hubField(j['fromHub'], 'id'),
        toHubId: textOrNull(j['toHubId']) ?? _hubField(j['toHub'], 'id'),
        fromHubName: textOrNull(j['fromHubName']) ?? _hubField(j['fromHub'], 'name'),
        toHubName: textOrNull(j['toHubName']) ?? _hubField(j['toHub'], 'name'),
        driverFirstName: _firstName(j['riderFirstName'] ?? j['driverFirstName'] ?? j['riderName'] ?? j['driverName']),
        runId: textOrNull(j['runId']),
        runReference: textOrNull(j['runReference']),
      );

  /// The flat `fromHubId` / `fromHubName` / `toHubId` / `toHubName` are what the server sends; a warehouse sent only as an
  /// object (`{id, name, city}`, the shape before them) is read as well.
  static String? _hubField(Object? hub, String key) => hub is Map ? textOrNull(hub[key]) : null;

  /// The first word of a person's name ("Jean-Pierre Mukendi" -> "Jean-Pierre"); null when there is none.
  static String? _firstName(Object? v) {
    return textOrNull(v)?.split(RegExp(r'\s+')).first;
  }

  /// The legs of a payload's `tracking` ({legs: [...]}) or of a bare list; empty when absent or malformed.
  static List<OrderLeg> listFrom(Object? raw) {
    final list = raw is Map ? raw['legs'] : raw;
    if (list is! List) return const [];
    return [for (final e in list) if (e is Map) OrderLeg.fromJson(e.map((k, v) => MapEntry(k.toString(), v)))];
  }
}

/// The rider's name and phone number (the phone may be missing).
class RiderContact {
  final String name;
  final String? phone;
  const RiderContact({required this.name, this.phone});

  /// A callable number: digits and a leading "+", no spaces or dashes ("" when there is none).
  String get dialNumber => (phone ?? '').replaceAll(RegExp(r'[^+\d]'), '');

  static RiderContact? tryParse(Object? raw) {
    if (raw is! Map) return null;
    final name = raw['name'];
    final phone = raw['phone'];
    if (name is! String || name.trim().isEmpty) return null;
    return RiderContact(name: name.trim(), phone: phone is String && phone.trim().isNotEmpty ? phone.trim() : null);
  }
}

class NotificationDto {
  final String id;
  final String title;
  final String body;

  /// The server's French wording (null on older servers: the phone's own patterns translate instead).
  final String? titleFr;
  final String? bodyFr;
  final String type;
  final bool read;
  final String? entityId;
  final DateTime? createdAt;

  NotificationDto({
    required this.id,
    required this.title,
    required this.body,
    this.titleFr,
    this.bodyFr,
    required this.type,
    required this.read,
    this.entityId,
    this.createdAt,
  });

  factory NotificationDto.fromJson(Map<String, dynamic> j) => NotificationDto(
        id: j['id'] as String,
        title: j['title'] as String? ?? '',
        body: j['body'] as String? ?? '',
        titleFr: textOrNull(j['titleFr']),
        bodyFr: textOrNull(j['bodyFr']),
        type: j['type'] as String? ?? 'system',
        read: j['read'] as bool? ?? false,
        entityId: j['entityId'] as String?,
        createdAt: j['createdAt'] is String ? DateTime.tryParse(j['createdAt'] as String)?.toLocal() : null,
      );

  NotificationDto asRead() =>
      NotificationDto(id: id, title: title, body: body, titleFr: titleFr, bodyFr: bodyFr, type: type, read: true, entityId: entityId, createdAt: createdAt);
}

class WalletTransactionDto {
  final String id;
  final String type;
  final double amount;
  final double balance;
  final String description;

  /// The French wording from the server (null on older servers).
  final String? descriptionFr;

  WalletTransactionDto({
    required this.id,
    required this.type,
    required this.amount,
    required this.balance,
    required this.description,
    this.descriptionFr,
  });

  factory WalletTransactionDto.fromJson(Map<String, dynamic> j) =>
      WalletTransactionDto(
        id: j['id'] as String,
        type: j['type'] as String? ?? 'topup',
        amount: (j['amount'] as num?)?.toDouble() ?? 0,
        balance: (j['balance'] as num?)?.toDouble() ?? 0,
        description: j['description'] as String? ?? '',
        descriptionFr: textOrNull(j['descriptionFr']),
      );
}

/// The answer to `translate:text`: the text in the asked language, the language it was written in, and
/// `same` when it already is in the asked language (nothing to translate).
class TextTranslation {
  final String text;
  final String sourceLang;
  final bool same;
  const TextTranslation({required this.text, this.sourceLang = '', this.same = false});

  factory TextTranslation.fromJson(Map<String, dynamic> j) => TextTranslation(
        text: j['text'] as String? ?? '',
        sourceLang: j['sourceLang'] as String? ?? '',
        same: j['same'] == true,
      );
}

class PaymentDto {
  final String id;
  final String reference;
  final String? orderId;
  final String orderReference;
  final String purpose; // order | topup
  final String method;
  final double amountUsd;
  final String status; // pending | succeeded | failed | refunded
  final String? failureReason;

  PaymentDto({
    required this.id,
    required this.reference,
    this.orderId,
    required this.orderReference,
    this.purpose = 'order',
    required this.method,
    required this.amountUsd,
    required this.status,
    this.failureReason,
  });

  bool get isPending => status == 'pending';

  factory PaymentDto.fromJson(Map<String, dynamic> j) => PaymentDto(
        id: j['id'] as String,
        reference: j['reference'] as String? ?? '',
        orderId: j['orderId'] as String?,
        orderReference: j['orderReference'] as String? ?? '',
        purpose: j['purpose'] as String? ?? 'order',
        method: j['method'] as String? ?? '',
        amountUsd: (j['amountUsd'] as num?)?.toDouble() ?? 0,
        status: j['status'] as String? ?? 'pending',
        failureReason: j['failureReason'] as String?,
      );
}

class RiderLocationDto {
  final String orderId;
  final double lat;
  final double lng;

  RiderLocationDto({required this.orderId, required this.lat, required this.lng});

  factory RiderLocationDto.fromJson(Map<String, dynamic> j) => RiderLocationDto(
        orderId: j['orderId'] as String? ?? '',
        lat: (j['lat'] as num?)?.toDouble() ?? 0,
        lng: (j['lng'] as num?)?.toDouble() ?? 0,
      );
}
