import 'package:flutter/material.dart';
import '../../data/repository.dart';
import '../../data/shop_state.dart';
import '../../theme/app_theme.dart';
import '../../l10n/strings.dart';
import '../../widgets/kit.dart';

/// A selectable place in the mock places search.
class _Place {
  final String name;
  final String area;
  final String city;
  final String zone;
  const _Place(this.name, this.area, this.city, this.zone);
}

const _places = [
  _Place('Boulevard du 30 Juin', 'Gombe', 'Kinshasa', 'Gombe'),
  _Place('Marché Central', 'Gombe', 'Kinshasa', 'Gombe'),
  _Place('Limete Industrial Zone', 'Limete', 'Kinshasa', 'Limete'),
  _Place('Rond-Point Ngaba', 'Ngaba', 'Kinshasa', 'Limete'),
  _Place('Université de Kinshasa', 'Lemba', 'Kinshasa', 'Limete'),
  _Place('Avenue du Commerce', 'Gombe', 'Kinshasa', 'Gombe'),
];

/// CF-32a — Uber-style location picker (map + places search + drop pin).
class AddressPickerScreen extends StatefulWidget {
  final Locale locale;
  const AddressPickerScreen({super.key, this.locale = const Locale('en')});
  @override
  State<AddressPickerScreen> createState() => _AddressPickerScreenState();
}

class _AddressPickerScreenState extends State<AddressPickerScreen> with SingleTickerProviderStateMixin {
  final _search = TextEditingController();
  _Place _picked = _places.first;
  Offset _pan = Offset.zero;
  late final AnimationController _pin = AnimationController(vsync: this, duration: const Duration(milliseconds: 400))..forward();

  List<_Place> get _matches {
    final q = _search.text.trim().toLowerCase();
    if (q.isEmpty) return const [];
    return _places.where((p) => p.name.toLowerCase().contains(q) || p.area.toLowerCase().contains(q)).toList();
  }

  @override
  void dispose() {
    _search.dispose();
    _pin.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final matches = _matches;
    final lang = widget.locale.languageCode;
    return Scaffold(
      appBar: backAppBar(context, trl(lang, 'Pick your location')),
      body: Stack(children: [
        // Interactive stylized map.
        Positioned.fill(
          child: GestureDetector(
            onPanUpdate: (d) => setState(() => _pan += d.delta),
            child: CustomPaint(
              painter: _MapPainter(_pan),
              child: const SizedBox.expand(),
            ),
          ),
        ),
        // Center pin (bounces on load / place change).
        Center(
          child: ScaleTransition(
            scale: CurvedAnimation(parent: _pin, curve: Curves.elasticOut),
            alignment: Alignment.bottomCenter,
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                decoration: BoxDecoration(color: AppColors.ink, borderRadius: BorderRadius.circular(100)),
                child: Text(_picked.name, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 12)),
              ),
              const SizedBox(height: 4),
              const Icon(Icons.location_on, color: AppColors.accent, size: 46),
              const SizedBox(height: 26), // offsets the pin tip to true centre
            ]),
          ),
        ),
        // Search field + suggestions.
        Positioned(
          left: 16, right: 16, top: 12,
          child: Column(children: [
            Material(
              elevation: 3,
              borderRadius: BorderRadius.circular(16),
              shadowColor: Colors.black26,
              child: TextField(
                controller: _search,
                onChanged: (_) => setState(() {}),
                decoration: InputDecoration(
                  hintText: trl(lang, 'Search places, streets, areas…'),
                  prefixIcon: const Icon(Icons.search_rounded),
                  suffixIcon: _search.text.isEmpty ? null : IconButton(icon: const Icon(Icons.close_rounded, size: 18), onPressed: () => setState(() => _search.clear())),
                  filled: true, fillColor: AppColors.surface,
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(16), borderSide: BorderSide.none),
                  enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(16), borderSide: BorderSide.none),
                  focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(16), borderSide: const BorderSide(color: AppColors.primary, width: 1.4)),
                ),
              ),
            ),
            if (matches.isNotEmpty)
              Container(
                margin: const EdgeInsets.only(top: 8),
                decoration: BoxDecoration(color: AppColors.surface, borderRadius: BorderRadius.circular(16), boxShadow: AppShadow.card),
                child: Column(children: matches.map((p) => ListTile(
                  leading: const Icon(Icons.place_rounded, color: AppColors.primary),
                  title: Text(p.name, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13.5)),
                  subtitle: Text('${p.area}, ${p.city}', style: const TextStyle(fontSize: 12)),
                  onTap: () => setState(() {
                    _picked = p;
                    _search.clear();
                    _pan = Offset.zero;
                    _pin.forward(from: 0);
                    FocusScope.of(context).unfocus();
                  }),
                )).toList()),
              ),
          ]),
        ),
        // "Use my current location" chip.
        Positioned(
          right: 16, bottom: 120,
          child: Material(
            color: AppColors.surface,
            shape: const CircleBorder(),
            elevation: 3,
            child: InkWell(
              customBorder: const CircleBorder(),
              onTap: () => setState(() {
                _picked = _places.first;
                _pan = Offset.zero;
                _pin.forward(from: 0);
                ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(trl(widget.locale.languageCode, 'Centred on your current location'))));
              }),
              child: const Padding(padding: EdgeInsets.all(12), child: Icon(Icons.my_location_rounded, color: AppColors.primary)),
            ),
          ),
        ),
      ]),
      bottomNavigationBar: Container(
        padding: EdgeInsets.fromLTRB(16, 14, 16, 12 + MediaQuery.of(context).padding.bottom),
        decoration: const BoxDecoration(color: AppColors.surface, boxShadow: [BoxShadow(color: Colors.black12, blurRadius: 16, offset: Offset(0, -4))]),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Row(children: [
            const Icon(Icons.location_on_rounded, color: AppColors.primary, size: 20),
            const SizedBox(width: 8),
            Expanded(child: Text('${_picked.name}, ${_picked.area}', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13.5))),
          ]),
          const SizedBox(height: 12),
          PrimaryButton(trl(lang, 'Confirm location'), icon: Icons.arrow_forward_rounded, onPressed: () async {
            final nav = Navigator.of(context);
            await nav.push(MaterialPageRoute(builder: (_) => AddressFormScreen(
              locale: widget.locale,
              address: '${_picked.name}, ${_picked.area}',
              city: _picked.city,
              zone: _picked.zone,
            )));
            if (mounted) nav.pop();
          }),
        ]),
      ),
    );
  }
}

