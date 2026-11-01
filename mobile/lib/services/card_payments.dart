import 'package:flutter/material.dart';
import 'package:flutter_stripe/flutter_stripe.dart';
import '../theme/app_theme.dart';

/// How the card sheet ended.
enum CardSheetStatus { completed, canceled, failed }

class CardSheetResult {
  final CardSheetStatus status;

  /// The payment provider's own wording of a failure (already in the device language); empty when there is none.
  final String message;
  const CardSheetResult(this.status, [this.message = '']);

  const CardSheetResult.completed() : this(CardSheetStatus.completed);
  const CardSheetResult.canceled() : this(CardSheetStatus.canceled);
  const CardSheetResult.failed([String message = '']) : this(CardSheetStatus.failed, message);

  bool get isCompleted => status == CardSheetStatus.completed;
  bool get isCanceled => status == CardSheetStatus.canceled;
  bool get isFailed => status == CardSheetStatus.failed;
}

/// The bank-card payment sheet behind a seam, so screens and tests never touch the Stripe plugin.
///
/// The card number is typed into Stripe's own sheet and goes from the phone straight to Stripe: the app never sees
/// it. Both keys arrive from OUR server with each payment (nothing is compiled into the app): the publishable key
/// (public by design, but rotatable without a release) and the PaymentIntent client secret (this payment only).
/// Neither is logged, stored or shown.
abstract class CardPayments {
  /// Opens the sheet for one PaymentIntent and resolves when the customer is done with it.
  /// "Completed" means the sheet confirmed the payment; the server still decides (`payment:updated`).
  Future<CardSheetResult> present({required String publishableKey, required String clientSecret, required String merchantName});

  /// Tests stand in for the Stripe sheet.
  @visibleForTesting
  static CardPayments? debugOverride;

  static CardPayments get instance => debugOverride ?? _real;
  static final CardPayments _real = StripeCardPayments();
}

/// The real thing: flutter_stripe's PaymentSheet.
class StripeCardPayments implements CardPayments {
  @override
  Future<CardSheetResult> present({required String publishableKey, required String clientSecret, required String merchantName}) async {
    try {
      // Set at RUNTIME from the server's answer; rotating the key needs no app release.
      Stripe.publishableKey = publishableKey;
      await Stripe.instance.applySettings();
      await Stripe.instance.initPaymentSheet(
        paymentSheetParameters: SetupPaymentSheetParameters(
          paymentIntentClientSecret: clientSecret,
          merchantDisplayName: merchantName,
          style: ThemeMode.light,
          appearance: const PaymentSheetAppearance(
            colors: PaymentSheetAppearanceColors(
              primary: AppColors.primary,
              background: AppColors.surface,
              componentBackground: AppColors.surface,
              componentBorder: AppColors.line,
              componentText: AppColors.ink,
              placeholderText: AppColors.muted,
              primaryText: AppColors.ink,
              secondaryText: AppColors.muted,
              error: AppColors.danger,
            ),
            primaryButton: PaymentSheetPrimaryButtonAppearance(
              colors: PaymentSheetPrimaryButtonTheme(
                light: PaymentSheetPrimaryButtonThemeColors(background: AppColors.primary, text: Color(0xFFFFFFFF)),
              ),
            ),
          ),
        ),
      );
      await Stripe.instance.presentPaymentSheet();
      return const CardSheetResult.completed();
    } on StripeException catch (e) {
      if (e.error.code == FailureCode.Canceled) return const CardSheetResult.canceled();
      return CardSheetResult.failed(e.error.localizedMessage ?? e.error.message ?? '');
    } catch (_) {
      // Never echo an unknown error: it could carry request details.
      return const CardSheetResult.failed();
    }
  }
}
