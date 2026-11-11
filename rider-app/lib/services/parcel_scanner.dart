import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

/// Why the camera cannot be used.
enum ScannerFault { permissionDenied, unavailable }

/// The camera side of parcel scanning, behind an interface so tests (and any device without a camera) can swap it: the scanner
/// screen only asks for a view that reports codes, and for the phone's settings page.
abstract class ParcelScanner {
  const ParcelScanner();

  /// A live view that calls [onCode] with the text of each QR code it reads (the same code may be read many times in a row:
  /// the screen debounces) and [onFault] when the camera cannot start.
  Widget buildView(BuildContext context, {required ValueChanged<String> onCode, required ValueChanged<ScannerFault> onFault});

  /// Opens this app's page in the phone's settings (to allow the camera). False when it could not be opened.
  Future<bool> openSettings();
}

/// The real camera, through the maintained `mobile_scanner` package (QR codes only).
class CameraParcelScanner extends ParcelScanner {
  const CameraParcelScanner();

  @override
  Widget buildView(BuildContext context, {required ValueChanged<String> onCode, required ValueChanged<ScannerFault> onFault}) =>
      _CameraView(onCode: onCode, onFault: onFault);

  @override
  Future<bool> openSettings() async {
    try {
      return await Geolocator.openAppSettings();
    } catch (_) {
      return false;
    }
  }
}

class _CameraView extends StatefulWidget {
  const _CameraView({required this.onCode, required this.onFault});
  final ValueChanged<String> onCode;
  final ValueChanged<ScannerFault> onFault;
  @override
  State<_CameraView> createState() => _CameraViewState();
}

class _CameraViewState extends State<_CameraView> {
  final _controller = MobileScannerController(formats: const [BarcodeFormat.qrCode], detectionSpeed: DetectionSpeed.normal);

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => MobileScanner(
        controller: _controller,
        onDetect: (capture) {
          for (final b in capture.barcodes) {
            final v = b.rawValue;
            if (v != null && v.isNotEmpty) widget.onCode(v);
          }
        },
        errorBuilder: (context, error) {
          // Reported after the frame: the screen swaps this view for its own message.
          WidgetsBinding.instance.addPostFrameCallback((_) {
            widget.onFault(error.errorCode == MobileScannerErrorCode.permissionDenied ? ScannerFault.permissionDenied : ScannerFault.unavailable);
          });
          return const ColoredBox(color: Colors.black);
        },
      );
}
