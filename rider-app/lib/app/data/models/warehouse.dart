import 'package:google_maps_flutter/google_maps_flutter.dart';

class Warehouse {
  final String id;
  final String name;
  final LatLng position;

  const Warehouse({
    required this.id,
    required this.name,
    required this.position,
  });
}
