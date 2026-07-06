import 'package:flutter/foundation.dart';

/// Shared rider session state (on-duty + shift), so the home toggle, profile
/// toggle and the Shift & attendance screen all stay in sync.
class RiderState {
  RiderState._();
  static final RiderState instance = RiderState._();

  /// On duty = receiving new tasks. Wired to the home + profile toggles.
  final ValueNotifier<bool> onDuty = ValueNotifier(true);

  /// Whether a shift is currently clocked in.
  final ValueNotifier<bool> shiftActive = ValueNotifier(true);

  /// Whether the rider is on a break (shift active but paused).
  final ValueNotifier<bool> onBreak = ValueNotifier(false);

  /// Human label for when the current shift started.
  String shiftStartedAt = '08:00';

  void startShift() {
    shiftActive.value = true;
    onBreak.value = false;
    onDuty.value = true;
  }

  void endShift() {
    shiftActive.value = false;
    onBreak.value = false;
    onDuty.value = false;
  }

  void toggleBreak() {
    onBreak.value = !onBreak.value;
    // On a break the rider stops receiving new tasks but stays clocked in.
    onDuty.value = !onBreak.value && shiftActive.value;
  }

  /// Called by the home / profile on-duty switches.
  void setOnDuty(bool v) {
    onDuty.value = v;
    if (v) {
      shiftActive.value = true;
      onBreak.value = false;
    }
  }
}
