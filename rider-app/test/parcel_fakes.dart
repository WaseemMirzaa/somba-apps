// A scanner without a camera: tests call [emit] to "read" a code, or [fail] to simulate a missing permission.
import 'package:flutter/material.dart';
import 'package:somba_rider/services/parcel_scanner.dart';

class FakeParcelScanner extends ParcelScanner {
  FakeParcelScanner({this.settingsCanOpen = true});
  ValueChanged<String>? _onCode;
  ValueChanged<ScannerFault>? _onFault;
  final bool settingsCanOpen;
  int settingsOpened = 0;
  int views = 0;

  void emit(String code) => _onCode?.call(code);
  void fail(ScannerFault f) => _onFault?.call(f);

  @override
  Widget buildView(BuildContext context, {required ValueChanged<String> onCode, required ValueChanged<ScannerFault> onFault}) {
    _onCode = onCode;
    _onFault = onFault;
    views++;
    return const ColoredBox(key: ValueKey('fake-camera'), color: Colors.black);
  }

  @override
  Future<bool> openSettings() async {
    settingsOpened++;
    return settingsCanOpen;
  }
}
