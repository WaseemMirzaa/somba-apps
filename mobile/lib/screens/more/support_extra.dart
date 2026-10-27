import 'dart:async';
import 'package:flutter/material.dart';
import '../../l10n/strings.dart';
import '../../widgets/mobile_money.dart';
import '../../widgets/feedback.dart';
import '../../services/area_selection.dart';
import '../../services/auth_service.dart' show ApiException;
import '../../services/geo_directory.dart';
import '../../services/geo_models.dart';
import '../../services/models.dart';
import '../../services/places_client.dart';
import '../../services/realtime_store.dart';
import '../../theme/app_theme.dart';
import '../../services/maps_config.dart';
import '../location_picker_screen.dart';
import '../../widgets/kit.dart';
import '../../widgets/common.dart';
import 'area_picker.dart';

// The ticket screens (list, detail, new ticket) live in support_screens.dart; imports of this file still see them.
import 'support_screens.dart';
export 'support_screens.dart';

/// Add or edit a delivery address (saved on the server, encrypted at rest). With [existing] it edits that address.
class AddressFormScreen extends StatefulWidget {
  final Locale locale;
  final AddressDto? existing;

  /// Tests: the picker's Places client and map (the native map cannot run in tests).
  final PlacesClient? placesClient;
  final PickerMapBuilder? mapBuilder;
  const AddressFormScreen({super.key, this.locale = const Locale('en'), this.existing, this.placesClient, this.mapBuilder});
  @override
  State<AddressFormScreen> createState() => _AddressFormScreenState();
}

class _AddressFormScreenState extends State<AddressFormScreen> {
  final _label = TextEditingController();
  final _phone = TextEditingController();
  final _line1 = TextEditingController();
  final _landmark = TextEditingController();
  final _commune = TextEditingController();
  final _city = TextEditingController();
  bool _seeded = false;
  PickedPlace? _pick;
  bool _pinCleared = false;
  bool _default = false;
  bool _busy = false;
  String? _lineErr, _cityErr, _phoneErr, _pinErr;

  /// The delivery area (province > city > commune > quartier): filled from the pin, corrected with the pickers.
  final _sel = AreaSelection();

  /// The geography loaded: the pickers replace the typed city and commune. Off for an older server (typed fields only).
  bool _areaMode = false;

  /// The picker level whose areas are being fetched, and whether the pin is being matched to an area.
  String? _areaBusy;
  bool _resolving = false;
  int _resolveSeq = 0;

  AddressDto? get _existing => widget.existing;

  /// The typed city and commune fields are shown: no geography on the server, or the pin matched no area.
  bool get _showTyped => !_areaMode || (_sel.typed && _sel.city == null);

  @override
  void initState() {
    super.initState();
    final e = _existing;
    if (e != null) {
      if (e.areaChain.isNotEmpty) {
        _sel.setChain(e.areaChain);
      } else {
        _sel.typed = true; // an address saved before areas: its typed city and commune stand until an area is chosen
      }
    }
    final cached = GeoDirectory.instance.cached(null);
    _areaMode = cached != null && cached.isNotEmpty;
    if (!_areaMode) unawaited(_loadAreas());
  }

  /// Is there a geography on this server? A quiet probe: an older server simply keeps the typed fields.
  Future<void> _loadAreas() async {
    try {
      final provinces = await GeoDirectory.instance.provinces();
      if (mounted && provinces.isNotEmpty) setState(() => _areaMode = true);
    } catch (_) {/* older server: typed fields */}
  }

