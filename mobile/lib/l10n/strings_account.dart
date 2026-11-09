// Typed accessors for the texts in messages_account.dart (why an account cannot be deleted yet).
import '../services/account_deletion.dart';
import 'strings.dart';

extension StringsAccount on Strings {
  String get delaccBlockedTitle => t('delacc_blocked_title');
  String get delaccBlockedIntro => t('delacc_blocked_intro');
  String get delaccChecking => t('delacc_checking');
  String get delaccCtaWallet => t('delacc_cta_wallet');
  String get delaccCtaOrders => t('delacc_cta_orders');
  String get delaccCtaReturns => t('delacc_cta_returns');
  String get delaccCtaSupport => t('delacc_cta_support');

  /// The reason in words, with its count or amount filled in (`$204.00` / `204,00 $`).
  String delaccBlocker(DeletionBlocker b) {
    String pick(String base) => b.count == 1 ? t('${base}_one') : t('${base}_many', {'n': b.count});
    return switch (b.kind) {
      'wallet_balance' => t('delacc_blk_wallet', {'amount': usd(b.amountUsd ?? 0)}),
      'open_order' => pick('delacc_blk_order'),
      'open_return' => pick('delacc_blk_return'),
      'open_dispute' => pick('delacc_blk_dispute'),
      'open_ticket' => pick('delacc_blk_ticket'),
      'pending_payout' => t('delacc_blk_payout'),
      'pending_refund' => t('delacc_blk_refund'),
      _ => t('delacc_blk_topup'),
    };
  }
}
