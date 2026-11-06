import 'package:flutter/material.dart';
import '../l10n/strings.dart';
import '../services/device_location.dart';

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

/// Tells the customer why their position is not available and, where the system can fix it, offers the Settings screen.
/// [withMap] false: the screen has no map to search or tap, so "denied" must not suggest one.
void showLocationProblem(BuildContext context, LocationProblem problem, {bool withMap = true}) {
  final s = Strings.of(context);
  final message = switch (problem) {
    LocationProblem.servicesOff => s.addrLocationOff,
    LocationProblem.denied => withMap ? s.addrMapLocationDenied : s.addrLocationDeniedPin,
    LocationProblem.blocked => s.addrLocationBlocked,
    LocationProblem.unavailable => s.addrLocationNone,
  };
  final canOpen = problem == LocationProblem.servicesOff || problem == LocationProblem.blocked;
  showSnack(context, message, action: canOpen ? SnackBarAction(label: s.addrLocationSettings, onPressed: () => openLocationSettingsFor(problem)) : null);
}