  @override
  void dispose() {
    for (final c in [_label, _phone, _line1, _landmark, _commune, _city]) {
      c.dispose();
    }
    super.dispose();
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_seeded) return;
    _seeded = true;
    final s = Strings.of(context);
    final e = _existing;
    if (e != null) {
      _label.text = e.label;
      _phone.text = e.phone ?? '';
      _line1.text = e.line1;
      _landmark.text = e.line2 ?? '';
      _commune.text = e.commune ?? '';
      _city.text = e.city;
      _default = e.isDefault;
    } else {
      _label.text = s.addrLabelDefault;
      _city.text = s.addrCityHint;
      _phone.text = RealtimeStore.instance.user?.phone ?? '';
    }
  }

  /// The pin to save: the one just picked, else the address's own (when editing).
  ({double lat, double lng, String? formatted})? get _pin {
    final p = _pick;
    if (p != null) return (lat: p.lat, lng: p.lng, formatted: p.formatted);
    final g = _pinCleared ? null : _existing?.geo;
    return g == null ? null : (lat: g.lat, lng: g.lng, formatted: g.formatted);
  }

  Future<void> _openPicker() async {
    final pin = _pin;
    final picked = await Navigator.push<PickedPlace>(
      context,
      MaterialPageRoute(
        builder: (_) => LocationPickerScreen(
          initialPin: pin == null ? null : (lat: pin.lat, lng: pin.lng),
          initialStreet: _line1.text,
          client: widget.placesClient,
          mapBuilder: widget.mapBuilder,
          locateOnOpen: widget.mapBuilder == null,
        ),
      ),
    );
    if (picked != null && mounted) _applyPick(picked);
  }

  /// A map pick pre-fills the typed fields (still editable) and keeps the pin for saving.
  void _applyPick(PickedPlace p) {
    setState(() {
      _pick = p;
      _pinCleared = false;
      _lineErr = null;
      _cityErr = null;
      _pinErr = null;
    });
    if ((p.parts.line1 ?? '').isNotEmpty) _line1.text = p.parts.line1!;
    if ((p.parts.commune ?? '').isNotEmpty) _commune.text = p.parts.commune!;
    if ((p.parts.city ?? '').isNotEmpty) _city.text = p.parts.city!;
    if (_areaMode) unawaited(_resolveArea(p));
  }

  /// Which delivery area the pin falls in: the server matches Google's address components (in either language).
  Future<void> _resolveArea(PickedPlace p) async {
    final seq = ++_resolveSeq;
    setState(() => _resolving = true);
    try {
      final r = await GeoDirectory.instance.resolve(
        components: p.components,
        text: {
          if ((p.parts.commune ?? '').isNotEmpty) 'commune': p.parts.commune!,
          if ((p.parts.city ?? '').isNotEmpty) 'city': p.parts.city!,
          if ((p.parts.region ?? '').isNotEmpty) 'province': p.parts.region!,
        },
        pin: (lat: p.lat, lng: p.lng),
      );
      if (!mounted || seq != _resolveSeq) return;
      setState(() {
        if (r != null && r.found) {
          _sel.setResolution(r);
        } else {
          _sel
            ..clear()
            ..typed = true;
        }
        _cityErr = null;
      });
    } catch (e) {
      if (!mounted || seq != _resolveSeq) return;
      // The pin is kept; the areas can be chosen by hand.
      setState(() => _sel.typed = _sel.isEmpty);
      showSnack(context, e is ApiException ? e.toString() : Strings.of(context).areaLoadFailed);
    } finally {
      if (mounted && seq == _resolveSeq) setState(() => _resolving = false);
    }
  }

  AreaDto? _chosen(String level) => switch (level) {
        AreaLevel.province => _sel.province,
        AreaLevel.city => _sel.city,
        AreaLevel.quartier => _sel.quartier,
        _ => _sel.commune,
      };

  /// The areas a picker offers for [level], under what is already chosen above it.
  Future<List<AreaOption>> _optionsFor(String level) async {
    final dir = GeoDirectory.instance;
    switch (level) {
      case AreaLevel.province:
        return [for (final a in await dir.provinces()) (area: a, group: null)];
      case AreaLevel.city:
        return [for (final a in await dir.children(_sel.province!.id)) if (a.level == AreaLevel.city) (area: a, group: null)];
      case AreaLevel.commune:
        return [for (final c in await dir.communesOf(_sel.city!)) (area: c.area, group: c.district)];
      default:
        return [for (final a in await dir.children(_sel.commune!.id)) (area: a, group: null)];
    }
  }

  Future<void> _pickArea(String level) async {
    if (_areaBusy != null) return;
    setState(() => _areaBusy = level);
    final List<AreaOption> options;
    try {
      options = await _optionsFor(level);
    } catch (e) {
      if (mounted) {
        setState(() => _areaBusy = null);
        showSnack(context, e is ApiException ? e.toString() : Strings.of(context).areaLoadFailed);
      }
      return;
    }
    if (!mounted) return;
    setState(() => _areaBusy = null);
    final chosen = await showAreaSheet(context, level: level, options: options, selected: _chosen(level));
    if (chosen == null || !mounted) return;
    setState(() {
      _sel.choose(chosen.area, district: chosen.group);
      _cityErr = null;
    });
    if (level == AreaLevel.province) unawaited(_autoCity());
  }

  /// A province with a single city (Kinshasa is both) needs no second tap.
  Future<void> _autoCity() async {
    final province = _sel.province;
    if (province == null) return;
    try {
      final cities = (await GeoDirectory.instance.children(province.id)).where((a) => a.level == AreaLevel.city).toList();
      if (!mounted || _sel.province?.id != province.id || _sel.city != null) return;
      if (cities.length == 1 && cities.single.selectable) setState(() => _sel.choose(cities.single));
    } catch (_) {/* the city picker fetches, and reports, again */}
  }

  Future<void> _save() async {
    final s = Strings.of(context);
    final phone = _phone.text.trim();
    setState(() {
      // With maps available the exact spot is mandatory: the rider goes to the pin.
      _pinErr = MapsConfig.enabled && _pin == null ? s.addrPinRequired : null;
      _lineErr = streetAddressError(_line1.text, s);
      _cityErr = (_showTyped ? _city.text.trim().isEmpty : _sel.city == null) ? s.addrErrCity : null;
      _phoneErr = phone.isEmpty ? null : validateMobileNumber(phone, s);
    });
    final messenger = ScaffoldMessenger.of(context);
    if (_pinErr != null || _lineErr != null || _cityErr != null || _phoneErr != null) {
      messenger
        ..hideCurrentSnackBar()
        ..showSnackBar(SnackBar(content: Text(_pinErr ?? _lineErr ?? _cityErr ?? _phoneErr!)));
      return;
    }
    setState(() => _busy = true);
    // Picked areas travel with the address (`areaId`) and are also written as text, in Google's spelling.
    final picked = !_showTyped;
    final communeArea = _sel.commune ?? _sel.quartier;
    final body = <String, dynamic>{
      'label': _label.text.trim().isEmpty ? s.addrLabelDefault : _label.text.trim(),
      'line1': _line1.text.trim(),
      'line2': _landmark.text.trim().isEmpty ? null : _landmark.text.trim(),
      'commune': picked ? communeArea?.googleName : (_commune.text.trim().isEmpty ? null : _commune.text.trim()),
      'city': picked ? _sel.city!.googleName : _city.text.trim(),
      if (picked && _sel.province != null) 'region': _sel.province!.googleName,
      if (picked && _sel.areaId != null) 'areaId': _sel.areaId,
      'phone': phone.isEmpty ? null : phone,
      if (_default) 'isDefault': true,
      if (_pick != null) 'geo': _pick!.toGeoJson() else if (_pinCleared) 'geo': null,
    };
    try {
      final e = _existing;
      if (e == null) {
        await RealtimeStore.instance.addAddress(body);
      } else {
        await RealtimeStore.instance.updateAddress(e.id, body);
      }
      if (!mounted) return;
      messenger.showSnackBar(SnackBar(content: Text(e == null ? s.addrSaved : s.addrUpdated)));
      Navigator.pop(context);
    } catch (err) {
      if (mounted) setState(() => _busy = false);
      messenger.showSnackBar(SnackBar(content: Text(Strings.current.errorText(err))));
    }
  }

  /// Province > city > commune > quartier pickers, then what the server says about the chosen area.
  Widget _areaSection(Strings s) {
    final city = _sel.city, commune = _sel.commune;
    return Column(key: const ValueKey('area-section'), crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(s.areaTitle, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
      const SizedBox(height: 10),
      AreaPickerField(
          key: const ValueKey('area-field-province'),
          level: AreaLevel.province,
          value: _sel.province,
          busy: _areaBusy == AreaLevel.province,
          onTap: () => _pickArea(AreaLevel.province)),
      const SizedBox(height: 12),
      AreaPickerField(
          key: const ValueKey('area-field-city'),
          level: AreaLevel.city,
          value: city,
          busy: _areaBusy == AreaLevel.city,
          error: _showTyped ? null : _cityErr,
          onTap: _sel.province == null ? null : () => _pickArea(AreaLevel.city)),
      if (city != null && city.hasChildren) ...[
        const SizedBox(height: 12),
        AreaPickerField(
            key: const ValueKey('area-field-commune'),
            level: AreaLevel.commune,
            value: commune,
            busy: _areaBusy == AreaLevel.commune,
            onTap: () => _pickArea(AreaLevel.commune)),
      ],
      if (commune != null && commune.hasChildren) ...[
        const SizedBox(height: 12),
        AreaPickerField(
            key: const ValueKey('area-field-quartier'),
            level: AreaLevel.quartier,
            value: _sel.quartier,
            busy: _areaBusy == AreaLevel.quartier,
            onTap: () => _pickArea(AreaLevel.quartier)),
      ],
      _areaNotice(s),
    ]);
  }

  Widget _areaNotice(Strings s) {
    final deepest = _sel.deepest;
    Widget line(String key, String text, {Color color = AppColors.muted, FontWeight weight = FontWeight.w500}) => Padding(
          padding: const EdgeInsets.only(top: 8, left: 2),
          child: Text(text, key: ValueKey(key), style: TextStyle(color: color, fontSize: 12.5, fontWeight: weight, height: 1.35)),
        );
    if (_resolving) {
      return const Padding(
        key: ValueKey('area-resolving'),
        padding: EdgeInsets.only(top: 10),
        child: SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2)),
      );
    }
    if (deepest == null) return _sel.typed && _pick != null ? line('area-no-match', s.areaNoMatch) : const SizedBox.shrink();
    if (_sel.needsMoreDetail) return line('area-partial', s.areaPartialHint(deepest.nameFor(s.lang)));
    if (_sel.notServed) {
      return Container(
        key: const ValueKey('area-not-served'),
        margin: const EdgeInsets.only(top: 10),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(color: AppColors.dangerSoft, borderRadius: BorderRadius.circular(12)),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(s.areaNotServed(deepest.nameFor(s.lang)),
              style: const TextStyle(color: AppColors.dangerStrong, fontSize: 12.5, fontWeight: FontWeight.w700, height: 1.35)),
          const SizedBox(height: 2),
          Text(s.areaNotServedSave, style: const TextStyle(color: AppColors.dangerStrong, fontSize: 12.5, height: 1.35)),
        ]),
      );
    }
    final hub = _sel.hubName;
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      if (hub != null) line('area-hub', s.checkoutFromHub(hub), color: AppColors.success, weight: FontWeight.w600),
      if (_sel.fromPin) line('area-from-pin', s.areaFromPin),
    ]);
  }

  /// Without a Maps key: a notice, and the address is typed by hand. With one: the card that opens the picker.
  Widget _pinCard(Strings s) {
    if (!MapsConfig.enabled) {
      return Container(
        key: const ValueKey('map-unavailable'),
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(color: const Color(0xFFFFFBEB), borderRadius: BorderRadius.circular(14), border: Border.all(color: const Color(0xFFFDE68A))),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Icon(Icons.location_off_outlined, size: 20, color: Color(0xFF92400E)),
          const SizedBox(width: 10),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(s.addrMapUnavailable, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13.5, color: Color(0xFF92400E))),
              const SizedBox(height: 2),
              Text(s.addrMapTypeBelow, style: const TextStyle(fontSize: 12.5, color: Color(0xFF92400E))),
            ]),
          ),
        ]),
      );
    }
    final pin = _pin;
    final err = _pinErr;
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Material(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(16),
        child: InkWell(
          key: const ValueKey('pick-location'),
          borderRadius: BorderRadius.circular(16),
          onTap: _openPicker,
          child: Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: err != null ? AppColors.dangerStrong : AppColors.line, width: err != null ? 1.5 : 1),
            ),
            child: Row(children: [
              Container(
                height: 44,
                width: 44,
                decoration: BoxDecoration(color: AppColors.primary.withValues(alpha: 0.10), borderRadius: BorderRadius.circular(12)),
                child: Icon(pin == null ? Icons.add_location_alt_outlined : Icons.location_on_rounded, color: AppColors.primary),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(pin == null ? s.addrPinCta : s.addrMapPinnedBadge, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
                  const SizedBox(height: 2),
                  Text(
                    pin == null ? s.addrPinCtaHint : (pin.formatted ?? '${pin.lat.toStringAsFixed(5)}, ${pin.lng.toStringAsFixed(5)}'),
                    key: const ValueKey('pin-summary'),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(color: AppColors.muted, fontSize: 12.5),
                  ),
                ]),
              ),
              Text(pin == null ? '' : s.change, style: const TextStyle(color: AppColors.primary, fontWeight: FontWeight.w700, fontSize: 13)),
              const Icon(Icons.chevron_right_rounded, color: AppColors.faint),
            ]),
          ),
        ),
      ),
      if (err != null)
        Padding(
          padding: const EdgeInsets.only(top: 6, left: 4),
          child: Text(err, key: const ValueKey('pin-error'), style: const TextStyle(color: AppColors.dangerStrong, fontSize: 12.5, fontWeight: FontWeight.w600)),
        ),
    ]);
  }

  @override
  Widget build(BuildContext context) {
    final s = Strings.of(context);
    return Scaffold(
      appBar: backAppBar(context, _existing == null ? s.addrTitle : s.addrEditTitle),
      body: ListView(padding: const EdgeInsets.fromLTRB(20, 12, 20, 24), children: [
        _pinCard(s),
        const SizedBox(height: 16),
        AppField(label: s.addrLabel, hint: s.addrLabelHint, icon: Icons.bookmark_outline_rounded, controller: _label),
        const SizedBox(height: 16),
        AppField(
            label: s.addrPhone,
            hint: '+243 81 234 5678',
            icon: Icons.phone_outlined,
            keyboard: TextInputType.phone,
            controller: _phone,
            error: _phoneErr),
        const SizedBox(height: 16),
        AppField(label: s.addrStreet, hint: s.addrStreetHint, icon: Icons.location_on_outlined, controller: _line1, error: _lineErr),
        const SizedBox(height: 16),
        AppField(
            key: const ValueKey('address-landmark'),
            label: s.addrLandmark,
            hint: s.addrLandmarkHint,
            icon: Icons.signpost_outlined,
            controller: _landmark),
        const SizedBox(height: 16),
        if (_areaMode) _areaSection(s),
        if (_showTyped) ...[
          if (_areaMode) const SizedBox(height: 16),
          Row(children: [
            Expanded(child: AppField(label: s.addrCommune, hint: s.addrCommuneHint, controller: _commune)),
            const SizedBox(width: 12),
            Expanded(child: AppField(label: s.addrCity, hint: s.addrCityHint, controller: _city, error: _cityErr)),
          ]),
        ],
        const SizedBox(height: 16),
        CheckboxListTile(
          contentPadding: EdgeInsets.zero,
          controlAffinity: ListTileControlAffinity.leading,
          value: _default,
          onChanged: (v) => setState(() => _default = v ?? false),
          title: Text(s.addrDefault, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13.5)),
        ),
        const SizedBox(height: 12),
        FilledButton(
          key: const ValueKey('save-address'),
          onPressed: _busy ? null : _save,
          child: _busy ? const ButtonSpinner() : Text(s.addrSave),
        ),
      ]),
    );
  }
}

