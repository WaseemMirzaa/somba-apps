import 'package:url_launcher/url_launcher.dart';
import 'models.dart';

/// Google Maps directions link. With a pin it navigates to the exact coordinates; otherwise it falls back to
/// the address text. No API key is needed: the link opens the Google Maps app when installed, else the browser.
/// `two-wheeler` is the travel mode for motorbike riders.
Uri navigationUri({({double lat, double lng})? pin, String? addressText}) {
  final destination = pin != null ? '${pin.lat},${pin.lng}' : (addressText ?? '').trim();
  return Uri.https('www.google.com', '/maps/dir/', {
    'api': '1',
    'destination': destination,
    'travelmode': 'two-wheeler',
  });
}

/// Opens turn-by-turn navigation. Returns false when nothing could be opened or there is no destination.
Future<bool> openNavigation({({double lat, double lng})? pin, String? addressText, Future<bool> Function(Uri uri)? launcher}) async {
  if (pin == null && (addressText ?? '').trim().isEmpty) return false;
  final uri = navigationUri(pin: pin, addressText: addressText);
  try {
    return await (launcher ?? (u) => launchUrl(u, mode: LaunchMode.externalApplication))(uri);
  } catch (_) {
    return false;
  }
}

/// Who the navigation button leads to.
enum NavKind {
  /// A seller's pickup address.
  seller,

  /// A warehouse.
  hub,

  /// The customer's address (or map pin).
  customer,

  /// An older payload: the pickup address text, no endpoints.
  pickup,
}

/// Where the Navigate button of a leg leads.
class NavTarget {
  const NavTarget(this.kind, {this.pin, this.addressText});
  final NavKind kind;
  final ({double lat, double lng})? pin;
  final String? addressText;
}

/// The navigation target of a leg. Before the rider has the parcel (`assigned`) it is where the parcel is
/// (the seller, a warehouse, or the customer on a return); once picked up it is where the parcel goes.
/// A customer target uses the customer's exact pin when there is one, else street, commune and city (never the
/// landmark line, which a geocoder cannot find). Null when the leg has nothing to navigate to.
NavTarget? navTargetFor(DeliveryTaskDto t) {
  final ep = t.status == 'assigned' ? t.from : t.to;
  if (ep != null) {
    if (ep.isCustomer) {
      final q = t.mapsQuery;
      return NavTarget(NavKind.customer, pin: t.pin ?? ep.pin, addressText: q.isNotEmpty ? q : ep.address);
    }
    // A seller's pickup address is searched on its own (a shop name only gets in the geocoder's way); a warehouse by name and address.
    final text = ep.isSeller ? (ep.address ?? ep.name) : (ep.label.isNotEmpty ? ep.label : null);
    return NavTarget(ep.isSeller ? NavKind.seller : NavKind.hub, pin: ep.pin, addressText: text);
  }
  // Older payload without endpoints: pickup text first, then the customer's address.
  if (t.status == 'assigned' && t.pickupAddress != null) return NavTarget(NavKind.pickup, addressText: t.pickupAddress);
  return NavTarget(NavKind.customer, pin: t.pin, addressText: t.mapsQuery);
}