class _MapPainter extends CustomPainter {
  final Offset pan;
  _MapPainter(this.pan);

  @override
  void paint(Canvas canvas, Size size) {
    // Land background.
    canvas.drawRect(Offset.zero & size, Paint()..color = const Color(0xFFEAEEF3));

    // A river band for character.
    final river = Paint()..color = const Color(0xFFBFD6E8)..style = PaintingStyle.stroke..strokeWidth = 28..strokeCap = StrokeCap.round;
    final rp = Path()
      ..moveTo(-40 + pan.dx % 80, size.height * 0.72 + pan.dy % 60)
      ..quadraticBezierTo(size.width * 0.4, size.height * 0.6, size.width + 40, size.height * 0.85);
    canvas.drawPath(rp, river);

    // Street grid (pans with gesture, wraps).
    final major = Paint()..color = Colors.white..strokeWidth = 8;
    final minor = Paint()..color = const Color(0xFFF6F8FB)..strokeWidth = 3;
    const step = 68.0;
    final ox = pan.dx % step;
    final oy = pan.dy % step;
    for (double x = ox - step; x < size.width + step; x += step) {
      canvas.drawLine(Offset(x, 0), Offset(x, size.height), (x / step).round().isEven ? major : minor);
    }
    for (double y = oy - step; y < size.height + step; y += step) {
      canvas.drawLine(Offset(0, y), Offset(size.width, y), (y / step).round().isEven ? major : minor);
    }

    // A few "building blocks".
    final block = Paint()..color = const Color(0xFFDDE3EC);
    for (double x = ox; x < size.width; x += step * 2) {
      for (double y = oy; y < size.height; y += step * 2) {
        canvas.drawRRect(RRect.fromRectAndRadius(Rect.fromLTWH(x + 8, y + 8, step - 20, step - 20), const Radius.circular(4)), block);
      }
    }
  }

  @override
  bool shouldRepaint(covariant _MapPainter old) => old.pan != pan;
}

/// CF-32b — Address details form. Saves into the account address book.
class AddressFormScreen extends StatefulWidget {
  final Locale locale;
  final String? editingId;
  final String? label;
  final String? name;
  final String? phone;
  final String? address;
  final String? city;
  final String? zone;
  const AddressFormScreen({
    super.key,
    this.locale = const Locale('en'),
    this.editingId,
    this.label,
    this.name,
    this.phone,
    this.address,
    this.city,
    this.zone,
  });
  @override
  State<AddressFormScreen> createState() => _AddressFormScreenState();
}

class _AddressFormScreenState extends State<AddressFormScreen> {
  late final _label = TextEditingController(text: widget.label);
  late final _name = TextEditingController(text: widget.name ?? 'Marie Dubois');
  late final _phone = TextEditingController(text: widget.phone ?? '+243 970 000 000');
  late final _address = TextEditingController(text: widget.address);
  late final _city = TextEditingController(text: widget.city ?? 'Kinshasa');
  late final _zone = TextEditingController(text: widget.zone ?? 'Gombe');
  bool _default = false;

