import '../l10n/strings.dart';

/// A payment method's name as the customer should read it. Known methods use their translated name; a method this
/// app does not know (an old order, a newer server) reads as a humanised label ("some_method" -> "Some method")
/// instead of a raw code.
String shownPaymentLabel(Strings s, String method) {
  if (method.isEmpty) return s.t('payment');
  if (s.has('pay_$method') || const {'airtel_money', 'orange_money', 'vodacom_mpesa'}.contains(method)) return s.paymentLabel(method);
  final words = method.replaceAll(RegExp(r'[_\-]+'), ' ').trim();
  return words.isEmpty ? s.t('payment') : words[0].toUpperCase() + words.substring(1);
}
