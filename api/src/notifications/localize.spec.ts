import { frenchNotice, localizeNotice, localizeWalletDescription, methodFr, moneyFr, translateReason } from './localize';

const fr = (title: string, body: string) => localizeNotice(title, body, 'fr');

describe('localizeNotice', () => {
  it('only translates for French', () => {
    for (const locale of ['en', 'de', '', null, undefined]) {
      expect(localizeNotice('Order placed', 'We received SOM-1.', locale)).toBeNull();
    }
  });

  it('returns null when neither the title nor the body is known', () => {
    expect(fr('Welcome', 'Hello there')).toBeNull();
    expect(fr('', '')).toBeNull();
  });

  it('keeps the unknown half of a partial match as received', () => {
    expect(fr('Support reply', 'SOM-1: the box is on its way')).toEqual({ title: 'Réponse de l’assistance', body: 'SOM-1: the box is on its way' });
    expect(fr('Hello', 'SOM-1001 was cancelled.')).toEqual({ title: 'Hello', body: 'SOM-1001 a été annulée.' });
  });

  describe('titles', () => {
    it.each([
      // The customer app's own table
      ['Approve your payment', 'Validez votre paiement'],
      ['Order placed', 'Commande enregistrée'],
      ['Order cancelled', 'Commande annulée'],
      ['Order update', 'Mise à jour de la commande'],
      ['Rider assigned', 'Livreur assigné'],
      ['Parcel at our warehouse', 'Colis à notre entrepôt'],
      ['Delivery update', 'Suivi de la livraison'],
      ['Delivery attempt failed', 'Échec de la livraison'],
      ['Payment', 'Paiement'],
      ['Payment received', 'Paiement reçu'],
      ['Payment failed', 'Paiement échoué'],
      ['Refund issued', 'Remboursement effectué'],
      ['Refund sent', 'Remboursement envoyé'],
      ['Return requested', 'Retour demandé'],
      ['Return received', 'Retour reçu'],
      ['Dispute opened', 'Litige ouvert'],
      ['Dispute resolved', 'Litige résolu'],
      ['Dispute closed', 'Litige clôturé'],
      ['Exchange requested', 'Échange demandé'],
      ['Replacement requested', 'Remplacement demandé'],
      // Sent to riders, sellers and staff
      ['New order', 'Nouvelle commande'],
      ['New delivery available', 'Nouvelle livraison disponible'],
      ['New delivery assigned to you', 'Nouvelle livraison qui vous est assignée'],
      ['Seller package ready', 'Colis vendeur prêt'],
      ['Return resolved', 'Retour résolu'],
      ['Return closed', 'Retour clôturé'],
      ['Payout paid', 'Versement effectué'],
      ['Product awaiting review', 'Produit en attente de modération'],
      ['Plan activated', 'Abonnement activé'],
      ['Test notification', 'Notification de test'],
    ])('%s → %s', (en, french) => {
      expect(fr(en, '')?.title).toBe(french);
    });

    it.each([
      ['Exchange approved', 'Échange approuvé'],
      ['Exchange rejected', 'Échange refusé'],
      ['Exchange completed', 'Échange terminé'],
      ['Exchange received', 'Échange reçu'],
      ['Exchange ready', 'Échange prêt'],
      ['Exchange dispatched', 'Échange expédié'],
      ['Replacement allocated', 'Remplacement attribué'],
      ['Replacement dispatched', 'Remplacement expédié'],
      ['Exchange mystery', 'Échange mystery'],
      ['Campaign scheduled', 'Campagne programmée'],
      ['Campaign active', 'Campagne active'],
      ['Campaign pending', 'Campagne en attente'],
      ['Campaign rejected', 'Campagne refusée'],
      ['Store approved', 'Boutique approuvée'],
      ['Store suspended', 'Boutique suspendue'],
      ['Store pending', 'Boutique en attente'],
      ['3 deliveries assigned to you', '3 livraisons qui vous sont assignées'],
    ])('pattern: %s → %s', (en, french) => {
      expect(fr(en, '')?.title).toBe(french);
    });
  });

  // Every regex of the customer app's notification_text.dart, with the French it produces.
  describe('bodies from the customer app', () => {
    it.each([
      ['SOM-1 reached the Somba&Teka warehouse and will be on its way soon.', 'SOM-1 est arrivé à l’entrepôt Somba&Teka et sera bientôt en route.'],
      ['Approve the airtel money request on your phone to confirm SOM-1.', 'Validez la demande Airtel Money sur votre téléphone pour confirmer SOM-1.'],
      ['Approve the vodacom_mpesa request on your phone to confirm SOM-1.', 'Validez la demande Vodacom M-Pesa sur votre téléphone pour confirmer SOM-1.'],
      ["We received SOM-1. You'll get updates here in real time.", 'Nous avons reçu SOM-1. Vous recevrez les mises à jour ici en temps réel.'],
      ['SOM-1 is now out for delivery.', 'SOM-1 est maintenant en cours de livraison.'],
      ['SOM-1 is now shipped.', 'SOM-1 est maintenant expédiée.'],
      ['SOM-1 is now delivered.', 'SOM-1 est maintenant livrée.'],
      ['SOM-1 is now somewhere.', 'SOM-1 est maintenant somewhere.'],
      ['SOM-1 was cancelled. Refund credited to your wallet.', 'SOM-1 a été annulée. Le remboursement a été crédité sur votre portefeuille.'],
      ['SOM-1 was cancelled. $5.00 was refunded to your wallet.', 'SOM-1 a été annulée. 5,00\u00A0$ ont été remboursés sur votre portefeuille.'],
      ['SOM-1 was cancelled.', 'SOM-1 a été annulée.'],
      ['SOM-1 was cancelled: Declined by subscriber..', 'SOM-1 a été annulée : Refusé par l’abonné..'],
      ['SOM-1 was cancelled: payment was not completed.', 'SOM-1 a été annulée : le paiement n’a pas abouti.'],
      ['SOM-1 was cancelled: out of stock.', 'SOM-1 a été annulée : out of stock.'],
      ['Amadou is handling SOM-1.', 'Amadou s’occupe de SOM-1.'],
      [
        'SOM-1: Customer unreachable. We will try again (attempt 1 of 3). You can also cancel the order.',
        'SOM-1 : Client injoignable. Nous allons réessayer (tentative 1 sur 3). Vous pouvez aussi annuler la commande.',
      ],
      [
        'SOM-1 could not be delivered after 3 attempts (no one home). $9.99 was refunded to your wallet.',
        'SOM-1 n’a pas pu être livrée après 3 tentatives (no one home). 9,99\u00A0$ ont été remboursés sur votre portefeuille.',
      ],
      ['SOM-1 could not be delivered after 3 attempts (no one home).', 'SOM-1 n’a pas pu être livrée après 3 tentatives (no one home).'],
      [
        'SOM-1 could not be delivered after 3 attempts (no one home). Your payment was refunded to your wallet.',
        'SOM-1 n’a pas pu être livrée après 3 tentatives (no one home). Votre paiement a été remboursé sur votre portefeuille.',
      ],
      ['$25.00 added to your wallet.', '25,00\u00A0$ ajoutés à votre portefeuille.'],
      ['Payment for SOM-1 confirmed.', 'Le paiement de SOM-1 est confirmé.'],
      ['$7.50 for SOM-1 → wallet.', '7,50\u00A0$ pour SOM-1 → portefeuille.'],
      ['$7.50 for SOM-1.', '7,50\u00A0$ pour SOM-1.'],
      ['$7.50 for SOM-1 is on its way back to your mobile-money number.', '7,50\u00A0$ pour SOM-1 reviennent sur votre numéro mobile money.'],
      ['$7.50 for SOM-1 was sent to your mobile-money number.', '7,50\u00A0$ pour SOM-1 ont été envoyés sur votre numéro mobile money.'],
      [
        '$7.50 for SOM-1 → wallet (the network could not take it back to your phone).',
        '7,50\u00A0$ pour SOM-1 → portefeuille (le réseau n’a pas pu les renvoyer sur votre téléphone).',
      ],
      ['RET-1: we received your goods. Your request is being reviewed.', 'RET-1 : nous avons reçu vos articles. Votre demande est en cours d’examen.'],
    ])('%s', (en, french) => {
      expect(fr('', en)?.body).toBe(french);
    });
  });

  describe('bodies the app did not cover', () => {
    it.each([
      ['Order cancelled', 'SOM-1 was cancelled by Somba&Teka support: fraud check.', 'SOM-1 a été annulée par l’assistance Somba&Teka : fraud check.'],
      [
        'Order cancelled',
        'SOM-1 was cancelled by Somba&Teka support: no stock. Sorry. $12.00 was refunded to your wallet.',
        'SOM-1 a été annulée par l’assistance Somba&Teka : no stock. Sorry. 12,00\u00A0$ ont été remboursés sur votre portefeuille.',
      ],
      ['Order cancelled', 'SOM-1 was cancelled (Customer refused). Do not pack it.', 'SOM-1 a été annulée (Le client a refusé). Ne la préparez pas.'],
      ['Order cancelled', 'SOM-1 was cancelled by the customer. Do not pack it.', 'SOM-1 a été annulée par le client. Ne la préparez pas.'],
      ['Order cancelled', 'SOM-1 was cancelled by Somba&Teka. Do not pack it.', 'SOM-1 a été annulée par Somba&Teka. Ne la préparez pas.'],
      ['Delivery update', 'SOM-1 is now in your deliveries.', 'SOM-1 est maintenant dans vos livraisons.'],
      ['New order', 'SOM-1 · $40.00 from Jean Mukendi', 'SOM-1 · 40,00\u00A0$ de Jean Mukendi'],
      ['New order', 'SOM-1: 3 item(s) to pack — $40.00', 'SOM-1 : 3 article(s) à préparer — 40,00\u00A0$'],
      ['New delivery available', 'SOM-1 · collect $40.00 cash. Open the app to accept it.', 'SOM-1 · à encaisser : 40,00\u00A0$ en espèces. Ouvrez l’application pour l’accepter.'],
      ['New delivery available', 'SOM-1. Open the app to accept it.', 'SOM-1. Ouvrez l’application pour l’accepter.'],
      ['3 deliveries assigned to you', 'SOM-1, SOM-2, SOM-3 — collect them at the warehouse.', 'SOM-1, SOM-2, SOM-3 — à récupérer à l’entrepôt.'],
      ['Parcel ready for pickup', 'SOM-1 is packed and ready.', 'SOM-1 : colis emballé et prêt.'],
      [
        'Seller package ready',
        "SOM-1: one seller's package is ready, waiting for 1 more seller.",
        'SOM-1 : le colis d’un vendeur est prêt, en attente de 1 autre vendeur.',
      ],
      [
        'Item cancelled by the seller',
        'SOM-1: Sneakers, Hat was cancelled (out of stock). $12.00 was refunded to your wallet. The rest of your order continues.',
        'SOM-1 : Sneakers, Hat a été annulé (out of stock). 12,00\u00A0$ ont été remboursés sur votre portefeuille. Le reste de votre commande continue.',
      ],
      ['Payment', 'PAY-1 · airtel_money · $40.00 · pending', 'PAY-1 · Airtel Money · 40,00\u00A0$ · en attente'],
      ['Payment', 'PAY-1 · stripe_card · $40.00 · succeeded', 'PAY-1 · carte bancaire · 40,00\u00A0$ · réussi'],
      ['Payment', 'PAY-1 · cod · $40.00 · pending', 'PAY-1 · paiement à la livraison · 40,00\u00A0$ · en attente'],
      ['Payment failed', 'Payment was not approved.', 'Le paiement n’a pas été validé.'],
      ['Payment failed', 'Insufficient wallet balance.', 'Solde du portefeuille insuffisant.'],
      [
        'Payment failed',
        'The mobile-money network refused the payment: Invalid number',
        'Le réseau mobile money a refusé le paiement : Invalid number',
      ],
      ['Payment received', 'Payment for your Pro seller plan confirmed.', 'Le paiement de votre abonnement vendeur Pro est confirmé.'],
      [
        'Phone refund failed',
        "PAY-1: pawaPay could not refund $9.00 (no funds). It was credited to the customer's wallet.",
        'PAY-1 : pawaPay n’a pas pu rembourser 9,00\u00A0$ (no funds). Le montant a été crédité sur le portefeuille du client.',
      ],
      ['Payout paid', 'PO-1 · $40.00 credited to your wallet.', 'PO-1 · 40,00\u00A0$ crédités sur votre portefeuille.'],
      ['Payout paid', 'PO-1 · $40.00 sent to your bank account (ref B-7).', 'PO-1 · 40,00\u00A0$ envoyés sur votre compte bancaire (réf. B-7).'],
      ['Payout paid', 'PO-1 · $40.00 sent to your mobile-money number (receipt R-9).', 'PO-1 · 40,00\u00A0$ envoyés sur votre numéro mobile money (reçu R-9).'],
      ['Payout on its way', 'PO-1 · $40.00 is being sent to your mobile-money number.', 'PO-1 · 40,00\u00A0$ en cours d’envoi sur votre numéro mobile money.'],
      [
        'pawaPay payout failed',
        'PO-1 · TechZone: the transfer failed. It is back in the queue.',
        'PO-1 · TechZone : le transfert a échoué. Il est de nouveau dans la file d’attente.',
      ],
      ['Return received', 'RET-1: we received your goods. Your request is being reviewed.', 'RET-1 : nous avons reçu vos articles. Votre demande est en cours d’examen.'],
      ['Returned goods received', 'RET-1 · SOM-1: the warehouse received the returned goods.', 'RET-1 · SOM-1 : l’entrepôt a reçu les articles retournés.'],
      ['Dispute resolved', 'DP-1: Refunded to wallet', 'DP-1 : Remboursé sur le portefeuille'],
      ['Return resolved', 'RET-1 · SOM-1: Resolved', 'RET-1 · SOM-1 : Résolu'],
      ['Dispute closed', 'DP-1: Rejected', 'DP-1 : Refusé'],
      ['Dispute closed', 'DP-1: The goods were used', 'DP-1: The goods were used'],
      ['The seller replied to your review', 'Your review: Thanks for the feedback!', 'Votre avis : Thanks for the feedback!'],
      ['Campaign withdrawn', 'A seller withdrew "Spring Sale".', 'Un vendeur a retiré « Spring Sale ».'],
      ['New campaign request', 'Spring Sale · 12.5% off', 'Spring Sale · 12.5 % de réduction'],
      ['Campaign started', '"Spring Sale" is now live.', '« Spring Sale » est maintenant en ligne.'],
      ['Campaign ended', '"Promo" reached its end date; prices are back to normal.', '« Promo » a atteint sa date de fin ; les prix sont revenus à la normale.'],
      ['Campaign rejected', '"Promo" is now rejected.', '« Promo » est maintenant refusée.'],
      ['Plan activated', 'Your Pro plan is active until 2026-11-24.', 'Votre abonnement Pro est actif jusqu’au 24/11/2026.'],
      ['Store suspended', 'Your store "Fashion Hub" is now suspended. Reason: Policy breach', 'Votre boutique « Fashion Hub » est maintenant suspendue. Motif : Policy breach'],
      ['Store approved', 'Your store "Fashion Hub" is now approved.', 'Votre boutique « Fashion Hub » est maintenant approuvée.'],
      ['Product awaiting review', 'Sneakers from a seller needs moderation.', 'Sneakers de un vendeur doit être modéré.'],
      [
        'Product awaiting review',
        'Sneakers was edited by TechZone and needs moderation again.',
        'Sneakers a été modifié par TechZone et doit être modéré à nouveau.',
      ],
      ['Changes under review', 'Your changes to Sneakers are being reviewed', 'Vos modifications de Sneakers sont en cours d’examen.'],
      ['Product approved', 'Sneakers is now live.', 'Sneakers est maintenant en ligne.'],
      ['Product rejected', 'Sneakers is now rejected.', 'Sneakers est maintenant refusé.'],
      ['Product updated', 'Sneakers is now removed.', 'Sneakers est maintenant retiré.'],
    ])('%s: %s', (title, en, french) => {
      expect(fr(title, en)?.body).toBe(french);
    });

    it('does not mistake a one-word campaign or product name for an order reference', () => {
      expect(fr('', '"Promo" is now active.')?.body).toBe('« Promo » est maintenant active.');
      expect(fr('', 'Sneakers is now live.')?.body).toBe('Sneakers est maintenant en ligne.');
      expect(fr('', 'SOM-1 is now pending.')?.body).toBe('SOM-1 est maintenant en attente.');
    });

    it('leaves a bare body alone unless it is a failed-payment reason', () => {
      expect(fr('Support reply', 'Other')?.body).toBe('Other');
      expect(fr('Payment failed', 'Other')?.body).toBe('Autre');
    });

    it('keeps free text inside a message intact (quotes, dots, line breaks)', () => {
      expect(fr('', 'Your review: Line one.\nLine two "quoted".')?.body).toBe('Votre avis : Line one.\nLine two "quoted".');
      expect(fr('', 'Your store "A "B" C" is now rejected. Reason: Too many.\nSee policy.')?.body).toBe(
        'Votre boutique « A "B" C » est maintenant refusée. Motif : Too many.\nSee policy.',
      );
    });
  });
});

