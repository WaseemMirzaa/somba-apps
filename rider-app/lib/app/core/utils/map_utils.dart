import 'package:google_maps_flutter/google_maps_flutter.dart';

/// Helpers for fitting cameras and building simple straight polylines.
class MapUtils {
  MapUtils._();

  static LatLngBounds boundsFor(List<LatLng> points) {
    var minLat = points.first.latitude;
    var maxLat = points.first.latitude;
    var minLng = points.first.longitude;
    var maxLng = points.first.longitude;
    for (final p in points) {
      if (p.latitude < minLat) minLat = p.latitude;
      if (p.latitude > maxLat) maxLat = p.latitude;
      if (p.longitude < minLng) minLng = p.longitude;
      if (p.longitude > maxLng) maxLng = p.longitude;
    }
    return LatLngBounds(
      southwest: LatLng(minLat, minLng),
      northeast: LatLng(maxLat, maxLng),
    );
  }

  static Future<void> fit(
    GoogleMapController? controller,
    List<LatLng> points, {
    double padding = 60,
  }) async {
    if (controller == null || points.isEmpty) return;
    if (points.length == 1) {
      await controller
          .animateCamera(CameraUpdate.newLatLngZoom(points.first, 14));
      return;
    }
    await controller.animateCamera(
      CameraUpdate.newLatLngBounds(boundsFor(points), padding),
    );
  }
}
