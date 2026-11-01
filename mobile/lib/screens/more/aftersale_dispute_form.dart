import 'package:flutter/material.dart';
import '../../l10n/strings.dart';
import '../../services/aftersale_store.dart';
import '../../services/models.dart';
import '../../theme/app_theme.dart';
import '../../widgets/feedback.dart';
import '../../widgets/kit.dart';
import '../../widgets/photo_picker.dart';
import 'aftersale_request.dart';
import 'aftersale_widgets.dart';

/// Report a problem with an order (a dispute, not a return): missing, damaged or wrong item, or not received.
/// The seller answers first; Somba support decides if needed. One open dispute per order (the server says so).
class DisputeFormScreen extends StatefulWidget {
  final Locale locale;
  final OrderDto order;
  const DisputeFormScreen({super.key, this.locale = const Locale('en'), required this.order});

  /// Which problems can be reported for an order in this status: all once delivered, only "not received" before.
  static List<String> categoriesFor(String orderStatus) =>
      orderStatus == 'delivered' ? const ['missing', 'damaged', 'wrong_item', 'not_received', 'other'] : const ['not_received', 'other'];

  @override
  State<DisputeFormScreen> createState() => _DisputeFormScreenState();
}

class _DisputeFormScreenState extends State<DisputeFormScreen> {
  final _store = AfterSaleStore.instance;
  final _reason = TextEditingController();
  final _photos = PhotoAttachments(max: 6);
  final Set<String> _picked = {};
  String? _category;
  String? _categoryError, _reasonError;
  bool _busy = false;

  List<OrderItemDto> get _lines => widget.order.items.where((i) => !i.isCancelled).toList();

  @override
  void dispose() {
    _reason.dispose();
    _photos.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final s = Strings.of(context);
    final reason = _reason.text.trim();
    setState(() {
      _categoryError = _category == null ? s.asPickCategory : null;
      _reasonError = reason.length < 5 ? s.asReasonShort : null;
    });
    final first = _categoryError ?? _reasonError;
    if (first != null) {
      showSnack(context, first);
      return;
    }
    if (_photos.busy) {
      showSnack(context, s.asPhotosWait);
      return;
    }
    setState(() => _busy = true);
    try {
      final res = await _store.open(
        orderId: widget.order.id,
        type: 'dispute',
        reason: reason,
        category: _category,
        // No lines = the whole order.
        items: [
          for (final i in _lines)
            if (_picked.contains(i.productId)) {'productId': i.productId, 'qty': i.qty}
        ],
        attachments: _photos.urls,
      );
      if (!mounted) return;
      showSnack(context, s.asDpSent(res.dispute.reference));
      Navigator.pushReplacement(
        context,
        MaterialPageRoute(builder: (_) => ReturnStatusScreen(locale: widget.locale, returnRequest: res.dispute)),
      );
    } catch (e) {
      if (!mounted) return;
      setState(() => _busy = false);
      showError(context, e);
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = Strings.of(context);
    final cats = DisputeFormScreen.categoriesFor(widget.order.status);
    return Scaffold(
      appBar: backAppBar(context, s.asReportProblem),
      body: ListView(padding: const EdgeInsets.fromLTRB(16, 8, 16, 24), children: [
        Text(s.asDpIntro(widget.order.reference), style: const TextStyle(color: AppColors.muted, fontSize: 13, height: 1.4)),
        const SizedBox(height: AppSpace.lg),
        Text(s.asDpCategory, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
        const SizedBox(height: 10),
        Wrap(spacing: 8, runSpacing: 8, children: [
          for (final c in cats)
            ChoiceChip(
              key: ValueKey('cat-$c'),
              label: Text(categoryLabel(s, c)),
              selected: _category == c,
              onSelected: (_) => setState(() {
                _category = c;
                _categoryError = null;
              }),
            ),
        ]),
        FieldError(_categoryError, fieldKey: const ValueKey('category-error')),
        if (_lines.length > 1) ...[
          const SizedBox(height: AppSpace.lg),
          Text(s.asDpItems, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
          const SizedBox(height: 2),
          Text(s.asDpItemsHint, style: const TextStyle(color: AppColors.muted, fontSize: 12.5)),
          for (final i in _lines)
            CheckboxListTile(
              key: ValueKey('dp-item-${i.productId}'),
              contentPadding: EdgeInsets.zero,
              controlAffinity: ListTileControlAffinity.leading,
              value: _picked.contains(i.productId),
              onChanged: (v) => setState(() => v == true ? _picked.add(i.productId) : _picked.remove(i.productId)),
              title: Text('${i.qty} × ${i.displayName(s.lang)}', style: const TextStyle(fontSize: 13.5)),
              subtitle: i.hasVariant ? Text(i.displayVariant(s.lang), style: const TextStyle(fontSize: 12.5)) : null,
            ),
        ],
        const SizedBox(height: AppSpace.lg),
        AppField(
          key: const ValueKey('dispute-details'),
          label: s.asReasonLabel,
          hint: s.asReasonHint,
          controller: _reason,
          maxLines: 3,
          error: _reasonError,
          onChanged: (_) {
            if (_reasonError != null) setState(() => _reasonError = null);
          },
        ),
        const SizedBox(height: AppSpace.lg),
        PhotoPickerField(attachments: _photos, label: s.asPhotosLabel),
        const SizedBox(height: AppSpace.lg),
        SubmitButton(s.asDpSubmit, key: const ValueKey('dispute-submit'), busy: _busy, onPressed: _submit),
      ]),
    );
  }
}