  bool get _editing => widget.editingId != null;

  @override
  void dispose() {
    for (final c in [_label, _name, _phone, _address, _city, _zone]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _save() async {
    if (_address.text.trim().isEmpty || _name.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(trl(widget.locale.languageCode, 'Please add a name and street address'))));
      return;
    }
    final shop = ShopState.instance;
    final label = _label.text.trim().isEmpty ? 'Home' : _label.text.trim();
    if (_editing) {
      final a = shop.addresses.firstWhere((x) => x.id == widget.editingId);
      a
        ..label = label
        ..name = _name.text.trim()
        ..phone = _phone.text.trim()
        ..line = _address.text.trim()
        ..city = _city.text.trim()
        ..zone = _zone.text.trim();
      if (_default) {
        for (final x in shop.addresses) {
          x.isDefault = false;
        }
        a.isDefault = true;
      }
    } else {
      final makeDefault = _default || shop.addresses.isEmpty;
      // Persist to the backend when signed in; use the server id so checkout
      // and future edits reference the same record.
      final created = await Repo.instance.createAddress({
        'label': label,
        'name': _name.text.trim(),
        'phone': _phone.text.trim(),
        'line': _address.text.trim(),
        'city': _city.text.trim(),
        'zone': _zone.text.trim(),
        'isDefault': makeDefault,
      });
      shop.addAddress(CustomerAddress(
        id: created?['id']?.toString() ?? shop.nextAddressId(),
        label: label,
        name: _name.text.trim(),
        phone: _phone.text.trim(),
        line: _address.text.trim(),
        city: _city.text.trim(),
        zone: _zone.text.trim(),
        isDefault: makeDefault,
      ));
    }
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(_editing ? 'Address updated' : 'Address saved')));
    Navigator.maybePop(context);
  }

  @override
  Widget build(BuildContext context) {
    final lang = widget.locale.languageCode;
    return Scaffold(
      appBar: backAppBar(context, _editing ? trl(lang, 'Edit address') : trl(lang, 'Address details')),
      body: ListView(padding: const EdgeInsets.fromLTRB(20, 12, 20, 24), children: [
        if (widget.address != null && !_editing)
          Container(
            padding: const EdgeInsets.all(12),
            margin: const EdgeInsets.only(bottom: 16),
            decoration: BoxDecoration(color: AppColors.primary.withValues(alpha: 0.08), borderRadius: BorderRadius.circular(14)),
            child: Row(children: [
              const Icon(Icons.map_rounded, color: AppColors.primary, size: 20),
              const SizedBox(width: 10),
              Expanded(child: Text('${trl(lang, 'Pinned')}: ${widget.address}', style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 12.5))),
            ]),
          ),
        _labelled(trl(lang, 'Label'), _label, hint: 'Home, Work…', icon: Icons.bookmark_outline_rounded),
        const SizedBox(height: 16),
        _labelled(trl(lang, 'Full name'), _name, icon: Icons.person_outline_rounded),
        const SizedBox(height: 16),
        _labelled(trl(lang, 'Phone'), _phone, keyboard: TextInputType.phone, icon: Icons.phone_outlined),
        const SizedBox(height: 16),
        _labelled(trl(lang, 'Street address'), _address, hint: '12 Commerce Ave', icon: Icons.location_on_outlined),
        const SizedBox(height: 16),
        Row(children: [
          Expanded(child: _labelled(trl(lang, 'City'), _city)),
          const SizedBox(width: 12),
          Expanded(child: _labelled(trl(lang, 'Zone'), _zone)),
        ]),
        const SizedBox(height: 16),
        GestureDetector(
          onTap: () => setState(() => _default = !_default),
          child: Row(children: [
            Icon(_default ? Icons.check_box_rounded : Icons.check_box_outline_blank_rounded, color: AppColors.primary, size: 22),
            const SizedBox(width: 8),
            Text(trl(lang, 'Set as default address'), style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13.5)),
          ]),
        ),
        const SizedBox(height: 20),
        PrimaryButton(_editing ? trl(lang, 'Update address') : trl(lang, 'Save address'), icon: Icons.save_rounded, onPressed: _save),
      ]),
    );
  }

  Widget _labelled(String label, TextEditingController c, {String hint = '', IconData? icon, TextInputType? keyboard}) {
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(label, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13, color: AppColors.inkSoft)),
      const SizedBox(height: 6),
      TextField(
        controller: c,
        keyboardType: keyboard,
        decoration: InputDecoration(hintText: hint, prefixIcon: icon != null ? Icon(icon, size: 20) : null),
      ),
    ]);
  }
}
