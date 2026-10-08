import 'package:flutter/material.dart';
import '../l10n/strings.dart';
import '../theme/app_theme.dart';

/// The mobile-money networks accepted at launch (same ids the API uses).
const mobileMoneyMethods = ['airtel_money', 'orange_money', 'vodacom_mpesa'];

bool isMobileMoney(String method) => mobileMoneyMethods.contains(method);

/// Pick a network + enter the subscriber number that will approve the charge.
class MobileMoneyPicker extends StatelessWidget {
  final String locale;
  final String? method;
  final ValueChanged<String> onMethod;
  final TextEditingController phone;
  final String? phoneError;

  const MobileMoneyPicker({
    super.key,
    required this.locale,
    required this.method,
    required this.onMethod,
    required this.phone,
    this.phoneError,
  });

  @override
  Widget build(BuildContext context) {
    final s = Strings(locale);
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Wrap(spacing: 10, runSpacing: 10, children: [
        for (final m in mobileMoneyMethods)
          ChoiceChip(
            key: ValueKey('mm-$m'),
            label: Text(s.paymentLabel(m)),
            selected: method == m,
            onSelected: (_) => onMethod(m),
            selectedColor: AppColors.primary.withValues(alpha: 0.14),
            side: BorderSide(color: method == m ? AppColors.primary : AppColors.line),
            labelStyle: TextStyle(fontWeight: FontWeight.w700, color: method == m ? AppColors.primary : AppColors.inkSoft),
          ),
      ]),
      const SizedBox(height: 12),
      TextField(
        key: const ValueKey('mm-phone'),
        controller: phone,
        keyboardType: TextInputType.phone,
        decoration: InputDecoration(
          labelText: s.isFr ? 'Numéro Mobile Money' : 'Mobile money number',
          hintText: '+243 81 234 5678',
          errorText: phoneError,
          prefixIcon: const Icon(Icons.smartphone_rounded, size: 20),
          helperText: s.isFr
              ? 'Vous recevrez une demande de confirmation sur ce numéro.'
              : 'You will get an approval request on this number.',
        ),
      ),
    ]);
  }
}

/// Client-side sanity check mirroring the server rule (9–15 digits, optional +).
String? validateMobileNumber(String raw, {bool fr = false}) {
  final p = raw.replaceAll(RegExp(r'[\s().-]'), '');
  if (!RegExp(r'^\+?[0-9]{9,15}$').hasMatch(p)) {
    return fr ? 'Entrez un numéro valide, ex. +243 81 234 5678' : 'Enter a valid number, e.g. +243 81 234 5678';
  }
  return null;
}