describe('helpers', () => {
  it('names payment methods', () => {
    expect(methodFr('airtel_money')).toBe('Airtel Money');
    expect(methodFr('orange money')).toBe('Orange Money');
    expect(methodFr('vodacom_mpesa')).toBe('Vodacom M-Pesa');
    expect(methodFr('card')).toBe('carte bancaire');
    expect(methodFr('some_new_network')).toBe('some new network');
  });

  it('translates the reasons the server attaches', () => {
    expect(translateReason('Declined by subscriber.')).toBe('Refusé par l’abonné.');
    expect(translateReason('Timed out waiting for approval.')).toBe('Délai de validation dépassé.');
    expect(translateReason('Cancelled by customer.')).toBe('Annulé par le client.');
    expect(translateReason('Other: gate was locked')).toBe('Autre : gate was locked');
    expect(translateReason('something else')).toBe('something else');
  });
});

describe('frenchNotice', () => {
  it('prefers what the sender authored over the built-in translation', () => {
    const stored = { title: 'Order placed', body: 'We received SOM-1. You\'ll get updates here in real time.', titleFr: 'Sur mesure', bodyFr: 'Texte à moi' };
    expect(frenchNotice(stored)).toEqual({ title: 'Sur mesure', body: 'Texte à moi' });
  });

  it('falls back to the built-in translation, then to nothing', () => {
    expect(frenchNotice({ title: 'Order placed', body: 'x', titleFr: null, bodyFr: null })?.title).toBe('Commande enregistrée');
    expect(frenchNotice({ title: 'Big sale', body: 'Everything 20% off' })).toBeNull();
  });

  it('fills a missing authored half from the built-in translation', () => {
    expect(frenchNotice({ title: 'Order placed', body: 'SOM-1 was cancelled.', titleFr: null, bodyFr: 'Mon texte' })).toEqual({
      title: 'Commande enregistrée',
      body: 'Mon texte',
    });
  });
});

