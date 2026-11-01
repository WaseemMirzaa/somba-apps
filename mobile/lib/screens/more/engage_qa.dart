import 'package:flutter/material.dart';
import '../../data/catalog_models.dart';
import '../../l10n/strings.dart';
import '../../services/engage_store.dart';
import '../../services/models.dart';
import '../../services/realtime_store.dart';
import '../../theme/app_theme.dart';
import '../../widgets/common.dart';
import '../../widgets/feedback.dart';
import '../../widgets/kit.dart';
import '../../widgets/translatable_text.dart';

/// Questions and answers on the product page. The list follows the server live: a question pushed for this
/// product (`question:created`) or an answer to one (`question:updated`) shows up without leaving the page.
class QaSection extends StatefulWidget {
  final Product product;
  const QaSection({super.key, required this.product});

  @override
  State<QaSection> createState() => _QaSectionState();
}

class _QaSectionState extends State<QaSection> {
  List<QuestionDto> _items = const [];
  bool _loading = true;
  bool _failed = false;

  @override
  void initState() {
    super.initState();
    EngageStore.instance.questionEvents.addListener(_onPush);
    _load();
  }

  @override
  void didUpdateWidget(covariant QaSection old) {
    super.didUpdateWidget(old);
    if (old.product.uuid != widget.product.uuid) {
      _items = const [];
      _load();
    }
  }

  @override
  void dispose() {
    EngageStore.instance.questionEvents.removeListener(_onPush);
    super.dispose();
  }

  Future<void> _load({bool quiet = false}) async {
    final id = widget.product.uuid;
    if (!quiet) setState(() => _loading = true);
    try {
      final list = await RealtimeStore.instance.questionsFor(id);
      if (!mounted || id != widget.product.uuid) return;
      setState(() {
        _items = list;
        _loading = false;
        _failed = false;
      });
    } catch (e) {
      if (!mounted) return;
      final first = !_failed && !quiet;
      setState(() {
        _loading = false;
        _failed = _items.isEmpty;
      });
      if (first) showError(context, e);
    }
  }

  /// The server pushed a question: apply it when it is about this product.
  void _onPush() {
    final e = EngageStore.instance.questionEvents.value;
    if (e == null) return;
    final q = e.question;
    if (q.productId == null) {
      _load(quiet: true); // an older server does not say which product: ask again
    } else if (q.productId == widget.product.uuid) {
      _upsert(q);
    }
  }

  void _upsert(QuestionDto q) {
    if (!mounted) return;
    final i = _items.indexWhere((x) => x.id == q.id);
    setState(() {
      _failed = false;
      _items = i == -1 ? [q, ..._items] : [..._items.take(i), q, ..._items.skip(i + 1)];
    });
  }

  Future<void> _ask() async {
    final asked = await showModalBottomSheet<QuestionDto?>(
      context: context,
      isScrollControlled: true,
      builder: (_) => _AskSheet(product: widget.product, pageContext: context),
    );
    if (asked != null) _upsert(asked);
  }

