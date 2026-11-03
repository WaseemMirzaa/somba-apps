import '../l10n/strings.dart';
import '../services/realtime_store.dart';

/// A payment method's name as the customer should read it. Cash on delivery is not offered unless the platform
/// setting `codEnabled` is on, so an order that still carries it (old data) reads as a plain "Payment" instead of
/// advertising a method nobody can choose.
String shownPaymentLabel(Strings s, String method, {bool? codEnabled}) =>
    method == 'cod' && !(codEnabled ?? RealtimeStore.instance.codEnabled) ? s.t('payment') : s.paymentLabel(method);

/// Whether "pay on delivery" wording may appear for an order (only while cash on delivery is on).
bool showsCod(bool isCod, {bool? codEnabled}) => isCod && (codEnabled ?? RealtimeStore.instance.codEnabled);
