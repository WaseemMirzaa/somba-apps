import 'dart:async';
import 'package:flutter/material.dart';
import '../l10n/strings.dart';
import 'card_payments.dart';
import 'realtime_store.dart';

/// Pays one pending card order: asks the server for the card sheet (`payments:card-sheet`, by order id), then opens
/// it. The server's answer (client secret, publishable key) goes straight into the sheet and is dropped.
///
/// Never throws: a refusal of the server or an unusable answer comes back as a failed result carrying the reason in
/// the shopper's language. "Completed" only means the sheet confirmed; the order turns paid when the server pushes
/// `payment:updated`.
Future<CardSheetResult> payOrderByCard(String orderId) async {
  try {
    final sheet = await RealtimeStore.instance.cardSheet(orderId: orderId);
    if (!sheet.isUsable) return const CardSheetResult.failed();
    final result = await CardPayments.instance.present(
      publishableKey: sheet.publishableKey,
      clientSecret: sheet.clientSecret,
      merchantName: sheet.merchantName,
    );
    if (result.isCompleted) {
      // The webhook normally pushes `payment:updated` within a second; asking `payments:status` too lets the server
      // reconcile with Stripe in case that push is late. Quiet: the pending screen has its own manual check.
      unawaited(RealtimeStore.instance.refreshPayment(sheet.reference).then<void>((_) {}, onError: (Object _) {}));
    }
    return result;
  } catch (e) {
    return CardSheetResult.failed(Strings.current.errorText(e));
  }
}

/// The words for how the sheet ended, in [s]'s language.
String cardResultMessage(Strings s, CardSheetResult r) {
  if (r.isCompleted) return s.cardPayDone;
  if (r.isCanceled) return s.cardPayCanceled;
  return r.message.isEmpty ? s.cardPayFailed : '${s.cardPayFailed} ${r.message}';
}

/// Announces how the sheet ended in a snackbar (completed, canceled and failed all speak).
void announceCardResult(ScaffoldMessengerState messenger, Strings s, CardSheetResult r) {
  messenger
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: Text(cardResultMessage(s, r)), persist: false));
}
