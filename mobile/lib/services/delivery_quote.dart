import 'package:flutter/foundation.dart';
import 'dart:async';
import '../data/shop_state.dart';
import '../l10n/server_errors_areas.dart';
import '../l10n/strings.dart';
import 'auth_service.dart' show ApiException;
import 'geo_directory.dart';
import 'geo_models.dart';
import 'models.dart';
import 'realtime_store.dart';

/// The delivery fee the server will charge (`delivery:quote`): base + per-km from the destination warehouse to the
/// customer's pin, plus a transfer fee per hop a parcel travels between warehouses. Cart and checkout show this
/// number and `orders:create` charges exactly it.
class DeliveryQuote {
  const DeliveryQuote({
    required this.feeUsd,
    this.deliveryUsd = 0,
    this.transferUsd = 0,
    this.distanceKm = 0,
    this.destinationHubId,
    this.destinationHubName,
    this.destinationHubCity,
    this.originHubIds = const [],
    this.transfer = false,
    this.pinned = true,
    this.fallback,
    this.coveringHubId,
    this.coveringHubName,
    this.served = true,
    this.destinationArea,
    this.destinationAreaChain = const [],
    this.origins = const [],
    this.feeOverrideUsd,
    this.interCity = false,
    this.interCityDays = 0,
    this.transitHours = 0,
    this.extraDays,
  });

  final double feeUsd;
  final double deliveryUsd;
  final double transferUsd;
  final double distanceKm;
  final String? destinationHubId;
  final String? destinationHubName;
  final String? destinationHubCity;
  final List<String> originHubIds;

  /// A parcel moves between two warehouses before it reaches the customer's warehouse.
  final bool transfer;

  /// False when the address has no map pin: the route was guessed from the city.
  final bool pinned;

  /// `city` | `nearest` | `no_riders` when the warehouse covering the address has no rider and the route used a fallback,
  /// else null. With `city` / `nearest` another warehouse delivers instead; with `no_riders` the order stays on the
  /// covering one.
  final String? fallback;

  /// The warehouse that covers the area but has no rider (set with [fallback]).
  final String? coveringHubId;
  final String? coveringHubName;

  /// A warehouse delivers to the address's area (docs/contracts/areas.md). True when an older server does not say.
  final bool served;

  /// The area the order is delivered to; null on an older server.
  final AreaDto? destinationArea;

  /// The areas from the country down to [destinationArea]; empty on an older server.
  final List<AreaDto> destinationAreaChain;

  /// Where each seller's parcels start from.
  final List<QuoteOrigin> origins;

  /// The flat delivery fee of the area's coverage row, when one applied (it replaces base + per km).
  final double? feeOverrideUsd;

  /// The seller's pickup and the customer's address are in different cities, and the extra days the setting allows for
  /// it ([interCityDays], used when no lane gives a transit time).
  final bool interCity;
  final int interCityDays;

  /// Hours the parcels spend travelling between warehouses (the lanes' transit times added up); 0 when none.
  final double transitHours;

  /// Days the server adds to the delivery estimate for the transfers (null on older servers).
  final int? extraDays;

  /// The days to add to the estimate shown: the server's own number, else the lanes' transit time in whole days, else
  /// the inter-city allowance.
  int get estimateExtraDays => extraDays ?? (transitHours > 0 ? (transitHours / 24).ceil() : (interCity ? interCityDays : 0));

  /// The warehouse covering the address has no rider (some fallback applied and the server named the warehouse).
  bool get hasFallback => fallback != null && (coveringHubName ?? '').isNotEmpty;

  /// Another warehouse delivers because the covering one has no rider (`city` / `nearest`), as opposed to `no_riders`,
  /// where nobody nearby has one and the covering warehouse keeps the order.
  bool get standsIn => hasFallback && fallback != 'no_riders' && coveringHubName != destinationHubName;

