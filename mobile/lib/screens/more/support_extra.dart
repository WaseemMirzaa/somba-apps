import 'dart:convert';
import 'package:flutter/material.dart';
import '../../l10n/strings.dart';
import '../../widgets/mobile_money.dart';
import '../../util/zone_match.dart';
import '../../util/format.dart';
import '../../services/models.dart';
import '../../data/market_profiles.dart';
import '../../services/places_client.dart';
import '../../services/realtime_store.dart';
import '../../theme/app_theme.dart';
import '../../services/maps_config.dart';
import '../location_picker_screen.dart';
import '../../widgets/kit.dart';
import '../../widgets/common.dart';

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

  AddressDto? get _existing => widget.existing;

  @override
  void initState() {
    super.initState();
    // The zone line follows what is typed.
    _commune.addListener(_refresh);
    _city.addListener(_refresh);
  }

  void _refresh() {
    if (mounted) setState(() {});
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
  }

  Zone? get _zone => zoneForAddress(commune: _commune.text, city: _city.text, zones: activeZones);

  Future<void> _save() async {
    final s = Strings.of(context);
    final phone = _phone.text.trim();
    setState(() {
      // With maps available the exact spot is mandatory: the rider goes to the pin.
      _pinErr = MapsConfig.enabled && _pin == null ? s.addrPinRequired : null;
      _lineErr = streetAddressError(_line1.text, s);
      _cityErr = _city.text.trim().isEmpty ? s.addrErrCity : null;
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
    final zone = _zone;
    final body = <String, dynamic>{
      'label': _label.text.trim().isEmpty ? s.addrLabelDefault : _label.text.trim(),
      'line1': _line1.text.trim(),
      'line2': _landmark.text.trim().isEmpty ? null : _landmark.text.trim(),
      'commune': _commune.text.trim().isEmpty ? null : _commune.text.trim(),
      'city': _city.text.trim(),
      'phone': phone.isEmpty ? null : phone,
      'zoneId': zone?.id,
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
    final zone = _zone;
    final hasCommune = _commune.text.trim().isNotEmpty;
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
        Row(children: [
          Expanded(child: AppField(label: s.addrCommune, hint: s.addrCommuneHint, controller: _commune)),
          const SizedBox(width: 12),
          Expanded(child: AppField(label: s.addrCity, hint: s.addrCityHint, controller: _city, error: _cityErr)),
        ]),
        if (hasCommune) ...[
          const SizedBox(height: 10),
          Row(key: const ValueKey('address-zone'), crossAxisAlignment: CrossAxisAlignment.start, children: [
            Icon(zone != null ? Icons.local_shipping_outlined : Icons.info_outline_rounded,
                size: 18, color: zone != null ? AppColors.success : const Color(0xFFB45309)),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                zone != null ? s.addrZoneOk(zone.deliveryFeeUsd == 0 ? s.free : money(zone.deliveryFeeUsd)) : s.addrZoneNone,
                style: TextStyle(fontSize: 12.5, height: 1.35, color: zone != null ? AppColors.success : const Color(0xFFB45309), fontWeight: FontWeight.w600),
              ),
            ),
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
          child: Text(_busy ? '…' : s.addrSave),
        ),
      ]),
    );
  }
}

/// A support ticket as returned by `support:list` (messages is a JSON array).
class TicketView {
  final String id;
  final String reference;
  final String subject;
  final String status;
  final List<({String from, String role, String text})> messages;

  TicketView({required this.id, required this.reference, required this.subject, required this.status, required this.messages});

  factory TicketView.fromJson(Map<String, dynamic> j) {
    List<dynamic> raw = const [];
    try {
      raw = jsonDecode((j['messages'] as String?) ?? '[]') as List;
    } catch (_) {}
    return TicketView(
      id: j['id'] as String,
      reference: j['reference'] as String? ?? '',
      subject: j['subject'] as String? ?? '',
      status: j['status'] as String? ?? 'open',
      messages: raw
          .map((m) => (from: (m['from'] ?? '').toString(), role: (m['role'] ?? '').toString(), text: (m['text'] ?? '').toString()))
          .toList(),
    );
  }

  Color get color => switch (status) {
        'resolved' || 'closed' => AppColors.success,
        'pending' => AppColors.primary,
        _ => AppColors.amber,
      };
  String labelFor(Strings s) => switch (status) { 'pending' => s.ticketInprogress, 'resolved' => s.ticketResolved, 'closed' => s.ticketClosed, _ => s.ticketOpen };
}