class HelpScreen extends StatelessWidget {
  final Locale locale;
  const HelpScreen({super.key, this.locale = const Locale('en')});
  @override
  Widget build(BuildContext context) {
    final s = Strings.of(context);
    final faqs = [
      (s.faqTrackQ, s.faqTrackA),
      (s.faqPayQ, s.faqPayA),
      (s.faqFeesQ, s.faqFeesA),
      (s.faqFailedQ, s.faqFailedA),
      (s.faqContactQ, s.faqContactA),
    ];
    return Scaffold(
      appBar: backAppBar(context, s.help),
      body: ListView(padding: const EdgeInsets.fromLTRB(16, 8, 16, 24), children: [
        PrimaryButton(s.contactSupport,
            onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => SupportListScreen(locale: locale)))),
        SectionHeader(s.faqs, padding: EdgeInsets.fromLTRB(4, 22, 4, 10)),
        Panel(
            padding: EdgeInsets.zero,
            child: Column(children: [
              for (int i = 0; i < faqs.length; i++) ...[
                ExpansionTile(
                  shape: const Border(),
                  collapsedShape: const Border(),
                  tilePadding: const EdgeInsets.symmetric(horizontal: 16),
                  title: Text(faqs[i].$1, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13.5)),
                  childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 14),
                  expandedCrossAxisAlignment: CrossAxisAlignment.start,
                  children: [Text(faqs[i].$2, style: const TextStyle(color: AppColors.muted, fontSize: 13, height: 1.4))],
                ),
                if (i != faqs.length - 1) const Divider(height: 1),
              ],
            ])),
        const SizedBox(height: 16),
        TextButton(
          onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const AccountDeleteScreen())),
          style: TextButton.styleFrom(foregroundColor: AppColors.accentDark),
          child: Text(s.deleteMyAccount),
        ),
      ]),
    );
  }
}

