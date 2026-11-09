// UI texts for: why an account cannot be deleted yet (shown before the customer confirms). key -> (English, French); placeholders are written {name}.
// The English sentences are the ones the server sends (api/src/auth/account-deletion.service.ts, blockerMessage).
// ignore_for_file: prefer_single_quote_strings

const Map<String, (String, String)> kMessagesAccount = {
  'delacc_blocked_title': ('You can’t delete your account yet', 'Vous ne pouvez pas encore supprimer votre compte'),
  'delacc_blocked_intro': ('Sort these out first, then come back:', 'Réglez d’abord ces points, puis revenez :'),
  'delacc_checking': ('Checking your account…', 'Vérification de votre compte…'),
  'delacc_cta_wallet': ('Open my wallet', 'Ouvrir mon portefeuille'),
  'delacc_cta_orders': ('See my orders', 'Voir mes commandes'),
  'delacc_cta_returns': ('See my returns', 'Voir mes retours'),
  'delacc_cta_support': ('Contact support', 'Contacter l’assistance'),
  'delacc_blk_wallet': (
    'Your wallet still holds {amount}: spend it or ask support to pay it out first.',
    'Votre portefeuille contient encore {amount} : dépensez-le ou demandez à l’assistance de vous le verser d’abord.'
  ),
  'delacc_blk_order_one': (
    'You have 1 order that is not finished yet: wait until it is delivered, or cancel it, first.',
    'Vous avez 1 commande qui n’est pas terminée : attendez qu’elle soit livrée, ou annulez-la, d’abord.'
  ),
  'delacc_blk_order_many': (
    'You have {n} orders that are not finished yet: wait until they are delivered, or cancel them, first.',
    'Vous avez {n} commandes qui ne sont pas terminées : attendez qu’elles soient livrées, ou annulez-les, d’abord.'
  ),
  'delacc_blk_return_one': (
    'You have 1 open return, exchange or replacement request: wait until it is completed first.',
    'Vous avez 1 demande de retour, d’échange ou de remplacement en cours : attendez qu’elle soit terminée d’abord.'
  ),
  'delacc_blk_return_many': (
    'You have {n} open return, exchange or replacement requests: wait until they are completed first.',
    'Vous avez {n} demandes de retour, d’échange ou de remplacement en cours : attendez qu’elles soient terminées d’abord.'
  ),
  'delacc_blk_dispute_one': (
    'You have 1 open dispute about an order: wait until it is resolved first.',
    'Vous avez 1 litige en cours au sujet d’une commande : attendez qu’il soit résolu d’abord.'
  ),
  'delacc_blk_dispute_many': (
    'You have {n} open disputes about an order: wait until they are resolved first.',
    'Vous avez {n} litiges en cours au sujet d’une commande : attendez qu’ils soient résolus d’abord.'
  ),
  'delacc_blk_ticket_one': (
    'You have 1 open support request about an order: wait until support closes it first.',
    'Vous avez 1 demande d’assistance en cours au sujet d’une commande : attendez que l’assistance la clôture d’abord.'
  ),
  'delacc_blk_ticket_many': (
    'You have {n} open support requests about an order: wait until support closes them first.',
    'Vous avez {n} demandes d’assistance en cours au sujet d’une commande : attendez que l’assistance les clôture d’abord.'
  ),
  'delacc_blk_payout': (
    'A payout to you is still being processed: wait until it is paid first.',
    'Un versement qui vous est destiné est encore en cours de traitement : attendez qu’il soit payé d’abord.'
  ),
  'delacc_blk_refund': (
    'A refund to your phone or card is still on its way: wait until it arrives first.',
    'Un remboursement vers votre téléphone ou votre carte est encore en route : attendez son arrivée d’abord.'
  ),
  'delacc_blk_topup': (
    'A wallet top-up is still waiting for your approval: wait until it completes or fails first.',
    'Une recharge du portefeuille attend encore votre validation : attendez qu’elle aboutisse ou échoue d’abord.'
  ),
};
