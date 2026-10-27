import 'package:flutter/material.dart';
import '../l10n/strings.dart';
import '../theme/app_theme.dart';

/// "We don't deliver to {area} yet." with the cities we do deliver in and a "Change address" action: shown on the cart
/// and checkout when no warehouse covers the delivery address. The texts are already in the user's language.
class NotServedNotice extends StatelessWidget {
  const NotServedNotice({super.key, required this.message, this.cities, required this.onChangeAddress});

  final String message;

  /// "We currently deliver in: …", when any city is known.
  final String? cities;
  final VoidCallback onChangeAddress;

  @override
  Widget build(BuildContext context) {
    final s = Strings.of(context);
    return Container(
      key: const ValueKey('not-served'),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(color: AppColors.dangerSoft, borderRadius: BorderRadius.circular(12)),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        const Icon(Icons.info_outline_rounded, size: 18, color: AppColors.dangerStrong),
        const SizedBox(width: 8),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(message,
                key: const ValueKey('not-served-text'),
                style: const TextStyle(color: AppColors.dangerStrong, fontSize: 12.5, fontWeight: FontWeight.w600, height: 1.35)),
            if (cities != null)
              Padding(
                padding: const EdgeInsets.only(top: 2),
                child: Text(cities!,
                    key: const ValueKey('not-served-cities'), style: const TextStyle(color: AppColors.dangerStrong, fontSize: 12.5, height: 1.35)),
              ),
            TextButton(
              key: const ValueKey('change-address'),
              style: TextButton.styleFrom(padding: EdgeInsets.zero, foregroundColor: AppColors.dangerStrong),
              onPressed: onChangeAddress,
              child: Text(s.areaChangeAddress),
            ),
          ]),
        ),
      ]),
    );
  }
}