describe('localizeWalletDescription', () => {
  it.each([
    ['Order SOM-1', 'Commande SOM-1'],
    ['Wallet top-up via airtel_money', 'Recharge du portefeuille via Airtel Money'],
    ['Wallet top-up via orange_money', 'Recharge du portefeuille via Orange Money'],
    ['Wallet top-up via card', 'Recharge du portefeuille via carte bancaire'],
    ['Refund for cancelled order SOM-1', 'Remboursement de la commande annulée SOM-1'],
    ['Refund for SOM-1', 'Remboursement de SOM-1'],
    ['Refund for SOM-1 (phone refund failed)', 'Remboursement de SOM-1 (échec du remboursement mobile)'],
    ['Refund: seller cancelled part of SOM-1', 'Remboursement : le vendeur a annulé une partie de SOM-1'],
    ['Payout PO-1', 'Versement PO-1'],
    ['Seller plan pro', 'Abonnement vendeur pro'],
    ['Welcome store credit', 'Crédit de bienvenue'],
  ])('%s → %s', (en, french) => {
    expect(localizeWalletDescription(en, 'fr')).toBe(french);
  });

  it('returns unknown lines as received, and everything as is for other languages', () => {
    expect(localizeWalletDescription('Manual adjustment by finance', 'fr')).toBe('Manual adjustment by finance');
    expect(localizeWalletDescription('Order SOM-1', 'en')).toBe('Order SOM-1');
    expect(localizeWalletDescription('Order SOM-1', undefined)).toBe('Order SOM-1');
  });
});

