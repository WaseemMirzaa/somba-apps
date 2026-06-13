import 'package:google_maps_flutter/google_maps_flutter.dart';

/// Order lifecycle from the scope document (section 3) plus exception states.
enum OrderStatus {
  confirmed,
  preparing,
  readyForPickup,
  pickedUp,
  atWarehouse,
  awaitingDispatch,
  outForDelivery,
  delivered,
  completed,
  cancelled,
  deliveryFailed,
  returnRequested,
  returned,
  refunded,
}

extension OrderStatusX on OrderStatus {
  bool get isException => index >= OrderStatus.cancelled.index;

  /// Translation key used by the UI.
  String get trKey => 'status_$name';
}

enum PaymentMethod { card, airtelMoney, orangeMoney, mpesa, wallet }

extension PaymentMethodX on PaymentMethod {
  String get trKey => 'pay_$name';
}

class AppUser {
  final String id;
  final String name;
  final String phone;
  final String email;
  final String city;

  const AppUser({
    required this.id,
    required this.name,
    required this.phone,
    required this.email,
    required this.city,
  });
}

class Category {
  final String id;
  final String nameEn;
  final String nameFr;
  final int iconCodePoint;
  final List<String> subcategoriesEn;
  final List<String> subcategoriesFr;
  final bool returnable;

  const Category({
    required this.id,
    required this.nameEn,
    required this.nameFr,
    required this.iconCodePoint,
    this.subcategoriesEn = const [],
    this.subcategoriesFr = const [],
    this.returnable = true,
  });
}

class Store {
  final String id;
  final String name;
  final String tagline;
  final String city;
  final String commune;
  final double rating;
  final int reviewCount;
  final String bannerSeed;
  final String logoSeed;

  const Store({
    required this.id,
    required this.name,
    required this.tagline,
    required this.city,
    required this.commune,
    required this.rating,
    required this.reviewCount,
    required this.bannerSeed,
    required this.logoSeed,
  });
}

class ProductVariant {
  final String nameEn;
  final String nameFr;
  final List<String> options;

  const ProductVariant({
    required this.nameEn,
    required this.nameFr,
    required this.options,
  });
}

class Review {
  final String author;
  final double rating;
  final String text;
  final String date;

  const Review({
    required this.author,
    required this.rating,
    required this.text,
    required this.date,
  });
}

class Product {
  final String id;
  final String nameEn;
  final String nameFr;
  final String descriptionEn;
  final String descriptionFr;

  /// Price in USD; CDF conversion happens at display time.
  final double price;
  final double? originalPrice;
  final double rating;
  final int reviewCount;
  final int stock;
  final int deliveryDays;
  final String categoryId;
  final String storeId;
  final String brand;
  final List<String> imageSeeds;
  final List<ProductVariant> variants;
  final List<Review> reviews;
  final bool isFlashDeal;
  final bool isNew;

  const Product({
    required this.id,
    required this.nameEn,
    required this.nameFr,
    required this.descriptionEn,
    required this.descriptionFr,
    required this.price,
    this.originalPrice,
    required this.rating,
    required this.reviewCount,
    required this.stock,
    this.deliveryDays = 2,
    required this.categoryId,
    required this.storeId,
    required this.brand,
    required this.imageSeeds,
    this.variants = const [],
    this.reviews = const [],
    this.isFlashDeal = false,
    this.isNew = false,
  });

  int get discountPercent => originalPrice == null || originalPrice == 0
      ? 0
      : (((originalPrice! - price) / originalPrice!) * 100).round();
}

class CartItem {
  final Product product;
  final Map<String, String> selectedVariants;
  int quantity;

  CartItem({
    required this.product,
    this.selectedVariants = const {},
    this.quantity = 1,
  });

  double get total => product.price * quantity;

  String get variantLabel =>
      selectedVariants.values.where((v) => v.isNotEmpty).join(' · ');
}

