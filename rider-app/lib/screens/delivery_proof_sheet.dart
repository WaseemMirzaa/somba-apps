import 'dart:io';
import 'package:flutter/material.dart';
import '../l10n/strings.dart';
import '../services/delivery_proof.dart';
import '../theme/app_theme.dart';
import '../widgets/signature_pad.dart';
import '../widgets/ui.dart';

/// Bottom sheet shown when the rider completes a delivery to the customer: an optional photo of the parcel at the door and
/// an optional signature. "Continue" saves what was captured on the server FIRST (private storage) and only then closes,
/// answering `true`; if the save fails the sheet stays open with the reason, and offers to deliver without the proof. With
/// nothing captured "Continue" just closes. Answers `false` / null when the rider cancels (the delivery is not completed).
///
/// The delivery code, the cash and every other check of the completion stay where they were: this only adds the proof.
class DeliveryProofSheet extends StatefulWidget {
  const DeliveryProofSheet({super.key, required this.taskId, this.camera, this.uploader});
  final String taskId;

  /// Tests pass fakes; the app uses [DeliveryProofKit].
  final ProofCamera? camera;
  final ProofUploader? uploader;

  @override
  State<DeliveryProofSheet> createState() => _DeliveryProofSheetState();
}

class _DeliveryProofSheetState extends State<DeliveryProofSheet> {
  final _signature = SignatureController();
  String? _photoPath;
  String? _error;
  bool _busy = false;
  bool _failed = false;

  ProofCamera get _camera => widget.camera ?? DeliveryProofKit.instance.camera;
  ProofUploader get _uploader => widget.uploader ?? DeliveryProofKit.instance.uploader;

  @override
  void initState() {
    super.initState();
    _signature.addListener(_onInk);
  }

  @override
  void dispose() {
    _signature.removeListener(_onInk);
    _signature.dispose();
    super.dispose();
  }

  void _onInk() {
    // Drawing again after a failed save clears the old message; rebuild only when the state of the buttons can change.
    if (_error != null && mounted) setState(() => _error = null);
  }

  Future<void> _takePhoto() async {
    setState(() => _error = null);
    try {
      final path = await _camera.capture();
      if (path != null && mounted) setState(() => _photoPath = path);
    } catch (e) {
      if (!mounted) return;
      final text = Strings.current.errorText(e);
      setState(() => _error = text);
      showSnack(context, text);
    }
  }

  Future<void> _continue() async {
    final s = Strings.of(context);
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final png = _signature.hasInk ? await _signature.toPng() : null;
      final proof = DeliveryProof(photoPath: _photoPath, signaturePng: png);
      if (!proof.isEmpty) await _uploader.upload(widget.taskId, proof);
      if (mounted) Navigator.pop(context, true);
    } catch (e) {
      if (!mounted) return;
      final text = Strings.current.errorText(e);
      setState(() {
        _busy = false;
        _failed = true;
        _error = text;
      });
      showSnack(context, '${s.podSaveFailed} $text');
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = Strings.of(context);
    return Padding(
      padding: EdgeInsets.fromLTRB(20, 0, 20, MediaQuery.of(context).viewInsets.bottom + 20),
      child: SingleChildScrollView(
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(s.podTitle, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800)),
          const SizedBox(height: 4),
          Text(s.podBody, style: const TextStyle(color: AppColors.muted, fontSize: 13)),
          const SizedBox(height: 16),
          Text(s.podPhotoLabel, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14)),
          const SizedBox(height: 8),
          if (_photoPath == null)
            SizedBox(
              width: double.infinity,
              child: OutlinedButton(key: const ValueKey('proof-photo'), onPressed: _busy ? null : _takePhoto, child: ButtonLabel(s.photoCamera)),
            )
          else ...[
            ClipRRect(
              borderRadius: BorderRadius.circular(14),
              child: Semantics(
                label: s.podPhotoAlt,
                image: true,
                child: Image.file(
                  File(_photoPath!),
                  key: const ValueKey('proof-photo-preview'),
                  height: 140,
                  width: double.infinity,
                  fit: BoxFit.cover,
                  errorBuilder: (_, __, ___) => Container(
                    height: 140,
                    width: double.infinity,
                    color: AppColors.background,
                    alignment: Alignment.center,
                    child: Text(s.photoUnavailable, style: const TextStyle(color: AppColors.muted)),
                  ),
                ),
              ),
            ),
            Wrap(spacing: 4, children: [
              TextButton(key: const ValueKey('proof-retake'), onPressed: _busy ? null : _takePhoto, child: Text(s.podRetake)),
              TextButton(key: const ValueKey('proof-photo-remove'), onPressed: _busy ? null : () => setState(() => _photoPath = null), child: Text(s.photoRemove)),
            ]),
          ],
          const SizedBox(height: 12),
          Row(children: [
            Expanded(child: Text(s.podSignatureLabel, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14))),
            ListenableBuilder(
              listenable: _signature,
              builder: (_, __) => _signature.isBlank
                  ? const SizedBox.shrink()
                  : TextButton(key: const ValueKey('signature-clear'), onPressed: _busy ? null : _signature.clear, child: Text(s.podClear)),
            ),
          ]),
          const SizedBox(height: 8),
          SignaturePad(controller: _signature, hint: s.podSignHere, semanticLabel: s.podSignatureAlt),
          if (_error != null)
            Padding(
              padding: const EdgeInsets.only(top: 10),
              child: Text(_error!, key: const ValueKey('proof-error'), style: const TextStyle(color: AppColors.danger, fontWeight: FontWeight.w600)),
            ),
          const SizedBox(height: 16),
          SizedBox(
            width: double.infinity,
            child: FilledButton(
              key: const ValueKey('proof-continue'),
              onPressed: _busy ? null : _continue,
              child: _busy ? const ButtonSpinner() : ButtonLabel(s.podContinue),
            ),
          ),
          Wrap(alignment: WrapAlignment.spaceBetween, children: [
            TextButton(key: const ValueKey('proof-cancel'), onPressed: _busy ? null : () => Navigator.pop(context, false), child: Text(s.cancel)),
            // Only after a failed save: the rider decides, knowing the proof will not be kept.
            if (_failed) TextButton(key: const ValueKey('proof-skip'), onPressed: _busy ? null : () => Navigator.pop(context, true), child: Text(s.podSkip)),
          ]),
        ]),
      ),
    );
  }
}
