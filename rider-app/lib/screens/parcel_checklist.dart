import 'package:flutter/material.dart';
import '../l10n/parcel_strings.dart';
import '../l10n/strings.dart';
import '../services/parcels.dart';
import '../theme/app_theme.dart';

/// "2 of 3 scanned" and the boxes of a leg ("Box 1/3 · scanned · PKG-..."), for one [stage]. Used on the leg cards and in the
/// scanner. [idPrefix] keeps the keys of two checklists on one screen apart.
class ParcelChecklist extends StatelessWidget {
  const ParcelChecklist({super.key, required this.parcels, required this.stage, this.idPrefix = ''});

  final List<ParcelDto> parcels;
  final ParcelStage stage;
  final String idPrefix;

  @override
  Widget build(BuildContext context) {
    final s = Strings.of(context);
    final n = scanCount(parcels, stage);
    final done = n.scanned >= n.total;
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Row(children: [
        Icon(done ? Icons.check_circle_rounded : Icons.qr_code_scanner_rounded, size: 18, color: done ? AppColors.success : AppColors.primary),
        const SizedBox(width: 8),
        Expanded(
          child: Text(
            done ? s.parcelAllDone : s.parcelCounter(n.scanned, n.total),
            key: ValueKey('${idPrefix}parcel-counter'),
            style: TextStyle(fontWeight: FontWeight.w800, fontSize: 13.5, color: done ? AppColors.success : AppColors.ink),
          ),
        ),
      ]),
      const SizedBox(height: 6),
      for (final p in parcels) _row(s, p),
    ]);
  }

  Widget _row(Strings s, ParcelDto p) {
    final ok = p.scanned(stage);
    return Padding(
      key: ValueKey('${idPrefix}parcel-row-${p.code}'),
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Icon(ok ? Icons.check_circle_rounded : Icons.radio_button_unchecked_rounded, size: 18, color: ok ? AppColors.success : AppColors.faint),
        const SizedBox(width: 8),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('${s.parcelBox(p.boxNo, p.boxCount)} · ${ok ? s.parcelDone : s.parcelTodo}',
                style: TextStyle(fontWeight: FontWeight.w700, fontSize: 13, color: ok ? AppColors.success : AppColors.inkSoft)),
            Text(p.code, style: const TextStyle(fontSize: 12.5, color: AppColors.muted, letterSpacing: 0.4)),
          ]),
        ),
      ]),
    );
  }
}
