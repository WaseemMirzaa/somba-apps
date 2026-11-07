import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../l10n/compliance_strings.dart';
import '../l10n/strings.dart';
import '../services/compliance_models.dart';
import '../services/compliance_store.dart';
import '../services/support_store.dart' show PickedPhoto;
import '../theme/app_theme.dart';
import '../widgets/ui.dart';
import 'compliance_widgets.dart';

const kDocumentsRoute = 'rider/documents';
const kUploadDocumentRoute = 'rider/documents/upload';

IconData _iconOf(String type) => switch (type) {
      'driver_licence' => Icons.badge_outlined,
      'vehicle_insurance' => Icons.verified_user_outlined,
      'vehicle_registration' => Icons.description_outlined,
      'id_card' => Icons.perm_identity_rounded,
      _ => Icons.insert_drive_file_outlined,
    };

/// The rider's compliance documents: each with its review status and expiry. The scan itself is private (staff open it, the rider
/// does not need to). Expired or expiring documents show as reminders only: nothing here blocks the rider from working.
class RiderDocumentsScreen extends StatefulWidget {
  const RiderDocumentsScreen({super.key});
  @override
  State<RiderDocumentsScreen> createState() => _RiderDocumentsScreenState();
}

class _RiderDocumentsScreenState extends State<RiderDocumentsScreen> {
  final _store = ComplianceStore.instance;

  @override
  void initState() {
    super.initState();
    _store.load();
  }

  void _upload() => Navigator.of(context).push(MaterialPageRoute<void>(settings: const RouteSettings(name: kUploadDocumentRoute), builder: (_) => const UploadDocumentScreen()));

  @override
  Widget build(BuildContext context) {
    final s = Strings.of(context);
    return Scaffold(
      appBar: backAppBar(context, s.docTitle),
      body: ListenableBuilder(
        listenable: _store,
        builder: (context, _) => RefreshIndicator(
          onRefresh: _store.load,
          child: ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
            children: _children(s),
          ),
        ),
      ),
      // The one filled button of the screen, pinned. Label only.
      bottomNavigationBar: PinnedCta(s.docUpload, key: const ValueKey('doc-upload'), onPressed: _upload),
    );
  }

  List<Widget> _children(Strings s) {
    if (!_store.documentsLoaded) {
      if (_store.documentsError != null) {
        return [
          SurfaceCard(
            key: const ValueKey('docs-error'),
            child: Column(children: [
              Text(s.docLoadFailed, textAlign: TextAlign.center, style: const TextStyle(color: AppColors.muted)),
              const SizedBox(height: 8),
              TextButton(key: const ValueKey('docs-retry'), onPressed: _store.load, child: Text(s.retry)),
            ]),
          ),
        ];
      }
      return const [Padding(padding: EdgeInsets.only(top: 60), child: Center(child: CircularProgressIndicator()))];
    }
    final now = _store.clock();
    final w = _store.warnings;
    return [
      if (w.expired > 0) ...[WarningStrip(s.docWarnExpired, key: const ValueKey('docs-warn-expired'), color: kBadText), const SizedBox(height: 10)],
      if (w.expiring > 0) ...[WarningStrip(s.docWarnExpiring, key: const ValueKey('docs-warn-expiring'), color: kWarnText), const SizedBox(height: 10)],
      if (w.expired + w.expiring > 0) ...[
        Text(s.docWarnNote, key: const ValueKey('docs-warn-note'), style: const TextStyle(color: AppColors.muted, fontSize: 12.5)),
        const SizedBox(height: 12),
      ],
      if (_store.documents.isEmpty)
        SurfaceCard(key: const ValueKey('docs-empty'), child: Text(s.docNone, style: const TextStyle(color: AppColors.muted, height: 1.4)))
      else
        for (final d in _store.documents)
          Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: _DocumentCard(doc: d, now: now),
          ),
    ];
  }
}

class _DocumentCard extends StatelessWidget {
  const _DocumentCard({required this.doc, required this.now});
  final RiderDocumentDto doc;
  final DateTime now;

