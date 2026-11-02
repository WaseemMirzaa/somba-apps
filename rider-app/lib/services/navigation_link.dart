import 'package:flutter/foundation.dart' show TargetPlatform, defaultTargetPlatform, kIsWeb;
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

/// Apple Maps directions link (`dirflg=d`: Apple Maps has no two-wheeler mode). With a pin it navigates to the exact
/// coordinates; otherwise it falls back to the address text. No key is needed: on an iPhone the link opens Apple Maps.
Uri appleNavigationUri({({double lat, double lng})? pin, String? addressText}) {
  final destination = pin != null ? '${pin.lat},${pin.lng}' : (addressText ?? '').trim();
  return Uri.https('maps.apple.com', '/', {
    'daddr': destination,
    'dirflg': 'd',
  });
}

/// The two maps apps a rider can navigate with.
enum MapsApp { google, apple }

/// Is the Google Maps app installed? Only asked on an iPhone (the `comgooglemaps` scheme is listed in
/// `LSApplicationQueriesSchemes` of Info.plist, which iOS requires before it answers).
Future<bool> googleMapsInstalled() async {
  try {
    return await canLaunchUrl(Uri.parse('comgooglemaps://'));
  } catch (_) {
    return false;
  }
}

bool get _onIPhone => !kIsWeb && defaultTargetPlatform == TargetPlatform.iOS;

/// Opens turn-by-turn navigation. Returns false when nothing could be opened or there is no destination.
///
/// Android (and everything but an iPhone): the Google Maps link, as before (the Google Maps app, else the browser).
/// iPhone: Apple Maps is always there, so a rider without Google Maps goes straight to it (no extra tap); a rider who
/// has both is asked once per trip through [choose] (default: Google Maps). A rider who dismisses the choice cancelled:
/// nothing opens and nothing is reported as failed (true).
/// [launcher], [isIPhone], [googleInstalled] and [choose] are the test seams.
Future<bool> openNavigation({
  ({double lat, double lng})? pin,
  String? addressText,
  Future<bool> Function(Uri uri)? launcher,
  bool? isIPhone,
  Future<bool> Function()? googleInstalled,
  Future<MapsApp?> Function()? choose,
}) async {
  if (pin == null && (addressText ?? '').trim().isEmpty) return false;
  try {
    var app = MapsApp.google;
    if (isIPhone ?? _onIPhone) {
      if (!await (googleInstalled ?? googleMapsInstalled)()) {
        app = MapsApp.apple;
      } else if (choose != null) {
        final picked = await choose();
        if (picked == null) return true;
        app = picked;
      }
    }
    final uri = app == MapsApp.apple ? appleNavigationUri(pin: pin, addressText: addressText) : navigationUri(pin: pin, addressText: addressText);
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
