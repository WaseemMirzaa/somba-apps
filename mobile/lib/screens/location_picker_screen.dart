import 'dart:async';
import 'dart:math';
import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';
import '../l10n/strings.dart';
import '../services/maps_config.dart';
import '../services/places_client.dart';
import '../theme/app_theme.dart';
import '../widgets/kit.dart';

/// The map under the fixed centre pin. Tests pass their own (the native map cannot run there).
typedef PickerMapBuilder = Widget Function(
  BuildContext context, {
  required LatLng initial,
  required ValueChanged<LatLng> onMove,
  required VoidCallback onIdle,
  required ValueChanged<GoogleMapController> onCreated,
});

/// "Number and street": at least 4 characters with a letter. Shared by the picker and the address form.
String? streetAddressError(String value, Strings s) {
  final v = value.trim();
  if (v.isEmpty) return s.addrErrStreet;
  if (v.length < 4 || !RegExp(r'[A-Za-zÀ-ÿ]').hasMatch(v)) return s.addrErrStreetExact;
  return null;
}

/// Uber-style location picker: a full-screen map with a pin fixed in the centre (the map moves, not the pin),
/// place search at the top and, at the bottom, the address under the pin with a mandatory exact street address.
/// Pops with the [PickedPlace] (its `parts.line1` is the street the customer confirmed), or null when backed out.
class LocationPickerScreen extends StatefulWidget {
  final ({double lat, double lng})? initialPin;
  final String? initialStreet;
  final PlacesClient? client;
  final PickerMapBuilder? mapBuilder;

  /// Tests: skip the "centre on my position" request made when there is no pin yet.
  final bool locateOnOpen;

  const LocationPickerScreen({super.key, this.initialPin, this.initialStreet, this.client, this.mapBuilder, this.locateOnOpen = true});

  @override
  State<LocationPickerScreen> createState() => _LocationPickerScreenState();
}

class _LocationPickerScreenState extends State<LocationPickerScreen> {
  late final PlacesClient _places = widget.client ?? PlacesClient(language: Strings.current.lang);
  final _search = TextEditingController();
  final _searchFocus = FocusNode();
  final _street = TextEditingController();
  final _rng = Random.secure();
  late String _session = _newSession();

  GoogleMapController? _map;
  late LatLng _center;
  PickedPlace? _place; // the address found under the pin
  bool _moving = false;
  bool _resolving = false;
  bool _skipNextLookup = false; // a chosen search result is already resolved
  bool _streetEdited = false; // the customer's own street text wins over later lookups
  int _lookupSeq = 0;
  Timer? _searchDebounce;
  List<PlaceSuggestion> _suggestions = const [];
  bool _searched = false;
  bool _locating = false;
  String? _streetErr, _notice;