  @override
  Widget build(BuildContext context) {
    final s = Strings.of(context);
    final e = doc.expiry(now);
    final statusColor = doc.isApproved ? kGoodText : doc.isRejected ? kBadText : kWarnText;
    final (expiryText, expiryColor) = switch (e.state) {
      ExpiryState.none => (s.docNoExpiry, AppColors.muted),
      ExpiryState.valid => (s.docValidUntil(fmtDay(s, doc.expiresOn)), AppColors.muted),
      ExpiryState.expiring => (s.docExpiring(e.daysLeft!, fmtDay(s, doc.expiresOn)), kWarnText),
      ExpiryState.expired => (s.docExpired(fmtDay(s, doc.expiresOn)), kBadText),
    };
    return SurfaceCard(
      key: ValueKey('doc-${doc.id}'),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Icon(_iconOf(doc.type), color: AppColors.primary, size: 26),
        const SizedBox(width: 12),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(s.docTypeName(doc.type), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
            if (doc.number != null) ...[const SizedBox(height: 2), Text(s.docNumber(doc.number!), style: const TextStyle(color: AppColors.muted, fontSize: 12.5))],
            const SizedBox(height: 6),
            Text(expiryText, key: ValueKey('doc-expiry-${doc.id}'), style: TextStyle(color: expiryColor, fontSize: 13, fontWeight: e.state == ExpiryState.expired || e.state == ExpiryState.expiring ? FontWeight.w700 : FontWeight.w500)),
            const SizedBox(height: 8),
            StatusChip(s.docStatus(doc.status), key: ValueKey('doc-status-${doc.id}'), color: statusColor),
            if (doc.isRejected && doc.rejectionReason != null) ...[
              const SizedBox(height: 8),
              Text(s.docRejectedReason(doc.rejectionReason!), key: ValueKey('doc-reason-${doc.id}'), style: const TextStyle(color: kBadText, fontSize: 13, height: 1.35)),
            ],
            if (!doc.isPending && doc.reviewedByName != null) ...[
              const SizedBox(height: 4),
              Text(s.docCheckedBy(doc.reviewedByName!), style: const TextStyle(color: AppColors.faint, fontSize: 12)),
            ],
          ]),
        ),
      ]),
    );
  }
}

/// Sends a document: its type, an optional number and expiry date, and a photo from the camera or the gallery. The CTA stays
/// pinned above the keyboard; the form scrolls (it holds at 200% text size).
class UploadDocumentScreen extends StatefulWidget {
  const UploadDocumentScreen({super.key});
  @override
  State<UploadDocumentScreen> createState() => _UploadDocumentScreenState();
}

class _UploadDocumentScreenState extends State<UploadDocumentScreen> {
  final _store = ComplianceStore.instance;
  final _number = TextEditingController();
  String? _type;
  DateTime? _expiry;
  PickedPhoto? _photo;
  bool _busy = false, _submitted = false;

  @override
  void dispose() {
    _number.dispose();
    super.dispose();
  }

  Future<void> _pick(bool camera) async {
    final s = Strings.current;
    try {
      final photos = await _store.picker.pick(camera: camera, limit: 1);
      if (photos.isNotEmpty && mounted) setState(() => _photo = photos.first);
    } on PlatformException catch (e) {
      // A refused permission: say which one, and where to turn it back on.
      if (!mounted) return;
      final denied = e.code.contains('access_denied') || e.code.contains('permission');
      showSnack(context, denied ? (e.code.contains('camera') || camera && !e.code.contains('photo') ? s.errCameraDenied : s.errPhotosDenied) : s.errPhotoPick);
    } catch (_) {
      if (mounted) showSnack(context, s.errPhotoPick);
    }
  }

  Future<void> _pickDate() async {
    final now = _store.clock();
    final picked = await showDatePicker(
      context: context,
      initialDate: _expiry ?? DateTime(now.year + 1, now.month, now.day),
      firstDate: DateTime(2000),
      lastDate: DateTime(now.year + 30, 12, 31),
    );
    if (picked != null && mounted) setState(() => _expiry = picked);
  }

