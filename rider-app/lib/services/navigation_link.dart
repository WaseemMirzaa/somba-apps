import 'package:url_launcher/url_launcher.dart';

/// Google Maps directions link. With a customer pin it navigates to the exact coordinates; otherwise it falls back to
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
