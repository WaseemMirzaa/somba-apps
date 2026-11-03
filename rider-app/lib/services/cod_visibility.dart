import 'models.dart';

/// Cash on delivery in the rider app. COD is not offered (the public setting `codEnabled` is "false"), so nothing about
/// cash shows for a rider unless an administrator switches it on. The rider web portal follows the same rules
/// (`web/src/lib/rider-cod.ts`).

/// The public setting as the API sends it: the text "true" or "false" (or a real boolean).
bool parseCodEnabled(Object? raw) => raw == true || '$raw'.trim().toLowerCase() == 'true';

/// The cash card, the hand-over receipts and the cash note on "My work": only while COD is on.
bool showCashSummary(bool codEnabled) => codEnabled;

/// The "Collect $X" line and the cash prompt on one task. Normally only while COD is on. The one exception is an open task
/// that still has cash due (placed while COD was on): the server does not complete it without the amount, so the rider
/// has to see it and enter it.
bool showTaskCash(bool codEnabled, DeliveryTaskDto t) => t.collectsCash && (codEnabled || t.isActive);

/// "Already paid online, no cash to collect": a COD word, so it follows the setting too.
bool showPrepaidNote(bool codEnabled, DeliveryTaskDto t) => codEnabled && t.isActive && t.kind == LegKind.delivery && !t.collectsCash;
