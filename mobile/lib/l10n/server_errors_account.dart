import '../services/account_deletion.dart';
import 'strings.dart';

/// French for the refusal of `me:delete` (api/src/auth/account-deletion.service.ts): one English message that names every
/// reason ("You cannot delete your account yet." then one sentence per reason). The screen words the reasons itself from the
/// structured `blockers`; this is for the places that only have the message (a log line, the web, an older screen).
/// Each reason is turned back into a [DeletionBlocker] and worded by the same French texts; a reason this app does not
/// know leaves the whole message as the server wrote it.
const String kAccountBlockedIntro = 'You cannot delete your account yet. ';

final List<(RegExp, DeletionBlocker Function(RegExpMatch))> _reasons = [
  (RegExp(r'^Your wallet still holds \$([\d.,]+): spend it or ask support to pay it out first\.'), (m) => DeletionBlocker('wallet_balance', amountUsd: double.tryParse(m[1]!.replaceAll(',', '')))),
  (RegExp(r'^You have (\d+) orders? that (?:is|are) not finished yet: [^.]*?first\.'), (m) => DeletionBlocker('open_order', count: int.parse(m[1]!))),
  (RegExp(r'^You have (\d+) open return, exchange or replacement requests?: [^.]*?first\.'), (m) => DeletionBlocker('open_return', count: int.parse(m[1]!))),
  (RegExp(r'^You have (\d+) open disputes? about an order: [^.]*?first\.'), (m) => DeletionBlocker('open_dispute', count: int.parse(m[1]!))),
  (RegExp(r'^You have (\d+) open support requests? about an order: [^.]*?first\.'), (m) => DeletionBlocker('open_ticket', count: int.parse(m[1]!))),
  (RegExp(r'^A payout to you is still being processed: wait until it is paid first\.'), (m) => const DeletionBlocker('pending_payout')),
  (RegExp(r'^A refund to your phone or card is still on its way: wait until it arrives first\.'), (m) => const DeletionBlocker('pending_refund')),
  (RegExp(r'^A wallet top-up is still waiting for your approval: wait until it completes or fails first\.'), (m) => const DeletionBlocker('pending_topup')),
];

/// The French of a deletion refusal, or null when [raw] is not one (or holds a reason this app does not know).
String? translateAccountBlocked(String raw) {
  final text = raw.trim();
  if (!text.startsWith(kAccountBlockedIntro)) return null;
  var rest = text.substring(kAccountBlockedIntro.length).trim();
  const fr = Strings('fr');
  final out = <String>[];
  while (rest.isNotEmpty) {
    DeletionBlocker? found;
    var length = 0;
    for (final (re, build) in _reasons) {
      final m = re.firstMatch(rest);
      if (m != null) {
        found = build(m);
        length = m.end;
        break;
      }
    }
    if (found == null) return null;
    out.add(fr.delaccBlocker(found));
    rest = rest.substring(length).trim();
  }
  return out.isEmpty ? null : 'Vous ne pouvez pas encore supprimer votre compte. ${out.join(' ')}';
}