class SupportListScreen extends StatefulWidget {
  final Locale locale;
  const SupportListScreen({super.key, this.locale = const Locale('en')});
  @override
  State<SupportListScreen> createState() => _SupportListScreenState();
}

class _SupportListScreenState extends State<SupportListScreen> {
  late Future<List<TicketView>> _future = _load();

  @override
  void initState() {
    super.initState();
    RealtimeStore.instance.supportRevision.addListener(_onPush);
  }

  @override
  void dispose() {
    RealtimeStore.instance.supportRevision.removeListener(_onPush);
    super.dispose();
  }

  /// Staff replied or changed a ticket: reload the list.
  void _onPush() {
    if (mounted) setState(() => _future = _load());
  }

  Future<List<TicketView>> _load() async => ((await RealtimeStore.instance.call('support:list')) as List)
      .map((e) => TicketView.fromJson((e as Map).map((k, v) => MapEntry(k.toString(), v))))
      .toList();

  Future<void> _newTicket() async {
    final s = Strings.of(context);
    final subject = TextEditingController();
    final message = TextEditingController();
    final created = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (ctx) => Padding(
        padding: EdgeInsets.fromLTRB(20, 20, 20, 20 + MediaQuery.of(ctx).viewInsets.bottom),
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Text(s.ticketNewTitle, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 18, fontFamily: 'PlusJakartaSans')),
          const SizedBox(height: 12),
          TextField(key: const ValueKey('ticket-subject'), controller: subject, decoration: InputDecoration(labelText: s.ticketSubject)),
          const SizedBox(height: 10),
          TextField(key: const ValueKey('ticket-message'), controller: message, maxLines: 4, decoration: InputDecoration(labelText: s.ticketHowHelp)),
          const SizedBox(height: 14),
          FilledButton(
            key: const ValueKey('ticket-submit'),
            onPressed: () async {
              final nav = Navigator.of(ctx);
              final messenger = ScaffoldMessenger.of(context);
              try {
                await RealtimeStore.instance.call('support:open', {'subject': subject.text, 'message': message.text});
                nav.pop(true);
              } catch (e) {
                messenger.showSnackBar(SnackBar(content: Text(Strings.current.errorText(e))));
              }
            },
            child: Text(s.send),
          ),
        ]),
      ),
    );
    if (created == true && mounted) setState(() => _future = _load());
  }

  @override
  Widget build(BuildContext context) {
    final s = Strings.of(context);
    return Scaffold(
      appBar: backAppBar(context, s.support),
      body: FutureBuilder<List<TicketView>>(
        future: _future,
        builder: (context, snap) {
          if (snap.connectionState != ConnectionState.done) return const Center(child: CircularProgressIndicator());
          if (snap.hasError) return Center(child: Text('${snap.error}', style: const TextStyle(color: AppColors.muted)));
          final tickets = snap.data ?? const <TicketView>[];
          return ListView(padding: const EdgeInsets.fromLTRB(16, 8, 16, 24), children: [
            if (tickets.isEmpty) Panel(child: Text(s.ticketNone, style: const TextStyle(color: AppColors.muted))),
            ...tickets.map((t) => Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: GestureDetector(
                  onTap: () async {
                    await Navigator.push(context, MaterialPageRoute(builder: (_) => SupportTicketDetailScreen(ticket: t)));
                    if (mounted) setState(() => _future = _load());
                  },
                  child: Panel(
                    child: Row(children: [
                      Container(
                          height: 44,
                          width: 44,
                          decoration: BoxDecoration(color: t.color.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(12)),
                          child: Icon(Icons.confirmation_number_outlined, color: t.color)),
                      const SizedBox(width: 12),
                      Expanded(
                          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text(t.subject, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
                        Text(t.reference, style: const TextStyle(color: AppColors.muted, fontSize: 12.5)),
                      ])),
                      Pill(t.labelFor(s), color: t.color.withValues(alpha: 0.14), textColor: t.color, fontSize: 10.5),
                    ]),
                  ),
                ))),
            const SizedBox(height: 4),
            PrimaryButton(s.ticketNew, icon: Icons.add_rounded, onPressed: _newTicket),
          ]);
        },
      ),
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
            icon: Icons.support_agent_rounded,
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
        TextButton.icon(
          onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const AccountDeleteScreen())),
          style: TextButton.styleFrom(foregroundColor: AppColors.accentDark),
          icon: const Icon(Icons.delete_outline_rounded, size: 18),
          label: Text(s.deleteMyAccount),
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
              child: Text(_busy ? '…' : s.delaccBtn),
            )),
        const SizedBox(height: 10),
        SizedBox(width: double.infinity, child: OutlinedButton(onPressed: () => Navigator.maybePop(context), child: Text(s.delaccKeep))),
      ]),
    );
  }
}