  @override
  Widget build(BuildContext context) {
    final s = Strings.of(context);
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Row(children: [
        Expanded(child: Text(s.pdQa, style: Theme.of(context).textTheme.titleMedium)),
        TextButton(
          key: const ValueKey('qa-ask'),
          onPressed: _ask,
          style: TextButton.styleFrom(foregroundColor: AppColors.primary),
          child: Text(s.pdAsk),
        ),
      ]),
      if (_loading && _items.isEmpty)
        const Padding(padding: EdgeInsets.all(12), child: LinearProgressIndicator())
      else if (_failed)
        _hint(s.qaLoadFailed, action: TextButton(key: const ValueKey('qa-retry'), onPressed: _load, child: Text(s.qaRetry)))
      else if (_items.isEmpty)
        _hint(s.pdNoQuestions)
      else
        Container(
          key: const ValueKey('qa-list'),
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(color: AppColors.surface, borderRadius: BorderRadius.circular(20), boxShadow: AppShadow.card),
          child: Column(children: [
            for (var i = 0; i < _items.length; i++) ...[
              _tile(s, _items[i]),
              if (i != _items.length - 1) const Divider(height: 22),
            ],
          ]),
        ),
    ]);
  }

  Widget _hint(String text, {Widget? action}) => Container(
        width: double.infinity,
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(color: AppColors.surface, borderRadius: BorderRadius.circular(16), border: Border.all(color: AppColors.line)),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(text, style: const TextStyle(color: AppColors.muted, fontSize: 13)),
          if (action != null) action,
        ]),
      );

  Widget _tile(Strings s, QuestionDto q) {
    final mine = q.askerId != null && q.askerId == RealtimeStore.instance.user?.id;
    return Column(key: ValueKey('qa-${q.id}'), crossAxisAlignment: CrossAxisAlignment.start, children: [
      Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        const Icon(Icons.chat_bubble_outline_rounded, size: 16, color: AppColors.primary),
        const SizedBox(width: 8),
        Expanded(
            child: TranslatableText(kind: 'question', id: q.id, text: q.question, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13.5))),
      ]),
      Padding(
        padding: const EdgeInsets.only(left: 24, top: 2),
        child: Wrap(spacing: 6, runSpacing: 4, children: [
          if (mine) Pill(s.qaYours, key: ValueKey('qa-mine-${q.id}'), color: AppColors.primary.withValues(alpha: 0.10), textColor: AppColors.primary, fontSize: 10.5),
          if (q.isAnswered)
            Pill(s.qaAnswered, key: ValueKey('qa-state-${q.id}'), color: AppColors.success.withValues(alpha: 0.14), textColor: const Color(0xFF047857), fontSize: 10.5)
          else
            Pill(s.qaPending, key: ValueKey('qa-state-${q.id}'), color: AppColors.faint.withValues(alpha: 0.2), textColor: AppColors.inkSoft, fontSize: 10.5),
        ]),
      ),
      if (q.isAnswered)
        Container(
          key: ValueKey('qa-answer-${q.id}'),
          margin: const EdgeInsets.only(left: 24, top: 8),
          padding: const EdgeInsets.all(10),
          decoration: BoxDecoration(
            color: AppColors.primary.withValues(alpha: 0.06),
            borderRadius: BorderRadius.circular(12),
            border: Border(left: BorderSide(color: AppColors.primary.withValues(alpha: 0.5), width: 3)),
          ),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(s.qaSellerAnswer, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 12, color: AppColors.primary)),
            if (q.answeredAt != null)
              Text(s.qaAnsweredOn(s.date(q.answeredAt!)), key: ValueKey('qa-answered-at-${q.id}'), style: const TextStyle(color: AppColors.muted, fontSize: 11.5)),
            const SizedBox(height: 3),
            TranslatableText(kind: 'answer', id: q.id, text: q.answer!, style: const TextStyle(color: AppColors.inkSoft, fontSize: 13, height: 1.35)),
          ]),
        ),
    ]);
  }
}

/// The "Ask a question" sheet: the text stays when the server refuses it, so nothing typed is lost.
class _AskSheet extends StatefulWidget {
  final Product product;
  final BuildContext pageContext;
  const _AskSheet({required this.product, required this.pageContext});

  @override
  State<_AskSheet> createState() => _AskSheetState();
}

class _AskSheetState extends State<_AskSheet> {
  final _ctrl = TextEditingController();
  String? _error;
  bool _busy = false;

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  Future<void> _submit(Strings s) async {
    final text = _ctrl.text.trim();
    if (text.length < 3) {
      // The server asks for at least a few characters: say so here, in the field and in a snackbar.
      setState(() => _error = s.qaEmpty);
      showSnack(widget.pageContext, s.qaEmpty);
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final q = await EngageStore.instance.askQuestion(widget.product.uuid, text);
      if (!mounted || !widget.pageContext.mounted) return;
      showSnack(widget.pageContext, s.pdQuestionSent);
      Navigator.pop(context, q);
    } catch (e) {
      if (!mounted || !widget.pageContext.mounted) return;
      setState(() {
        _busy = false;
        _error = Strings.current.errorText(e);
      });
      showError(widget.pageContext, e);
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = Strings.of(context);
    return Padding(
      padding: EdgeInsets.fromLTRB(20, 20, 20, 20 + MediaQuery.of(context).viewInsets.bottom),
      child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Text(s.pdAskTitle, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 18, fontFamily: 'PlusJakartaSans')),
        const SizedBox(height: 12),
        TextField(
          key: const ValueKey('qa-field'),
          controller: _ctrl,
          autofocus: true,
          maxLines: 3,
          maxLength: 1000,
          onChanged: (_) {
            if (_error != null) setState(() => _error = null);
          },
          decoration: InputDecoration(
            hintText: s.pdAskHint,
            errorText: _error,
            filled: true,
            fillColor: AppColors.background,
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: const BorderSide(color: AppColors.line)),
          ),
        ),
        const SizedBox(height: 14),
        PrimaryButton(s.pdSubmitQuestion, busy: _busy, onPressed: () => _submit(s)),
      ]),
    );
  }
}
