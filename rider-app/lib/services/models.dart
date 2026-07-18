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
  final double price;
  final String category;
  final int stock;
  final double rating;

  ProductDto({
    required this.id,
    required this.name,
    required this.price,
    required this.category,
    required this.stock,
    required this.rating,
  });

  factory ProductDto.fromJson(Map<String, dynamic> j) => ProductDto(
        id: j['id'] as String,
        name: j['name'] as String? ?? '',
        price: (j['price'] as num?)?.toDouble() ?? 0,
        category: j['category'] as String? ?? '',
        stock: (j['stock'] as num?)?.toInt() ?? 0,
        rating: (j['rating'] as num?)?.toDouble() ?? 0,
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

class DeliveryTaskDto {
  final String id;
  final String orderId;
  final String orderReference;
  final String status;
  final double codAmountUsd;

  DeliveryTaskDto({
    required this.id,
    required this.orderId,
    required this.orderReference,
    required this.status,
    required this.codAmountUsd,
  });

  factory DeliveryTaskDto.fromJson(Map<String, dynamic> j) => DeliveryTaskDto(
        id: j['id'] as String,
        orderId: j['orderId'] as String? ?? '',
        orderReference: j['orderReference'] as String? ?? '',
        status: j['status'] as String? ?? 'unassigned',
        codAmountUsd: (j['codAmountUsd'] as num?)?.toDouble() ?? 0,
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