  Future<void> _send() async {
    final s = Strings.of(context);
    setState(() => _submitted = true);
    if (_type == null) {
      showSnack(context, s.errDocType);
      return;
    }
    if (_photo == null) {
      showSnack(context, s.errDocPhoto);
      return;
    }
    setState(() => _busy = true);
    try {
      await _store.submit(type: _type!, number: _number.text, expiresOn: _expiry, photo: _photo!);
      if (!mounted) return;
      showSnack(context, s.docSent);
      Navigator.of(context).pop();
    } catch (e) {
      if (mounted) showSnack(context, Strings.current.errorText(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = Strings.of(context);
    final photo = _photo;
    return Scaffold(
      appBar: backAppBar(context, s.docUpload),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 24),
        keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
        children: [
          Text(s.upType, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13, color: AppColors.inkSoft)),
          const SizedBox(height: 8),
          Wrap(spacing: 8, runSpacing: 8, children: [
            for (final t in kDocumentTypes)
              ChoiceChip(
                key: ValueKey('type-$t'),
                label: Text(s.docTypeName(t)),
                selected: _type == t,
                showCheckmark: false,
                onSelected: (_) => setState(() => _type = t),
              ),
          ]),
          if (_submitted && _type == null) Padding(padding: const EdgeInsets.only(top: 6), child: Text(s.errDocType, key: const ValueKey('type-error'), style: const TextStyle(color: kBadText, fontSize: 12.5))),
          const SizedBox(height: 20),
          TextField(
            key: const ValueKey('doc-number'),
            controller: _number,
            autocorrect: false,
            enableSuggestions: false,
            textCapitalization: TextCapitalization.characters,
            maxLength: 60,
            decoration: InputDecoration(labelText: s.upNumber, counterText: ''),
          ),
          const SizedBox(height: 16),
          Text(s.upExpiry, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13, color: AppColors.inkSoft)),
          const SizedBox(height: 8),
          Wrap(spacing: 8, runSpacing: 8, crossAxisAlignment: WrapCrossAlignment.center, children: [
            OutlinedButton(
              key: const ValueKey('doc-expiry-pick'),
              onPressed: _pickDate,
              child: Text(_expiry == null ? s.upExpiryPick : fmtDay(s, isoDay(_expiry!))),
            ),
            if (_expiry != null) TextButton(key: const ValueKey('doc-expiry-clear'), onPressed: () => setState(() => _expiry = null), child: Text(s.docNoExpiry)),
          ]),
          const SizedBox(height: 20),
          Text(s.upPhoto, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13, color: AppColors.inkSoft)),
          const SizedBox(height: 8),
          if (photo != null) ...[
            Semantics(
              label: s.upPhotoAlt,
              image: true,
              child: ClipRRect(
                borderRadius: BorderRadius.circular(14),
                child: SizedBox(height: 180, width: double.infinity, child: Image.file(File(photo.path), key: const ValueKey('doc-photo'), fit: BoxFit.cover, errorBuilder: (_, __, ___) => Container(color: AppColors.line, alignment: Alignment.center, child: const Icon(Icons.image_outlined, color: AppColors.faint)))),
              ),
            ),
            const SizedBox(height: 8),
          ],
          Wrap(spacing: 8, runSpacing: 8, children: [
            OutlinedButton(key: const ValueKey('photo-camera'), onPressed: _busy ? null : () => _pick(true), child: Text(s.photoCamera)),
            OutlinedButton(key: const ValueKey('photo-gallery'), onPressed: _busy ? null : () => _pick(false), child: Text(photo == null ? s.photoGallery : s.upPhotoReplace)),
          ]),
          if (_submitted && photo == null) Padding(padding: const EdgeInsets.only(top: 6), child: Text(s.errDocPhoto, key: const ValueKey('photo-error'), style: const TextStyle(color: kBadText, fontSize: 12.5))),
        ],
      ),
      bottomNavigationBar: PinnedCta(s.upSend, key: const ValueKey('doc-send'), busy: _busy, onPressed: _send),
    );
  }
}