  /// The routes parcels travel along to reach the destination, one per distinct chain of warehouses (sellers whose
  /// parcels take the same route share one; a seller whose parcels need no transfer has none). Empty on older servers.
  List<QuoteRoute> get routeChains {
    final seen = <String>{};
    final out = <QuoteRoute>[];
    for (final o in origins) {
      if (o.hops.isEmpty) continue;
      final route = QuoteRoute(o.hops);
      final names = route.names;
      if (names.any((n) => n.isEmpty) || !seen.add(names.join('>'))) continue;
      out.add(route);
    }
    return out;
  }

  /// The warehouse chains as names from the collecting warehouse to the delivering one, one per distinct route.
  List<List<String>> get routes => [for (final r in routeChains) r.names];

  /// Parcels pass through at least one relay warehouse (a route of two hops or more).
  bool get relayed => routes.any((r) => r.length >= 3);

  /// Every distinct hop the parcels travel: several sellers whose parcels share a hop pay it once.
  List<QuoteHop> get distinctHops {
    final seen = <String>{};
    return [
      for (final o in origins)
        for (final h in o.hops)
          if (seen.add(h.key)) h,
    ];
  }

  /// What one hop costs: the lane's own cost when it has one, else the standard transfer fee. That fee is not sent on
  /// its own, so it is what is left of [transferUsd] once the lanes' own costs are taken off, shared by the hops
  /// without one. Null when it cannot be told (nothing left to share).
  double? hopFeeUsd(QuoteHop hop) {
    final own = hop.costUsd;
    if (own != null) return own;
    final hops = distinctHops;
    final plain = hops.where((h) => h.costUsd == null).length;
    if (plain == 0) return null;
    final left = transferUsd - hops.fold(0.0, (sum, h) => sum + (h.costUsd ?? 0));
    if (left <= 0.004) return null;
    return (left / plain * 100).round() / 100;
  }

  factory DeliveryQuote.fromJson(Map<String, dynamic> j) {
    final hub = j['destinationHub'];
    final chain = AreaDto.listFrom(j['destinationAreaChain']);
    return DeliveryQuote(
      feeUsd: _num(j['feeUsd']),
      deliveryUsd: _num(j['deliveryUsd']),
      transferUsd: _num(j['transferUsd']),
      distanceKm: _num(j['distanceKm']),
      destinationHubId: textOrNull(j['destinationHubId']) ?? (hub is Map ? textOrNull(hub['id']) : null),
      destinationHubName: textOrNull(j['destinationHubName']) ?? (hub is Map ? textOrNull(hub['name']) : null),
      destinationHubCity: hub is Map ? textOrNull(hub['city']) : null,
      originHubIds: j['originHubIds'] is List ? [for (final e in j['originHubIds'] as List) if (e is String) e] : const [],
      transfer: j['transfer'] == true,
      pinned: j['pinned'] != false,
      fallback: textOrNull(j['fallback']),
      coveringHubId: textOrNull(j['coveringHubId']),
      coveringHubName: textOrNull(j['coveringHubName']),
      served: j['served'] != false,
      destinationArea: j['destinationArea'] is Map ? AreaDto.fromJson(_map(j['destinationArea'])) : (chain.isEmpty ? null : chain.last),
      destinationAreaChain: chain,
      origins: j['origins'] is List ? [for (final o in j['origins'] as List) if (o is Map) QuoteOrigin.fromJson(_map(o))] : const [],
      feeOverrideUsd: j['feeOverrideUsd'] is num ? (j['feeOverrideUsd'] as num).toDouble() : null,
      interCity: j['interCity'] == true,
      interCityDays: j['interCityDays'] is num ? (j['interCityDays'] as num).toInt() : 0,
      transitHours: _num(j['transitHours']),
      extraDays: j['extraDays'] is num ? (j['extraDays'] as num).toInt() : null,
    );
  }
}

double _num(Object? v) => v is num ? v.toDouble() : (double.tryParse('${v ?? ''}') ?? 0);

Map<String, dynamic> _map(Map<dynamic, dynamic> m) => m.map((k, v) => MapEntry(k.toString(), v));