  @override
  void initState() {
    super.initState();
    final p = widget.initialPin;
    _center = p != null ? LatLng(p.lat, p.lng) : const LatLng(MapsConfig.defaultLat, MapsConfig.defaultLng);
    if ((widget.initialStreet ?? '').trim().isNotEmpty) {
      _street.text = widget.initialStreet!.trim();
      _streetEdited = true;
    }
    _searchFocus.addListener(() => setState(() {}));
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      if (p == null && widget.locateOnOpen) {
        _useMyLocation(quiet: true);
      } else {
        _lookup();
      }
    });
  }

  String _newSession() => List.generate(24, (_) => _rng.nextInt(16).toRadixString(16)).join();

  @override
  void dispose() {
    _searchDebounce?.cancel();
    _search.dispose();
    _searchFocus.dispose();
    _street.dispose();
    _map?.dispose();
    super.dispose();
  }

  // ---------------------------------------------------------------- map
  void _onMove(LatLng pos) {
    _center = pos;
    if (!_moving) setState(() => _moving = true);
  }

  void _onIdle() {
    setState(() => _moving = false);
    if (_skipNextLookup) {
      _skipNextLookup = false;
      return;
    }
    _lookup();
  }

  /// Reverse-geocodes the centre. A newer lookup cancels the result of an older one.
  Future<void> _lookup() async {
    final seq = ++_lookupSeq;
    final at = _center;
    setState(() {
      _resolving = true;
      _notice = null;
    });
    try {
      final place = await _places.reverseGeocode(at.latitude, at.longitude);
      if (!mounted || seq != _lookupSeq) return;
      _setPlace(place, overwriteStreet: false);
    } catch (_) {
      if (!mounted || seq != _lookupSeq) return;
      setState(() {
        _place = PickedPlace(lat: at.latitude, lng: at.longitude);
        _notice = Strings.of(context).addrMapLookupFailed;
      });
    } finally {
      if (mounted && seq == _lookupSeq) setState(() => _resolving = false);
    }
  }

  void _setPlace(PickedPlace place, {required bool overwriteStreet}) {
    setState(() {
      _place = place;
      final street = place.parts.line1 ?? '';
      if (overwriteStreet || !_streetEdited) {
        _street.text = street;
        _streetEdited = false;
      }
      if (_street.text.trim().isNotEmpty) _streetErr = null;
    });
  }

  Future<void> _moveTo(LatLng pos) async {
    _center = pos;
    await _map?.animateCamera(CameraUpdate.newLatLngZoom(pos, 17));
  }

  // ---------------------------------------------------------------- search
  void _onQuery(String q) {
    _searchDebounce?.cancel();
    if (q.trim().length < 2) {
      setState(() {
        _suggestions = const [];
        _searched = false;
      });
      return;
    }
    _searchDebounce = Timer(const Duration(milliseconds: 300), () async {
      try {
        final r = await _places.autocomplete(q, sessionToken: _session, biasLat: _center.latitude, biasLng: _center.longitude);
        if (mounted && _search.text == q) {
          setState(() {
            _suggestions = r;
            _searched = true;
          });
        }
      } catch (_) {
        if (mounted) setState(() => _notice = Strings.of(context).addrMapLookupFailed);
      }
    });
  }

  Future<void> _choose(PlaceSuggestion sug) async {
    _closeSearch();
    setState(() => _resolving = true);
    try {
      final place = await _places.details(sug.placeId, sessionToken: _session);
      _session = _newSession(); // a finished selection ends the billing session
      if (!mounted) return;
      _lookupSeq++; // drop any lookup still in flight
      _skipNextLookup = _map != null; // the camera move it triggers needs no second lookup
      _setPlace(place, overwriteStreet: true);
      await _moveTo(LatLng(place.lat, place.lng));
    } catch (_) {
      if (mounted) setState(() => _notice = Strings.of(context).addrMapLookupFailed);
    } finally {
      if (mounted) setState(() => _resolving = false);
    }
  }

  void _closeSearch() {
    _searchFocus.unfocus();
    setState(() {
      _search.clear();
      _suggestions = const [];
      _searched = false;
    });
  }

  Future<void> _useMyLocation({bool quiet = false}) async {
    final s = Strings.of(context);
    _closeSearch();
    setState(() => _locating = true);
    try {
      var perm = await Geolocator.checkPermission();
      if (perm == LocationPermission.denied) perm = await Geolocator.requestPermission();
      if (perm == LocationPermission.denied || perm == LocationPermission.deniedForever) {
        if (!quiet && mounted) _snack(s.addrMapLocationDenied);
        if (mounted) await _lookup();
        return;
      }
      final p = await Geolocator.getCurrentPosition(locationSettings: const LocationSettings(accuracy: LocationAccuracy.high, timeLimit: Duration(seconds: 10)));
      if (!mounted) return;
      final pos = LatLng(p.latitude, p.longitude);
      if (_map == null) {
        _center = pos;
        await _lookup();
      } else {
        await _moveTo(pos); // the camera's idle event does the lookup
      }
    } catch (_) {
      if (!quiet && mounted) _snack(s.addrMapLocationDenied);
      if (mounted) await _lookup();
    } finally {
      if (mounted) setState(() => _locating = false);
    }
  }

  // ---------------------------------------------------------------- confirm
  void _confirm() {
    if (_moving) return; // the pin is not settled yet
    final s = Strings.of(context);
    final err = streetAddressError(_street.text, s);
    setState(() => _streetErr = err);
    if (err != null) {
      _snack(err);
      return;
    }
    final p = _place;
    final parts = p?.parts ?? const PickedParts();
    Navigator.pop(
      context,
      PickedPlace(
        lat: _center.latitude,
        lng: _center.longitude,
        placeId: p?.placeId,
        formatted: p?.formatted,
        components: p?.components ?? const [],
        parts: PickedParts(
          line1: _street.text.trim(),
          commune: parts.commune,
          city: parts.city,
          region: parts.region,
          country: parts.country,
          postalCode: parts.postalCode,
        ),
      ),
    );
  }

  void _snack(String m) => ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: Text(m)));

  // ---------------------------------------------------------------- UI
  Widget _buildMap(BuildContext context) {
    final b = widget.mapBuilder;
    if (b != null) {
      return b(context, initial: _center, onMove: _onMove, onIdle: _onIdle, onCreated: (c) => _map = c);
    }
    return GoogleMap(
      key: const ValueKey('picker-map'),
      initialCameraPosition: CameraPosition(target: _center, zoom: widget.initialPin == null ? 13 : 17),
      onMapCreated: (c) => _map = c,
      onCameraMove: (p) => _onMove(p.target),
      onCameraIdle: _onIdle,
      myLocationEnabled: false,
      myLocationButtonEnabled: false,
      mapToolbarEnabled: false,
      zoomControlsEnabled: false,
      compassEnabled: false,
      padding: const EdgeInsets.only(bottom: 24),
    );
  }

  @override
  Widget build(BuildContext context) {
    final s = Strings.of(context);
    final searching = _searchFocus.hasFocus;
    return Scaffold(
      backgroundColor: AppColors.background,
      body: Column(children: [
        Expanded(
          child: Stack(children: [
            Positioned.fill(child: _buildMap(context)),
            // The pin stays in the centre; its tip marks the spot. It lifts while the map moves.
            IgnorePointer(
              child: Center(
                child: AnimatedSlide(
                  duration: const Duration(milliseconds: 150),
                  offset: Offset(0, _moving ? -0.62 : -0.5),
                  child: const Icon(Icons.location_on_rounded, key: ValueKey('center-pin'), size: 48, color: AppColors.primary),
                ),
              ),
            ),
            IgnorePointer(
              child: Center(
                child: Container(
                  width: _moving ? 6 : 10,
                  height: _moving ? 3 : 5,
                  decoration: BoxDecoration(color: AppColors.ink.withValues(alpha: 0.35), borderRadius: BorderRadius.circular(10)),
                ),
              ),
            ),
            if (searching) Positioned.fill(child: Container(color: AppColors.background)),
            SafeArea(
              bottom: false,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
                child: Column(children: [
                  _searchBar(s, searching),
                  if (searching) Expanded(child: _searchResults(s)),
                ]),
              ),
            ),
            if (!searching)
              Positioned(
                right: 14,
                bottom: 14,
                child: FloatingActionButton.small(
                  key: const ValueKey('picker-my-location'),
                  heroTag: null,
                  backgroundColor: AppColors.surface,
                  foregroundColor: AppColors.primary,
                  tooltip: s.locCurrent,
                  onPressed: _locating ? null : () => _useMyLocation(),
                  child: _locating
                      ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                      : const Icon(Icons.my_location_rounded),
                ),
              ),
          ]),
        ),
        if (!searching) _bottomCard(s),
      ]),
    );
  }

  Widget _searchBar(Strings s, bool searching) => Container(
        decoration: BoxDecoration(color: AppColors.surface, borderRadius: AppRadius.pill, boxShadow: AppShadow.soft),
        child: Row(children: [
          IconButton(
            key: const ValueKey('picker-back'),
            icon: const Icon(Icons.arrow_back_rounded),
            tooltip: MaterialLocalizations.of(context).backButtonTooltip,
            onPressed: () => searching ? _closeSearch() : Navigator.pop(context),
          ),
          Expanded(
            child: TextField(
              key: const ValueKey('picker-search'),
              controller: _search,
              focusNode: _searchFocus,
              onChanged: _onQuery,
              textInputAction: TextInputAction.search,
              decoration: InputDecoration(
                hintText: s.addrMapSearchHint,
                border: InputBorder.none,
                enabledBorder: InputBorder.none,
                focusedBorder: InputBorder.none,
                filled: false,
                isDense: true,
              ),
            ),
          ),
          if (_search.text.isNotEmpty)
            IconButton(icon: const Icon(Icons.close_rounded), tooltip: MaterialLocalizations.of(context).deleteButtonTooltip, onPressed: () {
              _search.clear();
              _onQuery('');
            }),
        ]),
      );

  Widget _searchResults(Strings s) => ListView(padding: const EdgeInsets.only(top: 8), children: [
        ListTile(
          key: const ValueKey('picker-current'),
          leading: const Icon(Icons.my_location_rounded, color: AppColors.primary),
          title: Text(s.locCurrent, style: const TextStyle(fontWeight: FontWeight.w600)),
          onTap: () => _useMyLocation(),
        ),
        const Divider(height: 1),
        for (final sug in _suggestions)
          ListTile(
            key: ValueKey('picker-suggestion-${sug.placeId}'),
            leading: const Icon(Icons.place_outlined),
            title: Text(sug.title, maxLines: 1, overflow: TextOverflow.ellipsis),
            subtitle: sug.subtitle.isEmpty ? null : Text(sug.subtitle, maxLines: 1, overflow: TextOverflow.ellipsis),
            onTap: () => _choose(sug),
          ),
        if (_searched && _suggestions.isEmpty)
          Padding(
            padding: const EdgeInsets.all(20),
            child: Text(s.locNoResults, key: const ValueKey('picker-no-results'), textAlign: TextAlign.center, style: const TextStyle(color: AppColors.muted)),
          ),
      ]);

  Widget _bottomCard(Strings s) {
    final formatted = _place?.formatted;
    return Container(
      key: const ValueKey('picker-card'),
      padding: EdgeInsets.fromLTRB(20, 18, 20, 16 + MediaQuery.of(context).padding.bottom),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(AppRadius.lg)),
        boxShadow: AppShadow.soft,
      ),
      child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(s.locTitle, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 17)),
        const SizedBox(height: 4),
        Row(children: [
          if (_resolving || _moving) ...[
            const SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2)),
            const SizedBox(width: 8),
          ],
          Expanded(
            child: Text(
              _resolving || _moving ? s.locFinding : (_notice ?? formatted ?? s.locMoveMap),
              key: const ValueKey('picker-address'),
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(color: _notice != null ? AppColors.dangerStrong : AppColors.muted, fontSize: 13),
            ),
          ),
        ]),
        const SizedBox(height: 14),
        AppField(
          key: const ValueKey('picker-street'),
          label: s.locStreetLabel,
          hint: s.locStreetHint,
          icon: Icons.home_outlined,
          controller: _street,
          error: _streetErr,
          onChanged: (_) {
            _streetEdited = true;
            if (_streetErr != null) setState(() => _streetErr = null);
          },
        ),
        const SizedBox(height: 14),
        KeyedSubtree(key: const ValueKey('picker-confirm'), child: PrimaryButton(s.locConfirm, onPressed: _confirm)),
      ]),
    );
  }
}
