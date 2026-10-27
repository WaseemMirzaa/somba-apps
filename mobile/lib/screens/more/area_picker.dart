import 'package:flutter/material.dart';
import '../../l10n/strings.dart';
import '../../services/geo_models.dart';
import '../../theme/app_theme.dart';
import '../../widgets/common.dart';

/// One row of an area sheet: an area, and the group (a Kinshasa district) it is listed under.
typedef AreaOption = ({AreaDto area, AreaDto? group});

/// A read-only field that shows the chosen area (in the app's language) and opens the sheet of that level.
/// [busy] shows a spinner while the options are being fetched; [onTap] null greys the field out.
class AreaPickerField extends StatelessWidget {
  const AreaPickerField({super.key, required this.level, required this.value, required this.onTap, this.error, this.busy = false});

  final String level;
  final AreaDto? value;
  final VoidCallback? onTap;
  final String? error;
  final bool busy;

  @override
  Widget build(BuildContext context) {
    final s = Strings.of(context);
    final enabled = onTap != null;
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(s.areaLevelLabel(level), style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13, color: AppColors.inkSoft)),
      const SizedBox(height: 6),
      InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: busy ? null : onTap,
        child: InputDecorator(
          isEmpty: value == null,
          isFocused: false,
          decoration: InputDecoration(
            hintText: s.areaChoose,
            errorText: error,
            enabled: enabled,
            suffixIcon: busy
                ? const Padding(padding: EdgeInsets.all(14), child: SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2)))
                : const Icon(Icons.keyboard_arrow_down_rounded),
          ),
          child: value == null
              ? null
              : Text(value!.nameFor(s.lang), maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600)),
        ),
      ),
    ]);
  }
}

/// Lists [options] of one [level] in a bottom sheet; returns the area chosen, or null when dismissed. Areas without a
/// warehouse are greyed out and tagged "Coming soon" (unless something inside them is served); a long list gets a
/// search box. Areas are named in the app's language.
Future<AreaOption?> showAreaSheet(BuildContext context, {required String level, required List<AreaOption> options, AreaDto? selected}) {
  return showModalBottomSheet<AreaOption>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    showDragHandle: true,
    builder: (_) => AreaSheet(level: level, options: options, selected: selected),
  );
}

/// The content of the area sheet (public so the layout tests can show it on its own).
class AreaSheet extends StatefulWidget {
  const AreaSheet({super.key, required this.level, required this.options, this.selected});
  final String level;
  final List<AreaOption> options;
  final AreaDto? selected;

  @override
  State<AreaSheet> createState() => _AreaSheetState();
}

class _AreaSheetState extends State<AreaSheet> {
  static const _searchFrom = 8;
  String _q = '';

  @override
  Widget build(BuildContext context) {
    final s = Strings.of(context);
    final lang = s.lang;
    final q = foldAreaName(_q);
    final shown = [
      for (final o in widget.options)
        if (q.isEmpty || foldAreaName(o.area.nameFor(lang)).contains(q) || o.area.isCalled(_q)) o,
    ];
    // Served areas first, keeping the server's order inside each group; a district groups its communes.
    shown.sort((a, b) {
      if (a.area.selectable != b.area.selectable) return a.area.selectable ? -1 : 1;
      return 0;
    });
    final rows = <Widget>[];
    String? lastGroup;
    for (final o in shown) {
      final g = o.group;
      if (g != null && g.id != lastGroup) {
        lastGroup = g.id;
        rows.add(Padding(
          key: ValueKey('area-group-${g.id}'),
          padding: const EdgeInsets.fromLTRB(20, 14, 20, 4),
          child: Text(g.nameFor(lang), style: const TextStyle(color: AppColors.muted, fontSize: 12.5, fontWeight: FontWeight.w700)),
        ));
      }
      rows.add(_row(s, lang, o.area, o));
    }
    return ConstrainedBox(
      constraints: BoxConstraints(maxHeight: MediaQuery.of(context).size.height * 0.8),
      child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 8),
          child: Text(s.areaSheetTitle(widget.level), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 17)),
        ),
        if (widget.options.length > _searchFrom)
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
            child: TextField(
              key: const ValueKey('area-search'),
              // Place names: the keyboard must not "correct" Masina to something else.
              autocorrect: false,
              enableSuggestions: false,
              onChanged: (v) => setState(() => _q = v),
              decoration: InputDecoration(hintText: s.areaSearch, prefixIcon: const Icon(Icons.search_rounded, size: 20), isDense: true),
            ),
          ),
        Flexible(
          child: rows.isEmpty
              ? Padding(
                  padding: const EdgeInsets.all(24),
                  child: Text(s.areaNoneFound, key: const ValueKey('area-none'), textAlign: TextAlign.center, style: const TextStyle(color: AppColors.muted)),
                )
              : ListView(shrinkWrap: true, padding: const EdgeInsets.only(bottom: 16), children: rows),
        ),
      ]),
    );
  }

  Widget _row(Strings s, String lang, AreaDto a, AreaOption option) {
    final enabled = a.selectable;
    final chosen = widget.selected?.id == a.id;
    return InkWell(
      key: ValueKey('area-option-${a.id}'),
      onTap: enabled ? () => Navigator.pop(context, option) : null,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 13),
        child: Row(children: [
          Expanded(
            child: Text(a.nameFor(lang),
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(fontSize: 15, fontWeight: chosen ? FontWeight.w800 : FontWeight.w600, color: enabled ? AppColors.ink : AppColors.faint)),
          ),
          const SizedBox(width: 8),
          if (chosen)
            const Icon(Icons.check_rounded, color: AppColors.primary, size: 20)
          else if (!enabled)
            Pill(s.areaComingSoon,
                key: ValueKey('area-soon-${a.id}'), color: AppColors.background, textColor: AppColors.muted, fontSize: 10.5),
        ]),
      ),
    );
  }
}
