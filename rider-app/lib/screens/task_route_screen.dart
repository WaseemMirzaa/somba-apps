import 'dart:async';
import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';
import '../l10n/strings.dart';
import '../services/location_reporter.dart';
import '../services/maps_config.dart';
import '../services/models.dart';
import '../services/navigation_link.dart';
import '../services/rider_store.dart';
import '../services/route_line.dart';
import '../theme/app_theme.dart';
import '../widgets/ui.dart';

/// What the map draws: the rider, the next stop and the line between them.
class RouteMapData {
  const RouteMapData({this.me, this.stop, this.line = const [], this.approximate = true});
  final LatLngPair? me;
  final LatLngPair? stop;
  final List<LatLngPair> line;

  /// True when [line] is the straight fallback, not a road route.
  final bool approximate;
}

/// Replaces the Google map in tests (the real one needs the platform view).
typedef RouteMapBuilder = Widget Function(BuildContext context, RouteMapData data);

LatLng _ll(LatLngPair p) => LatLng(p.lat, p.lng);

/// The markers and the polyline for [data]. A straight fallback line is dashed so it is never mistaken for a road.
({Set<Marker> markers, Set<Polyline> lines}) buildRouteOverlay(RouteMapData data, {required String youLabel, required String stopLabel}) {
  final markers = <Marker>{
    if (data.me != null)
      Marker(markerId: const MarkerId('me'), position: _ll(data.me!), infoWindow: InfoWindow(title: youLabel), icon: BitmapDescriptor.defaultMarkerWithHue(BitmapDescriptor.hueAzure)),
    if (data.stop != null)
      Marker(markerId: const MarkerId('stop'), position: _ll(data.stop!), infoWindow: InfoWindow(title: stopLabel), icon: BitmapDescriptor.defaultMarkerWithHue(BitmapDescriptor.hueRed)),
  };
  final lines = <Polyline>{
    if (data.line.length >= 2)
      Polyline(
        polylineId: const PolylineId('route'),
        points: [for (final p in data.line) _ll(p)],
        color: AppColors.primary,
        width: 5,
        patterns: data.approximate ? [PatternItem.dash(18), PatternItem.gap(12)] : const [],
      ),
  };
  return (markers: markers, lines: lines);
}

/// The in-app route map of a task: where the rider is, the next stop (the same one Navigate leads to) and the route line.
/// Navigate stays the way to drive: it opens Google Maps (or Apple Maps on an iPhone). Without a Maps key the map is not
/// offered at all (see [MapsConfig]); with a key but without Routes API the line is straight and dashed, and says so.
class TaskRouteScreen extends StatefulWidget {
  const TaskRouteScreen({
    super.key,
    required this.task,
    this.launcher,
    this.isIPhone,
    this.googleInstalled,
    this.mapBuilder,
    this.routes,
    this.positionOnce,
  });

  final DeliveryTaskDto task;

  /// Same test seams as the Navigate button of the list.
  final Future<bool> Function(Uri uri)? launcher;
  final bool? isIPhone;
  final Future<bool> Function()? googleInstalled;

  /// Tests: draw something else than the Google map.
  final RouteMapBuilder? mapBuilder;

  /// Tests: the road route service.
  final RouteService? routes;

  /// Tests: where the rider is when no position is being shared (default: one GPS read when allowed).
  final Future<LatLngPair?> Function()? positionOnce;

  @override
  State<TaskRouteScreen> createState() => _TaskRouteScreenState();
}

class _TaskRouteScreenState extends State<TaskRouteScreen> {
  final store = RiderStore.instance;
  late final RouteService _routes = widget.routes ?? RouteService();
  GoogleMapController? _map;
  LatLngPair? _me;
  RouteLine? _line;
  LatLngPair? _lastOrigin;
  DateTime _lastFetch = DateTime.fromMillisecondsSinceEpoch(0);
  bool _locating = true;

  NavTarget? get _nav => navTargetFor(widget.task);
  LatLngPair? get _stop => _nav?.pin;

  @override
  void initState() {
    super.initState();
    store.location.last.addListener(_onFix);
    unawaited(_start());
  }

  @override
  void dispose() {
    store.location.last.removeListener(_onFix);
    _map?.dispose();
    super.dispose();
  }

  Future<void> _start() async {
    final shared = store.location.last.value;
    if (shared != null) {
      _me = (lat: shared.latitude, lng: shared.longitude);
    } else {
      _me = await (widget.positionOnce ?? _readOnce)();
    }
    if (!mounted) return;
    setState(() => _locating = false);
    await _refreshLine();
    _fit();
  }

  /// One GPS read, only when location is already allowed (this screen never raises the phone's prompt).
  Future<LatLngPair?> _readOnce() async {
    try {
      if (await store.location.checkAccess() != LocationAccess.granted) return null;
      final p = await Geolocator.getCurrentPosition(locationSettings: const LocationSettings(accuracy: LocationAccuracy.high)).timeout(const Duration(seconds: 8));
      return (lat: p.latitude, lng: p.longitude);
    } catch (_) {
      return null;
    }
  }

