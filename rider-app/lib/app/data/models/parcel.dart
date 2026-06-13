class Parcel {
  final String id;
  final String barcode;
  final String orderId;
  final String description;
  bool scanned;

  Parcel({
    required this.id,
    required this.barcode,
    required this.orderId,
    required this.description,
    this.scanned = false,
  });
}