/// Permanently erases the account (the server checks the password).
class AccountDeleteScreen extends StatefulWidget {
  /// Called after the account is deleted (returns the app to sign-in).
  final VoidCallback? onDeleted;
  const AccountDeleteScreen({super.key, this.onDeleted});
  @override
  State<AccountDeleteScreen> createState() => _AccountDeleteScreenState();
}

class _AccountDeleteScreenState extends State<AccountDeleteScreen> {
  final _pw = TextEditingController();
  bool _busy = false;
  String? _err;

  @override
  void dispose() {
    _pw.dispose();
    super.dispose();
  }

  Future<void> _delete() async {
    if (_pw.text.isEmpty) {
      setState(() => _err = Strings.of(context).delaccEnterPw);
      return;
    }
    setState(() {
      _busy = true;
      _err = null;
    });
    try {
      await RealtimeStore.instance.deleteAccount(_pw.text);
      if (!mounted) return;
      Navigator.of(context).popUntil((r) => r.isFirst);
      widget.onDeleted?.call();
    } catch (e) {
      if (mounted) {
        setState(() {
          _busy = false;
          _err = Strings.current.errorText(e);
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = Strings.of(context);
    return Scaffold(
      appBar: backAppBar(context, s.delaccTitle),
      body: ListView(padding: const EdgeInsets.fromLTRB(16, 8, 16, 24), children: [
        Container(
          padding: const EdgeInsets.all(18),
          decoration: BoxDecoration(color: AppColors.accent.withValues(alpha: 0.10), borderRadius: BorderRadius.circular(20)),
          child: Column(children: [
            const Icon(Icons.warning_amber_rounded, color: AppColors.accentDark, size: 40),
            const SizedBox(height: 10),
            Text(s.delaccPermanent, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16, color: AppColors.accentDark)),
            const SizedBox(height: 6),
            Text(s.delaccPermanentBody,
                textAlign: TextAlign.center, style: const TextStyle(color: Color(0xFF7F1D1D), fontSize: 13, height: 1.4)),
          ]),
        ),
        const SizedBox(height: 16),
        Panel(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(s.delaccBefore, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14.5)),
          const SizedBox(height: 10),
          _Bullet(s.delaccB1),
          _Bullet(s.delaccB2),
          _Bullet(s.delaccB3),
        ])),
        const SizedBox(height: 16),
        AppField(label: s.delaccConfirmPw, obscure: true, icon: Icons.lock_outline_rounded, controller: _pw, error: _err),
        const SizedBox(height: 20),
        SizedBox(
            width: double.infinity,
            child: FilledButton(
              key: const ValueKey('delete-account'),
              style: FilledButton.styleFrom(backgroundColor: AppColors.accentDark),
              onPressed: _busy ? null : _delete,
              child: _busy ? const ButtonSpinner() : Text(s.delaccBtn),
            )),
        const SizedBox(height: 10),
        SizedBox(width: double.infinity, child: OutlinedButton(onPressed: () => Navigator.maybePop(context), child: Text(s.delaccKeep))),
      ]),
    );
  }
}

class _Bullet extends StatelessWidget {
  final String text;
  const _Bullet(this.text);
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Icon(Icons.remove_rounded, size: 16, color: AppColors.muted),
          const SizedBox(width: 8),
          Expanded(child: Text(text, style: const TextStyle(fontSize: 13, color: AppColors.inkSoft))),
        ]),
      );
}
