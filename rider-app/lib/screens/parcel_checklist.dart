import 'package:flutter/material.dart';
import '../l10n/parcel_strings.dart';
import '../l10n/strings.dart';
import '../services/parcels.dart';
import '../theme/app_theme.dart';

/// "2 of 3 scanned" and the boxes of a leg or stop ("Box 1/3 · scanned · PKG-..."), for one [stage], then what is in them
/// ([contents]: every product with its quantity and size/options; each line names its order when [showOrders]). Used on the leg
/// cards and in the scanner. [idPrefix] keeps the keys of two checklists on one screen apart.
class ParcelChecklist extends StatelessWidget {
  const ParcelChecklist({super.key, required this.parcels, required this.stage, this.idPrefix = '', this.contents = const [], this.showOrders = false});

  final List<ParcelDto> parcels;
  final ParcelStage stage;
  final String idPrefix;
  final List<ParcelContent> contents;
  final bool showOrders;

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
      if (contents.isNotEmpty) ...[
        const SizedBox(height: 8),
        Text(s.parcelContentsTitle, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 12.5, color: AppColors.muted)),
        const SizedBox(height: 4),
        ParcelContentsList(contents: contents, showOrders: showOrders, idPrefix: idPrefix),
      ],
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

/// The products in a box set, one line each: "2× Phone (128 GB / Black)" in the rider's language, with the order it belongs to
/// when the set serves several ([showOrders]). Lines wrap; nothing is cut.
class ParcelContentsList extends StatelessWidget {
  const ParcelContentsList({super.key, required this.contents, this.showOrders = false, this.idPrefix = ''});

  final List<ParcelContent> contents;
  final bool showOrders;
  final String idPrefix;

  @override
  Widget build(BuildContext context) {
    final lang = Strings.of(context).lang;
    return Column(
      key: ValueKey('${idPrefix}contents'),
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        for (var i = 0; i < contents.length; i++)
          Padding(
            key: ValueKey('${idPrefix}contents-line-$i'),
            padding: const EdgeInsets.symmetric(vertical: 2),
            child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Icon(Icons.shopping_bag_outlined, size: 16, color: AppColors.muted),
              const SizedBox(width: 8),
              Expanded(
                child: Text.rich(
                  TextSpan(children: [
                    TextSpan(text: contents[i].text(lang)),
                    if (showOrders && contents[i].orderReference.isNotEmpty)
                      TextSpan(text: ' · ${contents[i].orderReference}', style: const TextStyle(color: AppColors.muted, fontWeight: FontWeight.w700)),
                  ]),
                  style: const TextStyle(fontSize: 13.5, height: 1.3),
                ),
              ),
            ]),
          ),
      ],
    );
  }
}
