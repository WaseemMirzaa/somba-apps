import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../l10n/parcel_strings.dart';
import '../l10n/strings.dart';
import '../services/parcel_scanner.dart';
import '../services/parcels.dart';
import '../theme/app_theme.dart';
import '../widgets/ui.dart';
import 'parcel_checklist.dart';

/// Sends one scan to the server; throws what it refuses with.
typedef ScanParcel = Future<ParcelScan> Function(String code, bool manual);

/// The scanner: stays open while the rider scans box after box. Every scan ticks the checklist off ("2 of 3 scanned"), with a
/// buzz and a snackbar; the server's refusals are shown as they come. Without the camera (no permission, no camera) the code can be
/// typed, and that scan is sent as `manual`. The camera itself is a [ParcelScanner], so tests drive the screen without one.
class ParcelScanScreen extends StatefulWidget {
  const ParcelScanScreen({
    super.key,
    required this.title,
    required this.stage,
    required this.parcels,
    required this.onScan,
    required this.refresh,
    this.scanner = const CameraParcelScanner(),
    this.debounce = const Duration(seconds: 3),
  });

  /// The leg or run being scanned (an order reference, a run reference).
  final String title;
  final ParcelStage stage;

  /// The boxes as they stand now (read on every [refresh] notification).
  final List<ParcelDto> Function() parcels;
  final ScanParcel onScan;

  /// Rebuilds the screen when the boxes change (the store).
  final Listenable refresh;
  final ParcelScanner scanner;

  /// The camera reads one QR many times a second: the same code is ignored for this long after it was handled.
  final Duration debounce;

  @override
  State<ParcelScanScreen> createState() => _ParcelScanScreenState();
}

class _ParcelScanScreenState extends State<ParcelScanScreen> {
  final _typed = TextEditingController();
  ScannerFault? _fault;
  bool _busy = false;
  String? _lastCode;
  DateTime? _lastAt;
  ({String text, bool error})? _note;

  @override
  void dispose() {
    _typed.dispose();
    super.dispose();
  }

  /// A code read by the camera: debounced, one at a time.
  void _onCamera(String raw) {
    final code = normalizeParcelCode(raw);
    final now = DateTime.now();
    if (_busy) return;
    if (code == _lastCode && _lastAt != null && now.difference(_lastAt!) < widget.debounce) return;
    _lastCode = code;
    _lastAt = now;
    _submit(code, manual: false);
  }

  void _onTyped() {
    final code = normalizeParcelCode(_typed.text);
    if (code.isEmpty || _busy) return;
    _lastCode = code;
    _lastAt = DateTime.now();
    _submit(code, manual: true);
  }

