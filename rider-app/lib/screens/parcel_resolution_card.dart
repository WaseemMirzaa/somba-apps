import 'package:flutter/material.dart';
import '../l10n/parcel_strings.dart';
import '../l10n/strings.dart';
import '../services/parcels.dart';
import '../theme/app_theme.dart';
import 'parcel_checklist.dart';

/// What a scanned box is (`parcels:resolve`): which box of how many, the store and destination area, everything in the box set
/// with its options, the orders and the legs. The street, phone and recipient are drawn only when the server sent them (the
/// rider's own customer delivery or express leg): an absent field is simply not shown, never guessed.
class ParcelResolutionCard extends StatelessWidget {
  const ParcelResolutionCard({super.key, required this.resolution});

  final ParcelResolution resolution;

  @override
  Widget build(BuildContext context) {
    final s = Strings.of(context);
    final r = resolution;
    final d = r.destination;
    final multi = r.orders.length > 1;
    return Container(
      key: ValueKey('parcel-resolved-${r.code}'),
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(color: AppColors.primary.withValues(alpha: 0.06), borderRadius: BorderRadius.circular(14)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text('${s.parcelBox(r.boxNo, r.boxCount)} · ${r.code}', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14, height: 1.3)),
        if (r.voided)
          Padding(
            padding: const EdgeInsets.only(top: 4),
            child: Text(s.parcelResVoided, key: const ValueKey('parcel-resolved-voided'), style: const TextStyle(color: AppColors.danger, fontWeight: FontWeight.w700, fontSize: 13, height: 1.3)),
          ),
        if (r.storeName != null) _line(Icons.storefront_rounded, s.parcelResStore(r.storeName!)),
        if (d.area != null) _line(Icons.place_outlined, s.parcelResArea(d.area!), key: const ValueKey('parcel-resolved-area')),
        if (d.recipient != null) _line(Icons.person_rounded, d.recipient!, key: const ValueKey('parcel-resolved-recipient')),
        if (d.address != null) _line(Icons.location_on_rounded, d.address!, key: const ValueKey('parcel-resolved-address')),
        if (d.phone != null) _line(Icons.phone_rounded, d.phone!, key: const ValueKey('parcel-resolved-phone')),
        if (r.orders.isNotEmpty) ...[
          const SizedBox(height: 8),
          Text(s.parcelResOrders, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 12.5, color: AppColors.muted)),
          const SizedBox(height: 2),
          Text(r.orders.map((o) => o.reference).where((x) => x.isNotEmpty).join(' · '), key: const ValueKey('parcel-resolved-orders'), style: const TextStyle(fontSize: 13.5, height: 1.3)),
        ],
        if (r.contents.isNotEmpty) ...[
          const SizedBox(height: 8),
          Text(s.parcelContentsTitle, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 12.5, color: AppColors.muted)),
          const SizedBox(height: 2),
          ParcelContentsList(contents: r.contents, showOrders: multi, idPrefix: 'resolved-'),
        ],
        if (r.legs.isNotEmpty) ...[
          const SizedBox(height: 8),
          Text(s.parcelResLegs, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 12.5, color: AppColors.muted)),
          const SizedBox(height: 2),
          for (final l in r.legs)
            Padding(
              key: ValueKey('parcel-resolved-leg-${l.id}'),
              padding: const EdgeInsets.symmetric(vertical: 1),
              child: Text('${l.orderReference} · ${_kind(s, l.kind)} · ${_status(s, l.status)}', style: const TextStyle(fontSize: 13, height: 1.3)),
            ),
        ],
      ]),
    );
  }

  static String _kind(Strings s, String k) => s.has('kind_$k') ? s.t('kind_$k') : k.replaceAll('_', ' ');
  static String _status(Strings s, String k) => s.has('task_$k') ? s.t('task_$k') : k.replaceAll('_', ' ');

  Widget _line(IconData icon, String text, {Key? key}) => Padding(
        key: key,
        padding: const EdgeInsets.only(top: 4),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Icon(icon, size: 16, color: AppColors.muted),
          const SizedBox(width: 8),
          Expanded(child: Text(text, style: const TextStyle(fontSize: 13.5, height: 1.3))),
        ]),
      );
}