class Address {
  final String id;
  final String label;
  final String detail;
  final String commune;
  final String city;
  final String phone;
  final LatLng position;
  final bool isDefault;

  const Address({
    required this.id,
    required this.label,
    required this.detail,
    required this.commune,
    required this.city,
    required this.phone,
    required this.position,
    this.isDefault = false,
  });

  Address copyWith({bool? isDefault}) => Address(
        id: id,
        label: label,
        detail: detail,
        commune: commune,
        city: city,
        phone: phone,
        position: position,
        isDefault: isDefault ?? this.isDefault,
      );
}

class OrderItem {
  final Product product;
  final Map<String, String> selectedVariants;
  final int quantity;
  final double price;

  const OrderItem({
    required this.product,
    required this.selectedVariants,
    required this.quantity,
    required this.price,
  });

  String get variantLabel =>
      selectedVariants.values.where((v) => v.isNotEmpty).join(' · ');
}

class TimelineEntry {
  final OrderStatus status;
  final DateTime? at;

  const TimelineEntry({required this.status, this.at});

  bool get done => at != null;
}

class Order {
  final String id;
  final Store store;
  final List<OrderItem> items;
  final Address address;
  final PaymentMethod paymentMethod;
  final double subtotal;
  final double deliveryFee;
  final double discount;
  final DateTime placedAt;
  OrderStatus status;
  final List<TimelineEntry> timeline;

  /// Mocked parcel journey for the tracking map: seller -> warehouse -> customer.
  final List<LatLng> route;

  Order({
    required this.id,
    required this.store,
    required this.items,
    required this.address,
    required this.paymentMethod,
    required this.subtotal,
    required this.deliveryFee,
    required this.discount,
    required this.placedAt,
    required this.status,
    required this.timeline,
    required this.route,
  });

  double get total => subtotal + deliveryFee - discount;

  bool get canCancel =>
      status == OrderStatus.confirmed || status == OrderStatus.preparing;

  bool get canReturn {
    if (status != OrderStatus.delivered && status != OrderStatus.completed) {
      return false;
    }
    return DateTime.now().difference(placedAt).inDays <= 7;
  }
}

enum ReturnStatus { requested, approved, pickedUp, refunded, rejected }

class ReturnRequest {
  final String id;
  final Order order;
  final String reasonKey;
  final String note;
  final DateTime requestedAt;
  ReturnStatus status;
  final bool refundToWallet;

  ReturnRequest({
    required this.id,
    required this.order,
    required this.reasonKey,
    required this.note,
    required this.requestedAt,
    required this.status,
    required this.refundToWallet,
  });
}

enum WalletEntryType { refund, cashback, topUp, purchase }

class WalletEntry {
  final String id;
  final WalletEntryType type;
  final double amount; // USD, negative = debit
  final String descriptionEn;
  final String descriptionFr;
  final DateTime at;

  const WalletEntry({
    required this.id,
    required this.type,
    required this.amount,
    required this.descriptionEn,
    required this.descriptionFr,
    required this.at,
  });
}

enum NotificationType { order, promo, system }

class AppNotification {
  final String id;
  final NotificationType type;
  final String titleEn;
  final String titleFr;
  final String bodyEn;
  final String bodyFr;
  final DateTime at;
  bool read;

  AppNotification({
    required this.id,
    required this.type,
    required this.titleEn,
    required this.titleFr,
    required this.bodyEn,
    required this.bodyFr,
    required this.at,
    this.read = false,
  });
}

class Coupon {
  final String code;
  final double percentOff;
  final double fixedOff;
  final double minOrder;

  const Coupon({
    required this.code,
    this.percentOff = 0,
    this.fixedOff = 0,
    required this.minOrder,
  });

  double discountFor(double subtotal) {
    if (subtotal < minOrder) return 0;
    return percentOff > 0 ? subtotal * percentOff / 100 : fixedOff;
  }
}
