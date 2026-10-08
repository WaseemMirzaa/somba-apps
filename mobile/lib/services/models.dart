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
  });

  /// Localised display name (falls back to the English name).
  String displayName(String lang) => lang == 'fr' && nameFr.isNotEmpty ? nameFr : name;

  factory ProductDto.fromJson(Map<String, dynamic> j) => ProductDto(
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

  ReviewDto({required this.id, required this.author, required this.rating, required this.text, this.helpful = 0, this.createdAt});

  factory ReviewDto.fromJson(Map<String, dynamic> j) => ReviewDto(
        id: j['id'] as String,
        author: j['author'] as String? ?? '',
        rating: (j['rating'] as num?)?.toInt() ?? 5,
        text: j['text'] as String? ?? '',
        helpful: (j['helpful'] as num?)?.toInt() ?? 0,
        createdAt: j['createdAt'] is String ? DateTime.tryParse(j['createdAt'] as String)?.toLocal() : null,
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
      );

  String get oneLine => [line1, if ((commune ?? '').isNotEmpty) commune, city].join(', ');
}

class OrderItemDto {
  final String productId;
  final String productName;
  final String variant;
  final int qty;
  final double priceUsd;

  OrderItemDto({
    required this.productId,
    required this.productName,
    required this.variant,
    required this.qty,
    required this.priceUsd,
  });

  factory OrderItemDto.fromJson(Map<String, dynamic> j) => OrderItemDto(
        productId: j['productId'] as String? ?? '',
        productName: j['productName'] as String? ?? '',
        variant: j['variant'] as String? ?? 'Default',
        qty: (j['qty'] as num?)?.toInt() ?? 1,
        priceUsd: (j['priceUsd'] as num?)?.toDouble() ?? 0,
      );
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
  });

  int get itemCount => items.fold(0, (s, i) => s + i.qty);

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
        createdAt: j['createdAt'] is String ? DateTime.tryParse(j['createdAt'] as String)?.toLocal() : null,
        items: ((j['items'] as List?) ?? const [])
            .map((e) => OrderItemDto.fromJson((e as Map).map((k, v) => MapEntry(k.toString(), v))))
            .toList(),
      );
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