/// Where one seller's parcels leave from (`origins` of the quote), and the warehouse-to-warehouse hops they travel.
class QuoteOrigin {
  const QuoteOrigin({
    required this.sellerId,
    this.hubId,
    this.hubName,
    this.areaName,
    this.areaNameEn,
    this.fallback,
    this.coveringHubId,
    this.coveringHubName,
    this.transitHours = 0,
    this.hops = const [],
  });

  final String sellerId;

  /// The warehouse that collects (the covering one, or the one standing in for it when [fallback] is set).
  final String? hubId;
  final String? hubName;

  /// The seller's pickup area, in French and English.
  final String? areaName;
  final String? areaNameEn;

  /// `city` | `nearest` | `no_riders` when the warehouse covering the pickup area has no rider, else null.
  final String? fallback;
  final String? coveringHubId;
  final String? coveringHubName;

  /// Hours this seller's parcels spend travelling between warehouses.
  final double transitHours;
  final List<QuoteHop> hops;

  String? areaNameFor(String lang) => lang == 'en' ? (areaNameEn ?? areaName) : (areaName ?? areaNameEn);

  /// The warehouse covering the pickup area has no rider and the server named it.
  bool get hasFallback => fallback != null && (coveringHubName ?? '').isNotEmpty;

  /// Another warehouse collects in its place (`city` / `nearest`).
  bool get standsIn => hasFallback && fallback != 'no_riders' && coveringHubName != hubName;

  factory QuoteOrigin.fromJson(Map<String, dynamic> j) => QuoteOrigin(
        sellerId: '${j['sellerId'] ?? ''}',
        hubId: textOrNull(j['hubId']),
        hubName: textOrNull(j['hubName']),
        areaName: textOrNull(j['areaName']),
        areaNameEn: textOrNull(j['areaNameEn']),
        fallback: textOrNull(j['fallback']),
        coveringHubId: textOrNull(j['coveringHubId']),
        coveringHubName: textOrNull(j['coveringHubName']),
        transitHours: _num(j['transitHours']),
        hops: j['hops'] is List ? [for (final h in j['hops'] as List) if (h is Map) QuoteHop.fromJson(_map(h))] : const [],
      );
}

/// One hop of a route between two warehouses: the lane's transit time and its own cost.
class QuoteHop {
  const QuoteHop({this.fromHubId, this.fromHubName, this.toHubId, this.toHubName, this.transitHours = 0, this.costUsd});
  final String? fromHubId, fromHubName, toHubId, toHubName;

  /// Hours the lane takes; 0 when it has no transit time (a direct transfer with no lane).
  final double transitHours;

  /// The lane's own cost; null means the standard transfer fee applies.
  final double? costUsd;

  /// Identifies the hop (the same lane from two sellers is one hop).
  String get key => '${fromHubId ?? fromHubName ?? ''}>${toHubId ?? toHubName ?? ''}';

  factory QuoteHop.fromJson(Map<String, dynamic> j) => QuoteHop(
        fromHubId: textOrNull(j['fromHubId']),
        fromHubName: textOrNull(j['fromHubName']),
        toHubId: textOrNull(j['toHubId']),
        toHubName: textOrNull(j['toHubName']),
        transitHours: _num(j['transitHours']),
        costUsd: j['costUsd'] is num ? (j['costUsd'] as num).toDouble() : null,
      );
}

/// A chain of hops between warehouses, from the one that collects to the one that delivers.
class QuoteRoute {
  const QuoteRoute(this.hops);
  final List<QuoteHop> hops;

  /// The warehouse names along the chain (empty strings where the server gave none).
  List<String> get names => [hops.first.fromHubName ?? '', for (final h in hops) h.toHubName ?? ''];

  /// Some hop has a transit time or a cost of its own worth showing.
  bool get hasHopDetails => hops.any((h) => h.transitHours > 0 || h.costUsd != null);
}

/// How many served cities a not-served notice lists before it says "+N more".
const int kNotServedCitiesMax = 6;

