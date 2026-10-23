import 'dart:convert';
import '../util/delivery_estimate.dart';
import '../util/variants.dart';
// Lightweight DTOs mirroring the API payloads (api/src/database/entities).

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
  final String locale;

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
    this.locale = 'en',
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
        locale: j['locale'] as String? ?? 'en',
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
    double? basePrice,
    this.campaignPct = 0,
    this.priceSource = 'base',
    this.variants = const [],
    this.deliveryDays = deliveryDaysFallback,
  }) : basePrice = basePrice ?? price;

  /// Localised display name (falls back to the English name).
  String displayName(String lang) => lang == 'fr' && nameFr.isNotEmpty ? nameFr : name;

  factory ProductDto.fromJson(Map<String, dynamic> j) => ProductDto(
        variants: readVariants(j['variants']),
        deliveryDays: deliveryDaysOf(j['deliveryDays']),
        id: j['id'] as String,
        name: j['name'] as String? ?? '',
        nameFr: j['nameFr'] as String? ?? '',
        price: (j['price'] as num?)?.toDouble() ?? 0,
        originalPrice: (j['originalPrice'] as num?)?.toDouble() ??
            (j['price'] as num?)?.toDouble() ??
            0,
        discount: (j['discount'] as num?)?.toInt() ?? 0,
        category: j['category'] as String? ?? '',
        categoryFr: j['categoryFr'] as String? ?? '',
        image: j['image'] as String? ?? '',
        stock: (j['stock'] as num?)?.toInt() ?? 0,
        rating: (j['rating'] as num?)?.toDouble() ?? 0,
        reviews: (j['reviewsCount'] as num?)?.toInt() ??
            (j['reviews'] as num?)?.toInt() ??
            0,
        sellerId: j['sellerId'] as String?,
        sellerName: j['sellerName'] as String?,
        description: j['description'] as String?,
        createdAt: j['createdAt'] is String ? DateTime.tryParse(j['createdAt'] as String) : null,
        basePrice: (j['basePrice'] as num?)?.toDouble(),
        campaignPct: (j['campaignPct'] as num?)?.toInt() ?? 0,
        priceSource: j['priceSource'] as String? ?? 'base',
      );
}

class BannerDto {
  final String title;
  final String body;
  const BannerDto({required this.title, required this.body});
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

  QuestionDto({required this.id, required this.question, this.answer});

  factory QuestionDto.fromJson(Map<String, dynamic> j) => QuestionDto(
        id: j['id'] as String,
        question: j['question'] as String? ?? '',
        answer: j['answer'] as String?,
      );
}

class CategoryDto {
  final String id;
  final String name;
  final String nameFr;
  final String image;

  CategoryDto({required this.id, required this.name, required this.nameFr, required this.image});

  factory CategoryDto.fromJson(Map<String, dynamic> j) => CategoryDto(
        id: j['id'] as String,
        name: j['name'] as String? ?? '',
        nameFr: (j['nameFr'] as String?)?.isNotEmpty == true ? j['nameFr'] as String : (j['name'] as String? ?? ''),
        image: j['image'] as String? ?? '',
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
  final String? zoneId;
  final bool isDefault;

  /// Map pin the customer picked (null when the address was typed by hand).
  final ({double lat, double lng, String? placeId, String? formatted})? geo;

  AddressDto({
    required this.id,
    required this.label,
    required this.line1,
    this.line2,
    required this.city,
    this.commune,
    this.phone,
    this.zoneId,
    this.isDefault = false,
    this.geo,
  });

  factory AddressDto.fromJson(Map<String, dynamic> j) => AddressDto(
        id: j['id'] as String,
        label: j['label'] as String? ?? '',
        line1: j['line1'] as String? ?? '',
        line2: j['line2'] as String?,
        city: j['city'] as String? ?? '',
        commune: j['commune'] as String?,
        phone: j['phone'] as String?,
        zoneId: j['zoneId'] as String?,
        isDefault: j['isDefault'] as bool? ?? false,
        geo: _geoFrom(j['geo']),
      );

  bool get hasPin => geo != null;

  String get oneLine => [line1, if ((commune ?? '').isNotEmpty) commune, city].join(', ');
}

class OrderItemDto {
  final String productId;
  final String productName;
  final String variant;
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
    required this.variant,
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

  static DateTime? _date(Object? v) => v is String ? DateTime.tryParse(v)?.toLocal() : null;

  factory OrderItemDto.fromJson(Map<String, dynamic> j) => OrderItemDto(
        productId: j['productId'] as String? ?? '',
        productName: j['productName'] as String? ?? '',
        variant: j['variant'] as String? ?? 'Default',
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
    this.items = const [],
    this.campaignDiscountUsd = 0,
    this.shippingRaw,
    this.estimatedDeliveryDate,
    this.rider,
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
        createdAt: j['createdAt'] is String ? DateTime.tryParse(j['createdAt'] as String)?.toLocal() : null,
        items: ((j['items'] as List?) ?? const [])
            .map((e) => OrderItemDto.fromJson((e as Map).map((k, v) => MapEntry(k.toString(), v))))
            .toList(),
      );
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
  final String type;
  final bool read;
  final String? entityId;
  final DateTime? createdAt;

  NotificationDto({
    required this.id,
    required this.title,
    required this.body,
    required this.type,
    required this.read,
    this.entityId,
    this.createdAt,
  });

  factory NotificationDto.fromJson(Map<String, dynamic> j) => NotificationDto(
        id: j['id'] as String,
        title: j['title'] as String? ?? '',
        body: j['body'] as String? ?? '',
        type: j['type'] as String? ?? 'system',
        read: j['read'] as bool? ?? false,
        entityId: j['entityId'] as String?,
        createdAt: j['createdAt'] is String ? DateTime.tryParse(j['createdAt'] as String)?.toLocal() : null,
      );
}

class WalletTransactionDto {
  final String id;
  final String type;
  final double amount;
  final double balance;
  final String description;

  WalletTransactionDto({
    required this.id,
    required this.type,
    required this.amount,
    required this.balance,
    required this.description,
  });

  factory WalletTransactionDto.fromJson(Map<String, dynamic> j) =>
      WalletTransactionDto(
        id: j['id'] as String,
        type: j['type'] as String? ?? 'topup',
        amount: (j['amount'] as num?)?.toDouble() ?? 0,
        balance: (j['balance'] as num?)?.toDouble() ?? 0,
        description: j['description'] as String? ?? '',
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
