// Lightweight DTOs mirroring the API payloads (api/src/database/entities).

class BackendUser {
  final String id;
  final String email;
  final String name;
  final String role;
  final String? phone;
  final double walletBalance;

  BackendUser({
    required this.id,
    required this.email,
    required this.name,
    required this.role,
    this.phone,
    this.walletBalance = 0,
  });

  factory BackendUser.fromJson(Map<String, dynamic> j) => BackendUser(
        id: j['id'] as String,
        email: j['email'] as String? ?? '',
        name: j['name'] as String? ?? '',
        role: j['role'] as String? ?? 'customer',
        phone: j['phone'] as String?,
        walletBalance: (j['walletBalance'] as num?)?.toDouble() ?? 0,
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
      );
}

class OrderDto {
  final String id;
  final String reference;
  final String customerName;
  final String status;
  final String paymentMethod;
  final double totalUsd;

  OrderDto({
    required this.id,
    required this.reference,
    required this.customerName,
    required this.status,
    required this.paymentMethod,
    required this.totalUsd,
  });

  factory OrderDto.fromJson(Map<String, dynamic> j) => OrderDto(
        id: j['id'] as String,
        reference: j['reference'] as String? ?? '',
        customerName: j['customerName'] as String? ?? '',
        status: j['status'] as String? ?? 'pending',
        paymentMethod: j['paymentMethod'] as String? ?? 'cod',
        totalUsd: (j['totalUsd'] as num?)?.toDouble() ?? 0,
      );
}

class NotificationDto {
  final String id;
  final String title;
  final String body;
  final String type;
  final bool read;

  NotificationDto({
    required this.id,
    required this.title,
    required this.body,
    required this.type,
    required this.read,
  });

  factory NotificationDto.fromJson(Map<String, dynamic> j) => NotificationDto(
        id: j['id'] as String,
        title: j['title'] as String? ?? '',
        body: j['body'] as String? ?? '',
        type: j['type'] as String? ?? 'system',
        read: j['read'] as bool? ?? false,
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
  final String orderReference;
  final String method;
  final double amountUsd;
  final String status;

  PaymentDto({
    required this.id,
    required this.orderReference,
    required this.method,
    required this.amountUsd,
    required this.status,
  });

  factory PaymentDto.fromJson(Map<String, dynamic> j) => PaymentDto(
        id: j['id'] as String,
        orderReference: j['orderReference'] as String? ?? '',
        method: j['method'] as String? ?? '',
        amountUsd: (j['amountUsd'] as num?)?.toDouble() ?? 0,
        status: j['status'] as String? ?? 'pending',
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
