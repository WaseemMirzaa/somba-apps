import 'package:flutter/material.dart';
import '../l10n/strings.dart';

/// The one way a screen announces an outcome: a floating snackbar, one at a time, gone on its own.
/// Every completed mutation and every handled failure goes through [showSnack] / [showError].
void showSnack(BuildContext context, String message, {SnackBarAction? action}) {
  if (!context.mounted) return;
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: Text(message), action: action, persist: false));
}

/// A failure in the user's language (the server's message, French when needed; never a raw exception dump).
void showError(BuildContext context, Object error) => showSnack(context, Strings.current.errorText(error));