/// The server's refusal of an address in an area no warehouse covers (`delivery:quote` and `orders:create`):
/// `{ ok: false, error, code: 'not_served', areaId, areaName, areaNameEn, servedCities }`. An older server sends only
/// the message "We don't deliver to {area} yet.", which is read as well (then [structured] is false and the area is
/// named in French, or typed text).
class NotServed {
  const NotServed({this.areaId, this.areaName, this.areaNameEn, this.servedCities = const [], this.structured = false});

  /// The area that was refused; null when nothing could be matched.
  final String? areaId;

  /// Its official (French) name, or the text the customer typed.
  final String? areaName;

  /// Its English name.
  final String? areaNameEn;

  /// The cities we deliver in.
  final List<ServedCity> servedCities;

  /// The refusal came with its structured fields (the final contract), so the names can be trusted as they are.
  final bool structured;

  /// The refused area in the app's language: English when asked and known, else the French name. Null when unnamed.
  String? nameFor(String lang) => lang == 'en' ? (areaNameEn ?? areaName) : (areaName ?? areaNameEn);
}

/// The refusal in [error], or null when it is something else. Reads the structured fields of the ack
/// ([ApiException.code] `not_served` and its details), else the message alone.
NotServed? notServedOf(Object? error) {
  final msg = error is ApiException ? error.message : (error is String ? error : null);
  if (msg == null) return null;
  final coded = error is ApiException && error.code == 'not_served';
  final m = kNotServedPattern.firstMatch(msg.trim());
  if (!coded && m == null) return null;
  final d = error is ApiException ? error.details : const <String, Object?>{};
  // "this area" is the server's word for an area it could not name.
  final typed = m?[1];
  final fromMessage = typed == null || typed == kNotServedUnnamed ? null : typed;
  return NotServed(
    areaId: textOrNull(d['areaId']),
    areaName: textOrNull(d['areaName']) ?? fromMessage,
    areaNameEn: textOrNull(d['areaNameEn']),
    servedCities: ServedCity.listFrom(d['servedCities']),
    structured: coded,
  );
}

/// The not-served notice as two lines: what we do not deliver to, and where we do deliver.
class NotServedText {
  const NotServedText(this.headline, [this.cities]);

  /// "We don't deliver to {area} yet."
  final String headline;

  /// "We currently deliver in: {cities}"; null when no city is known.
  final String? cities;

  /// Both lines as one sentence (for a snackbar).
  String get full => cities == null ? headline : '$headline $cities';
}

/// The "not served" notice for [address] in [s]'s language, or null when the address can be delivered to.
/// [refusal] is the server's refusal (a quote or an order), whose structured names are used as sent; a message-only
/// refusal names the area in French, so it is shown as the address's own area of that name in the app's language when
/// the address carries it, else as the server wrote it. [cities] are the cities to list when the refusal carries none.
///
/// The address's own "served" flag can be stale (coverage changes after the list was read), so callers pass
/// [useAddressFlag] false once the quote has answered: then only the quote and the server's refusal count.
NotServedText? notServedText(Strings s,
    {AddressDto? address, NotServed? refusal, bool? quoteServed, bool useAddressFlag = true, List<ServedCity> cities = const []}) {
  if (refusal == null && quoteServed != false && !(useAddressFlag && address?.notServed == true)) return null;
  String? name;
  if (refusal != null) {
    final given = refusal.nameFor(s.lang);
    if (given != null) {
      if (refusal.structured) {
        name = given;
      } else {
        final match = (address?.areaChain ?? const <AreaDto>[]).where((a) => a.isCalled(given)).toList();
        name = match.isNotEmpty ? match.last.nameFor(s.lang) : given;
      }
    }
  }
  name ??= address?.areaNameIn(s.lang);
  final headline = name == null || name.isEmpty ? s.areaNotServedGeneric : s.areaNotServed(name);
  final list = refusal != null && refusal.servedCities.isNotEmpty ? refusal.servedCities : cities;
  return NotServedText(headline, list.isEmpty ? null : s.areaDeliverIn(_cityNames(s, list)));
}

