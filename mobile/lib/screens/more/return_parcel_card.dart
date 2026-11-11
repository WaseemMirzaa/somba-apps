import 'package:flutter/material.dart';
import 'package:qr_flutter/qr_flutter.dart';
import '../../l10n/strings.dart';
import '../../services/aftersale_models.dart';
import '../../theme/app_theme.dart';
import '../../widgets/kit.dart';

/// Where a return's label stands for the card.
enum ParcelCardState { loading, ready, pending, failed }

/// The label of the box the customer sends back: the QR of its code, the code in large type, which box it is and what
/// to do with it. Customers cannot print, so they write the code on the package and give it to the rider.
class ReturnParcelCard extends StatelessWidget {
  const ReturnParcelCard({super.key, required this.state, this.parcel, this.onCopy, this.onRetry});

  final ParcelCardState state;
  final ReturnParcel? parcel;
  final VoidCallback? onCopy;
  final VoidCallback? onRetry;

  static const double _qrSize = 176;
  static const double _anchor = 40;

  @override
  Widget build(BuildContext context) {
    final s = Strings.of(context);
    final p = parcel;
    return Panel(
      key: const ValueKey('return-parcel'),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Row(children: [
          Container(
            width: _anchor,
            height: _anchor,
            decoration: BoxDecoration(color: AppColors.primary.withValues(alpha: 0.10), shape: BoxShape.circle),
            child: const Icon(Icons.qr_code_2_rounded, color: AppColors.primaryDark),
          ),
          const SizedBox(width: AppSpace.md),
          Expanded(child: Text(s.asPlTitle, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16))),
          if (state == ParcelCardState.ready && p != null)
            IconButton(key: const ValueKey('parcel-copy'), tooltip: s.asPlCopy, onPressed: onCopy, icon: const Icon(Icons.copy_rounded)),
        ]),
        const SizedBox(height: AppSpace.md),
        ..._body(s, p),
      ]),
    );
  }

  List<Widget> _body(Strings s, ReturnParcel? p) {
    switch (state) {
      case ParcelCardState.loading:
        return const [Padding(padding: EdgeInsets.all(AppSpace.lg), child: Center(child: CircularProgressIndicator(key: ValueKey('parcel-loading'))))];
      case ParcelCardState.failed:
        return [
          TextButton(key: const ValueKey('parcel-retry'), onPressed: onRetry, style: TextButton.styleFrom(minimumSize: const Size(0, 48)), child: Text(s.retry)),
        ];
      case ParcelCardState.pending:
        return [Text(s.asPlPending, key: const ValueKey('parcel-pending'), style: const TextStyle(color: AppColors.muted, fontSize: 13, height: 1.35))];
      case ParcelCardState.ready:
        if (p == null) return const [];
        return [
          Center(
            child: Semantics(
              label: s.asPlQrAlt,
              image: true,
              child: Container(
                key: const ValueKey('parcel-qr'),
                padding: const EdgeInsets.all(AppSpace.md),
                // A scanner needs dark on light whatever the surroundings are.
                decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(AppRadius.md), border: Border.all(color: AppColors.line)),
                child: QrImageView(key: ValueKey('parcel-qr-${p.code}'), data: p.code, size: _qrSize, padding: EdgeInsets.zero, backgroundColor: Colors.white, eyeStyle: const QrEyeStyle(color: AppColors.ink, eyeShape: QrEyeShape.square), dataModuleStyle: const QrDataModuleStyle(color: AppColors.ink, dataModuleShape: QrDataModuleShape.square)),
              ),
            ),
          ),
          const SizedBox(height: AppSpace.lg),
          Text(s.asPlCode, textAlign: TextAlign.center, style: const TextStyle(color: AppColors.muted, fontSize: 12.5)),
          // The code stays on one line at any text size: it is what gets written on the box.
          FittedBox(
            fit: BoxFit.scaleDown,
            child: Text(p.code, key: const ValueKey('parcel-code'), style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 32, letterSpacing: 2, fontFeatures: [FontFeature.tabularFigures()])),
          ),
          const SizedBox(height: AppSpace.sm),
          Text(
            p.orderReference.isEmpty ? s.asPlBox(p.boxNo, p.boxCount) : '${s.asPlBox(p.boxNo, p.boxCount)} · ${p.orderReference}',
            key: const ValueKey('parcel-box'),
            textAlign: TextAlign.center,
            style: const TextStyle(color: AppColors.inkSoft, fontWeight: FontWeight.w700, fontSize: 13.5),
          ),
          const SizedBox(height: AppSpace.md),
          Text(s.asPlWrite, key: const ValueKey('parcel-write'), textAlign: TextAlign.center, style: const TextStyle(color: AppColors.inkSoft, fontSize: 13.5, height: 1.4)),
        ];
    }
  }
}
