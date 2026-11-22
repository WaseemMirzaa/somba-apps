// UI texts for the wallet switch (`walletEnabled` off): the same sentences as the ones that name the wallet, worded without it.
// key -> (English, French); placeholders are written {name}. `kWalletOffKeys` maps an ordinary key to its wallet-off twin:
// `Strings.t` reads the twin while the wallet is switched off, so no screen has to know about the switch.
// ignore_for_file: prefer_single_quote_strings

/// ordinary key -> wallet-off key
const Map<String, String> kWalletOffKeys = {
  'faq_pay_a': 'faq_pay_a_off',
  'delacc_b1': 'delacc_b1_off',
  'return_refund_note': 'return_refund_note_off',
  'order_cancel_refund': 'order_cancel_refund_off',
  'line_refunded_wallet': 'line_refunded_off',
  'as_refund_wallet': 'as_refund_back_off',
  'as_ex_diff_pay': 'as_ex_diff_pay_off',
  'as_ex_diff_refund': 'as_ex_diff_refund_off',
  'as_ex_paid': 'as_ex_paid_off',
  'as_ex_returned': 'as_ex_returned_off',
  'as_ex_will_refund': 'as_ex_will_refund_off',
  'as_ex_refunded': 'as_ex_refunded_off',
};

const Map<String, (String, String)> kMessagesWalletOff = {
  'wallet_off': ('The wallet is not available right now.', 'Le portefeuille n’est pas disponible pour le moment.'),
  'faq_pay_a_off': (
    'Airtel Money, Orange Money and Vodacom M-Pesa. You approve mobile-money payments on your phone.',
    'Airtel Money, Orange Money et Vodacom M-Pesa. Vous validez les paiements mobile money sur votre téléphone.'
  ),
  'delacc_b1_off': (
    'The account can’t be deleted while it still holds a balance: ask support to pay it out',
    'Le compte ne peut pas être supprimé tant qu’il contient un solde : demandez à l’assistance de vous le verser'
  ),
  'return_refund_note_off': ('If approved, the refund is paid back to you.', 'Si votre demande est acceptée, le remboursement vous est reversé.'),
  'order_cancel_refund_off': ('You will be refunded.', 'Vous serez remboursé.'),
  'line_refunded_off': ('Refunded {amount}', '{amount} remboursés'),
  'as_refund_back_off': ('{amount} refunded', '{amount} remboursés'),
  'as_ex_diff_pay_off': (
    'Price difference: {amount} more. Paying a price difference is not available right now: choose an item of the same price or less.',
    'Différence de prix : {amount} de plus. Payer une différence de prix n’est pas disponible pour le moment : choisissez un article du même prix ou moins cher.'
  ),
  'as_ex_diff_refund_off': (
    'Price difference: {amount} back. It is refunded to you when the new item is delivered.',
    'Différence de prix : {amount} en moins. Ce montant vous est remboursé à la livraison du nouvel article.'
  ),
  'as_ex_paid_off': ('{amount} was held when you sent the request.', '{amount} ont été retenus à l’envoi de la demande.'),
  'as_ex_returned_off': ('{amount} was returned to you.', '{amount} vous ont été rendus.'),
  'as_ex_will_refund_off': ('{amount} will be refunded when the new item is delivered.', '{amount} seront remboursés à la livraison du nouvel article.'),
  'as_ex_refunded_off': ('{amount} was refunded.', '{amount} ont été remboursés.'),
};