describe('payment method names (English display names, and the ids older notices carry)', () => {
  it.each([
    ['Airtel Money', 'Airtel Money'],
    ['airtel_money', 'Airtel Money'],
    ['airtel money', 'Airtel Money'],
    ['Orange Money', 'Orange Money'],
    ['orange_money', 'Orange Money'],
    ['Vodacom M-Pesa', 'Vodacom M-Pesa'],
    ['vodacom_mpesa', 'Vodacom M-Pesa'],
    ['vodacom mpesa', 'Vodacom M-Pesa'],
    ['Card', 'carte bancaire'],
    ['stripe_card', 'carte bancaire'],
    ['Cash on delivery', 'paiement à la livraison'],
    ['cod', 'paiement à la livraison'],
    ['Wallet', 'portefeuille'],
    ['wallet', 'portefeuille'],
    ['Some New Network', 'Some New Network'],
    ['some_new_network', 'some new network'],
  ])('methodFr(%s) -> %s', (method, french) => {
    expect(methodFr(method)).toBe(french);
  });

  it.each([
    ['Airtel Money', 'Airtel Money'],
    ['Orange Money', 'Orange Money'],
    ['Vodacom M-Pesa', 'Vodacom M-Pesa'],
    ['airtel money', 'Airtel Money'], // a notice stored before the display names were used
    ['orange_money', 'Orange Money'],
  ])('the approve-on-your-phone notice for %s', (method, french) => {
    expect(fr('Approve your payment', `Approve the ${method} request on your phone to confirm SOM-1.`)).toEqual({
      title: 'Validez votre paiement',
      body: `Validez la demande ${french} sur votre téléphone pour confirmer SOM-1.`,
    });
  });

  it.each([
    ['PAY-1 · Airtel Money · $40.00 · pending', 'PAY-1 · Airtel Money · 40,00 $ · en attente'],
    ['PAY-1 · Vodacom M-Pesa · $40.00 · succeeded', 'PAY-1 · Vodacom M-Pesa · 40,00 $ · réussi'],
    ['PAY-1 · Cash on delivery · $40.00 · pending', 'PAY-1 · paiement à la livraison · 40,00 $ · en attente'],
    ['PAY-1 · Card · $1234.50 · succeeded', 'PAY-1 · carte bancaire · 1 234,50 $ · réussi'],
    ['PAY-1 · airtel_money · $40.00 · failed', 'PAY-1 · Airtel Money · 40,00 $ · échoué'], // legacy id
  ])('the finance "Payment" notice: %s', (en, french) => {
    expect(fr('Payment', en)?.body).toBe(french);
  });

  it.each([
    ['Wallet top-up via Airtel Money', 'Recharge du portefeuille via Airtel Money'],
    ['Wallet top-up via Orange Money', 'Recharge du portefeuille via Orange Money'],
    ['Wallet top-up via Vodacom M-Pesa', 'Recharge du portefeuille via Vodacom M-Pesa'],
    ['Wallet top-up via Card', 'Recharge du portefeuille via carte bancaire'],
    ['Wallet top-up via vodacom_mpesa', 'Recharge du portefeuille via Vodacom M-Pesa'], // lines stored earlier
  ])('wallet line: %s', (en, french) => {
    expect(localizeWalletDescription(en, 'fr')).toBe(french);
  });
});