  Future<void> _submit(String code, {required bool manual}) async {
    final s = Strings.current;
    setState(() => _busy = true);
    try {
      final scan = await widget.onScan(code, manual);
      if (!mounted) return;
      final complete = stageComplete(widget.parcels(), widget.stage);
      final text = scan.already ? s.parcelAlready(code) : complete ? s.parcelCompleteMsg : s.parcelScannedOk(code, scan.scanned, scan.total);
      _feedback(heavy: false);
      setState(() => _note = (text: text, error: false));
      showSnack(context, text);
      if (manual) _typed.clear();
    } catch (e) {
      if (!mounted) return;
      final text = s.errorText(e);
      _feedback(heavy: true);
      setState(() => _note = (text: text, error: true));
      showSnack(context, text);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  /// The buzz (and the platform's click) that says a scan went through, or was refused. Never throws.
  void _feedback({required bool heavy}) {
    try {
      (heavy ? HapticFeedback.heavyImpact() : HapticFeedback.mediumImpact()).catchError((Object _) {});
      if (!heavy) SystemSound.play(SystemSoundType.click).catchError((Object _) {});
    } catch (_) {}
  }

  Future<void> _openSettings() async {
    final ok = await widget.scanner.openSettings();
    if (!ok && mounted) showSnack(context, Strings.of(context).parcelSettingsFailed);
  }

  @override
  Widget build(BuildContext context) {
    final s = Strings.of(context);
    return Scaffold(
      appBar: AppBar(title: Text(widget.title)),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
          child: SizedBox(width: double.infinity, child: FilledButton(key: const ValueKey('parcel-finish'), onPressed: () => Navigator.of(context).maybePop(), child: ButtonLabel(s.parcelFinish))),
        ),
      ),
      body: ListenableBuilder(
        listenable: widget.refresh,
        builder: (context, _) {
          final parcels = widget.parcels();
          return ListView(padding: const EdgeInsets.fromLTRB(16, 12, 16, 24), children: [
            Text(widget.stage == ParcelStage.pickup ? s.parcelStagePickup : s.parcelStageDropoff, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 13, color: AppColors.muted)),
            const SizedBox(height: 8),
            _camera(s),
            if (_note != null)
              Padding(
                padding: const EdgeInsets.only(top: 10),
                child: Text(
                  _note!.text,
                  key: const ValueKey('parcel-note'),
                  style: TextStyle(fontWeight: FontWeight.w700, fontSize: 13.5, height: 1.3, color: _note!.error ? AppColors.danger : AppColors.success),
                ),
              ),
            const SizedBox(height: 14),
            SurfaceCard(child: ParcelChecklist(parcels: parcels, stage: widget.stage)),
            const SizedBox(height: 14),
            _typedFallback(s),
          ]);
        },
      ),
    );
  }

  Widget _camera(Strings s) {
    final fault = _fault;
    if (fault != null) {
      return Container(
        key: const ValueKey('parcel-camera-fault'),
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(color: AppColors.danger.withValues(alpha: 0.08), borderRadius: BorderRadius.circular(16)),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          if (fault == ScannerFault.permissionDenied) ...[
            Text(s.parcelCamDeniedTitle, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
            const SizedBox(height: 4),
            Text(s.parcelCamDeniedBody, style: const TextStyle(height: 1.35)),
            const SizedBox(height: 10),
            SizedBox(width: double.infinity, child: OutlinedButton(key: const ValueKey('parcel-open-settings'), onPressed: _openSettings, child: ButtonLabel(s.parcelOpenSettings))),
          ] else
            Text(s.parcelCamUnavailable, style: const TextStyle(height: 1.35)),
        ]),
      );
    }
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      ClipRRect(
        borderRadius: BorderRadius.circular(16),
        child: SizedBox(
          height: 240,
          child: widget.scanner.buildView(context, onCode: _onCamera, onFault: (f) {
            if (mounted && _fault != f) setState(() => _fault = f);
          }),
        ),
      ),
      const SizedBox(height: 8),
      Text(s.parcelAim, style: const TextStyle(color: AppColors.muted, fontSize: 12.5, height: 1.3)),
    ]);
  }

  Widget _typedFallback(Strings s) => Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        TextField(
          key: const ValueKey('parcel-type-field'),
          controller: _typed,
          textCapitalization: TextCapitalization.characters,
          autocorrect: false,
          enableSuggestions: false,
          textInputAction: TextInputAction.done,
          inputFormatters: [
            FilteringTextInputFormatter.allow(RegExp(r'[A-Za-z0-9-]')),
            TextInputFormatter.withFunction((old, v) => v.copyWith(text: v.text.toUpperCase())),
          ],
          onSubmitted: (_) => _onTyped(),
          decoration: InputDecoration(labelText: s.parcelTypeLabel, hintText: s.parcelTypeHint),
        ),
        const SizedBox(height: 8),
        SizedBox(width: double.infinity, child: OutlinedButton(key: const ValueKey('parcel-type-submit'), onPressed: _busy ? null : _onTyped, child: ButtonLabel(s.parcelTypeSubmit))),
      ]);
}