/// The cities in [s]'s language, each once, the first [kNotServedCitiesMax] and then "+N more".
String _cityNames(Strings s, List<ServedCity> cities) {
  final names = <String>[];
  for (final c in cities) {
    final n = c.nameFor(s.lang);
    if (!names.contains(n)) names.add(n);
  }
  final shown = names.take(kNotServedCitiesMax).toList();
  final rest = names.length - shown.length;
  return [...shown, if (rest > 0) s.coverageMore(rest)].join(', ');
}

/// Keeps one screen's quote in step with its address and lines: asks again only when either changed, ignores
/// answers that arrive late. A failure leaves [quote] empty and [error] set (the screen says so and blocks ordering).
class QuoteController extends ChangeNotifier {
  DeliveryQuote? quote;
  bool loading = false;
  Object? error;
  String _key = '';
  int _seq = 0;
  bool _disposed = false;

  /// What the quote depends on: the address (and its pin) and which products are bought (the sellers decide the origin
  /// warehouses; quantities do not matter).
  static String keyFor(AddressDto? address, List<CartItem> lines) {
    final a = address == null ? '-' : '${address.id}|${address.geo?.lat}|${address.geo?.lng}|${address.city}|${address.areaId}';
    final ids = lines.map((l) => l.product.uuid).toSet().toList()..sort();
    return '$a#${ids.join(',')}';
  }

  /// Ask for the quote of [address] and [lines] unless that is what is already shown (or being fetched).
  Future<void> update(AddressDto? address, List<CartItem> lines, {bool force = false}) async {
    final key = keyFor(address, lines);
    if (!force && key == _key) return;
    _key = key;
    final seq = ++_seq;
    // Callable from a build method: the state changes land after the frame's microtask, never mid-build.
    await Future<void>.value();
    if (seq != _seq) return;
    if (address == null || lines.isEmpty) {
      quote = null;
      error = null;
      loading = false;
      _notify();
      return;
    }
    loading = true;
    error = null;
    _notify();
    try {
      final res = await RealtimeStore.instance.call('delivery:quote', {
        'addressId': address.id,
        'lines': [for (final l in lines) {'productId': l.product.uuid, 'qty': l.qty}],
      });
      if (seq != _seq) return;
      quote = DeliveryQuote.fromJson((res as Map).map((k, v) => MapEntry(k.toString(), v)));
    } catch (e) {
      if (seq != _seq) return;
      quote = null;
      error = e;
    }
    loading = false;
    _notify();
    if (notServed) unawaited(_loadServedCities());
  }

  /// The server's refusal to deliver to this address (the area it names and the cities it lists), else null.
  NotServed? get refusal => notServedOf(error);

  /// The server says no warehouse delivers to this address: in the quote, or as its refusal.
  bool get notServed => quote?.served == false || refusal != null;

  /// The cities we deliver in, read from the geo directory when the refusal does not list them (an older server, or a
  /// quote that only says `served: false`). Empty until loaded.
  List<ServedCity> servedCities = GeoDirectory.instance.cachedServedCities ?? const [];

  /// The notice for [address] in [s]'s language, or null when it can be delivered to.
  NotServedText? notice(Strings s, AddressDto? address) =>
      notServedText(s, address: address, refusal: refusal, quoteServed: quote?.served, useAddressFlag: quote == null, cities: servedCities);

  /// A refusal that does not list the cities (a message-only one from an older server, or a quote that just says
  /// `served: false`): ask the geo directory for them (once; it caches). A structured refusal is trusted as it is.
  Future<void> _loadServedCities() async {
    final r = refusal;
    final bare = r == null ? quote?.served == false : !r.structured;
    if (!bare) return;
    try {
      final cities = await GeoDirectory.instance.servedCities();
      if (_disposed || cities.isEmpty || identical(cities, servedCities)) return;
      servedCities = cities;
      _notify();
    } catch (_) {/* the notice just stays without the list */}
  }

  /// Ask again (a tap on "Try again").
  Future<void> retry(AddressDto? address, List<CartItem> lines) => update(address, lines, force: true);

  void _notify() {
    if (!_disposed) notifyListeners();
  }

  @override
  void dispose() {
    _disposed = true;
    super.dispose();
  }
}