// Support ticket conversation (loaded from the server; replies are sent live).
class SupportTicketDetailScreen extends StatefulWidget {
  final TicketView ticket;
  const SupportTicketDetailScreen({super.key, required this.ticket});
  @override
  State<SupportTicketDetailScreen> createState() => _SupportTicketDetailScreenState();
}

class _SupportTicketDetailScreenState extends State<SupportTicketDetailScreen> {
  final _ctrl = TextEditingController();
  late TicketView _t = widget.ticket;
  bool _sending = false;

  @override
  void initState() {
    super.initState();
    RealtimeStore.instance.supportRevision.addListener(_onPush);
  }

  /// A staff reply to THIS ticket appears without reopening the screen.
  void _onPush() {
    final j = RealtimeStore.instance.lastSupportTicket;
    if (j == null || j['id'] != _t.id || !mounted) return;
    setState(() => _t = TicketView.fromJson(j));
  }

  @override
  void dispose() {
    RealtimeStore.instance.supportRevision.removeListener(_onPush);
    _ctrl.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    final text = _ctrl.text.trim();
    if (text.isEmpty) return;
    setState(() => _sending = true);
    try {
      final res = await RealtimeStore.instance.call('support:reply', {'id': _t.id, 'text': text});
      _t = TicketView.fromJson((res as Map).map((k, v) => MapEntry(k.toString(), v)));
      _ctrl.clear();
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(Strings.current.errorText(e))));
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = Strings.of(context);
    return Scaffold(
      appBar: backAppBar(context, _t.reference),
      body: Column(children: [
        Container(
          width: double.infinity,
          color: AppColors.surface,
          padding: const EdgeInsets.fromLTRB(16, 4, 16, 14),
          child: Row(children: [
            Expanded(child: Text(_t.subject, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15))),
            Pill(_t.labelFor(s), color: _t.color.withValues(alpha: 0.14), textColor: _t.color, fontSize: 10.5),
          ]),
        ),
        const Divider(height: 1),
        Expanded(
          child: ListView.builder(
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
            itemCount: _t.messages.length,
            itemBuilder: (_, i) {
              final m = _t.messages[i];
              final mine = !m.role.startsWith('admin');
              return Align(
                alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
                child: Container(
                  margin: const EdgeInsets.only(bottom: 10),
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                  constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.72),
                  decoration: BoxDecoration(
                    color: mine ? AppColors.primary : AppColors.surface,
                    borderRadius: BorderRadius.only(
                      topLeft: const Radius.circular(16),
                      topRight: const Radius.circular(16),
                      bottomLeft: Radius.circular(mine ? 16 : 4),
                      bottomRight: Radius.circular(mine ? 4 : 16),
                    ),
                    boxShadow: mine ? null : AppShadow.card,
                  ),
                  child: Text(m.text, style: TextStyle(color: mine ? Colors.white : AppColors.ink, fontSize: 13.5, height: 1.35)),
                ),
              );
            },
          ),
        ),
        SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(12, 8, 12, 10),
            child: Row(children: [
              Expanded(
                child: TextField(
                  controller: _ctrl,
                  onSubmitted: (_) => _send(),
                  decoration: InputDecoration(
                    hintText: s.ticketReplyHint,
                    filled: true,
                    fillColor: AppColors.surface,
                    contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(100), borderSide: const BorderSide(color: AppColors.line)),
                  ),
                ),
              ),
              const SizedBox(width: 8),
              Material(
                color: AppColors.primary,
                shape: const CircleBorder(),
                child: InkWell(
                  customBorder: const CircleBorder(),
                  onTap: _sending ? null : _send,
                  child: const Padding(padding: EdgeInsets.all(13), child: Icon(Icons.send_rounded, color: Colors.white, size: 22)),
                ),
              ),
            ]),
          ),
        ),
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