  /// A new fix while the position is shared: move the marker, and redraw the route when the rider has gone far enough.
  void _onFix() {
    final p = store.location.last.value;
    if (p == null || !mounted) return;
    setState(() => _me = (lat: p.latitude, lng: p.longitude));
    final from = _lastOrigin;
    if (from == null || haversineMeters(from, _me!) > 150 || DateTime.now().difference(_lastFetch) > const Duration(minutes: 2)) {
      unawaited(_refreshLine());
    }
  }

  Future<void> _refreshLine() async {
    final me = _me, stop = _stop;
    if (me == null || stop == null) return;
    _lastOrigin = me;
    _lastFetch = DateTime.now();
    final road = await _routes.fetch(me, stop);
    if (!mounted) return;
    setState(() => _line = road ?? RouteLine.straight(me, stop));
  }

  void _fit() {
    final me = _me, stop = _stop, c = _map;
    if (c == null || me == null || stop == null) return;
    final south = me.lat < stop.lat ? me.lat : stop.lat, north = me.lat > stop.lat ? me.lat : stop.lat;
    final west = me.lng < stop.lng ? me.lng : stop.lng, east = me.lng > stop.lng ? me.lng : stop.lng;
    // The map may not have a size yet on the first frame: try again once if the first fit is refused.
    c.animateCamera(CameraUpdate.newLatLngBounds(LatLngBounds(southwest: LatLng(south, west), northeast: LatLng(north, east)), 70)).catchError((_) {
      Future<void>.delayed(const Duration(milliseconds: 400), () {
        if (mounted) c.animateCamera(CameraUpdate.newLatLngBounds(LatLngBounds(southwest: LatLng(south, west), northeast: LatLng(north, east)), 70)).catchError((_) {});
      });
    });
  }

  Widget _buildMap(BuildContext context, RouteMapData data) {
    final b = widget.mapBuilder;
    if (b != null) return b(context, data);
    final s = Strings.of(context);
    final overlay = buildRouteOverlay(data, youLabel: s.routeYouMarker, stopLabel: s.routeStop);
    final center = data.stop ?? data.me ?? (lat: MapsConfig.defaultLat, lng: MapsConfig.defaultLng);
    return GoogleMap(
      key: const ValueKey('route-map'),
      initialCameraPosition: CameraPosition(target: _ll(center), zoom: 14),
      onMapCreated: (c) {
        _map = c;
        _fit();
      },
      markers: overlay.markers,
      polylines: overlay.lines,
      myLocationEnabled: false,
      myLocationButtonEnabled: false,
      mapToolbarEnabled: false,
      zoomControlsEnabled: true,
      compassEnabled: false,
    );
  }

  Future<void> _navigate(Strings s) async {
    final nav = _nav;
    if (nav == null) return;
    final opened = await openNavigation(
      pin: nav.pin,
      addressText: nav.addressText,
      launcher: widget.launcher,
      isIPhone: widget.isIPhone,
      googleInstalled: widget.googleInstalled,
    );
    if (!opened && mounted) showSnack(context, s.navFailed);
  }

  String _distance(int meters) => meters >= 1000 ? '${(meters / 1000).toStringAsFixed(1)} km' : '$meters m';

  @override
  Widget build(BuildContext context) {
    final s = Strings.of(context);
    final nav = _nav;
    final data = RouteMapData(me: _me, stop: _stop, line: _line?.points ?? const [], approximate: _line?.approximate ?? true);
    final notes = <String>[
      if (_stop == null) s.routeNoPin,
      if (_me == null && !_locating) s.routeNoPosition,
    ];
    final line = _line;
    return Scaffold(
      appBar: backAppBar(context, widget.task.orderReference),
      body: Column(children: [
        Expanded(child: ClipRect(child: _buildMap(context, data))),
        SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
            child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
              if (line?.distanceMeters != null)
                Wrap(spacing: 8, runSpacing: 6, children: [
                  Pill(s.routeDistance(_distance(line!.distanceMeters!)), key: const ValueKey('route-distance'), color: AppColors.primary.withValues(alpha: 0.12), textColor: AppColors.primary),
                  if (!line.approximate && line.durationSeconds != null)
                    Pill(s.routeEta((line.durationSeconds! / 60).ceil()), key: const ValueKey('route-eta'), color: AppColors.success.withValues(alpha: 0.14), textColor: AppColors.success),
                ]),
              if (line != null && line.approximate)
                Padding(padding: const EdgeInsets.only(top: 8), child: Text(s.routeStraight, key: const ValueKey('route-straight'), style: const TextStyle(color: AppColors.muted, fontSize: 12.5, height: 1.35))),
              for (final n in notes)
                Padding(padding: const EdgeInsets.only(top: 8), child: Text(n, key: ValueKey('route-note-$n'), style: const TextStyle(color: AppColors.muted, fontSize: 12.5, height: 1.35))),
              if (nav != null) ...[
                const SizedBox(height: 12),
                SizedBox(
                  width: double.infinity,
                  child: FilledButton(
                    key: const ValueKey('route-navigate'),
                    onPressed: () => _navigate(s),
                    child: ButtonLabel(switch (nav.kind) {
                      NavKind.seller => s.navigateSeller,
                      NavKind.hub => s.navigateHub,
                      NavKind.pickup => s.navigatePickup,
                      NavKind.customer => s.navigateCustomer,
                    }),
                  ),
                ),
              ],
            ]),
          ),
        ),
      ]),
    );
  }
}