describe('French money: 52,00 $ (comma decimals, non-breaking spaces)', () => {
  const NBSP = ' ';

  it.each([
    ['52.00', `52,00${NBSP}$`],
    ['0.50', `0,50${NBSP}$`],
    ['999.99', `999,99${NBSP}$`],
    ['1000.00', `1${NBSP}000,00${NBSP}$`],
    ['1234.50', `1${NBSP}234,50${NBSP}$`],
    ['12345.00', `12${NBSP}345,00${NBSP}$`],
    ['1234567.89', `1${NBSP}234${NBSP}567,89${NBSP}$`],
    ['12.5', `12,5${NBSP}$`],
    ['40', `40${NBSP}$`],
    ['not a number', `not a number${NBSP}$`],
  ])('moneyFr(%s) -> %s', (amount, french) => {
    expect(moneyFr(amount)).toBe(french);
  });

  it('formats numbers with two decimals', () => {
    expect(moneyFr(52)).toBe(`52,00${NBSP}$`);
    expect(moneyFr(1234.5)).toBe(`1${NBSP}234,50${NBSP}$`);
  });

  it('uses only a non-breaking space between the number and the sign, never a plain one or a dot', () => {
    const out = moneyFr('1234567.89');
    expect(out).not.toMatch(/ /); // no ordinary space
    expect(out).not.toContain('.');
    expect(out.endsWith(`${NBSP}$`)).toBe(true);
  });

  it.each([
    // the rider's "collect cash" notice (the reported case)
    ['SOM-1001 · collect $52.00 cash. Open the app to accept it.', `SOM-1001 · à encaisser : 52,00${NBSP}$ en espèces. Ouvrez l’application pour l’accepter.`],
    ['SOM-1001 · collect $1234.50 cash. Open the app to accept it.', `SOM-1001 · à encaisser : 1${NBSP}234,50${NBSP}$ en espèces. Ouvrez l’application pour l’accepter.`],
    ['SOM-1 · $0.50 from Jean', `SOM-1 · 0,50${NBSP}$ de Jean`],
    ['SOM-1: 3 item(s) to pack — $1500.00', `SOM-1 : 3 article(s) à préparer — 1${NBSP}500,00${NBSP}$`],
    ['$25.00 added to your wallet.', `25,00${NBSP}$ ajoutés à votre portefeuille.`],
    ['$7.50 for SOM-1.', `7,50${NBSP}$ pour SOM-1.`],
    ['SOM-1 was cancelled. $5.00 was refunded to your wallet.', `SOM-1 a été annulée. 5,00${NBSP}$ ont été remboursés sur votre portefeuille.`],
    ['PAY-1: provider reported $12.00, expected $1250.00. Review manually.', `PAY-1 : le prestataire a indiqué 12,00${NBSP}$, 1${NBSP}250,00${NBSP}$ attendus. À vérifier manuellement.`],
    ['PAY-1: pawaPay could not refund $9.00. It was credited to the customer\'s wallet.', `PAY-1 : pawaPay n’a pas pu rembourser 9,00${NBSP}$. Le montant a été crédité sur le portefeuille du client.`],
    ['PO-1 · $2000.00 credited to your wallet.', `PO-1 · 2${NBSP}000,00${NBSP}$ crédités sur votre portefeuille.`],
  ])('notice: %s', (en, french) => {
    expect(fr('', en)?.body).toBe(french);
  });

  it('never leaves a dot-decimal amount or a plain-space dollar sign in a French body', () => {
    const samples = [
      'SOM-1 · collect $52.00 cash. Open the app to accept it.',
      'SOM-1 · $12.50 from Jean',
      '$25.00 added to your wallet.',
      'PO-1 · $40.00 sent to your bank account (ref B-7).',
      'SOM-1: Sneakers was cancelled (out of stock). $12.00 was refunded to your wallet. The rest of your order continues.',
    ];
    for (const en of samples) {
      const body = fr('', en)!.body;
      expect(body).not.toMatch(/\d\.\d\d/);
      expect(body).not.toMatch(/\d \$/);
      expect(body).toMatch(/\d,\d\d \$/);
    }
  });
});
