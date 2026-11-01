import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { localizeNotice } from './localize';

/**
 * Guards "French users never get English": reads the API sources, finds every notification title and body the
 * server sends through toUser / toRole / toUsers / toAdmins (and the helpers that forward to them), and fails,
 * listing them, when one has no French. A reworded English message therefore breaks the build until the
 * French pattern in localize.ts follows.
 */

const SRC = join(__dirname, '..');

/** Titles built with `${...}`: every value the placeholder can take, so each one is checked. */
const TITLE_TEMPLATES: Record<string, string[]> = {
  '{} resolved': ['Dispute resolved', 'Return resolved'],
  '{} closed': ['Dispute closed', 'Return closed'],
  'Exchange {}': ['requested', 'approved', 'received', 'ready', 'dispatched', 'delivered', 'rejected'].map((s) => `Exchange ${s}`),
  'Replacement {}': ['requested', 'approved', 'received', 'allocated', 'dispatched', 'delivered', 'rejected'].map((s) => `Replacement ${s}`),
  '{} reply': ['Dispute reply', 'Return reply'],
  'Campaign {}': ['draft', 'pending', 'scheduled', 'active', 'ended', 'rejected'].map((s) => `Campaign ${s}`),
  'Store {}': ['pending', 'approved', 'rejected', 'suspended'].map((s) => `Store ${s}`),
};

/**
 * Bodies with fixed English wording, as written in the sources (`${...}` shown as `{}`), each with realistic
 * instances and their French. Bodies that are only data (references, names, free text) need no entry.
 */
const BODY_CASES: Record<string, [sample: string, french: string][]> = {
  // Orders and deliveries
  'We received {}. You\'ll get updates here in real time.': [
    ["We received SOM-1001. You'll get updates here in real time.", 'Nous avons reçu SOM-1001. Vous recevrez les mises à jour ici en temps réel.'],
  ],
  'Approve the {} request on your phone to confirm {}.': [
    ['Approve the Airtel Money request on your phone to confirm SOM-1001.', 'Validez la demande Airtel Money sur votre téléphone pour confirmer SOM-1001.'],
    ['Approve the Orange Money request on your phone to confirm SOM-1001.', 'Validez la demande Orange Money sur votre téléphone pour confirmer SOM-1001.'],
    ['Approve the Vodacom M-Pesa request on your phone to confirm SOM-1001.', 'Validez la demande Vodacom M-Pesa sur votre téléphone pour confirmer SOM-1001.'],
    // a notice stored before the display names were used
    ['Approve the airtel money request on your phone to confirm SOM-1001.', 'Validez la demande Airtel Money sur votre téléphone pour confirmer SOM-1001.'],
  ],
  '{} is handling {}.': [['Amadou is handling SOM-1001.', 'Amadou s’occupe de SOM-1001.']],
  '{} reached the Somba&Teka warehouse and will be on its way soon.': [
    ['SOM-1001 reached the Somba&Teka warehouse and will be on its way soon.', 'SOM-1001 est arrivé à l’entrepôt Somba&Teka et sera bientôt en route.'],
  ],
  // The three-leg journey: warehouse desk, riders, sellers, routing alerts
  '{}: {} needs a rider.': [
    ['SOM-1001: pickup needs a rider.', 'SOM-1001 : tâche « enlèvement » à confier à un livreur.'],
    ['SOM-1001: transfer needs a rider.', 'SOM-1001 : tâche « transfert » à confier à un livreur.'],
    ['SOM-1001: delivery needs a rider.', 'SOM-1001 : tâche « livraison » à confier à un livreur.'],
    ['SOM-1001: return pickup needs a rider.', 'SOM-1001 : tâche « retour client » à confier à un livreur.'],
    ['SOM-1001: return transfer needs a rider.', 'SOM-1001 : tâche « transfert retour » à confier à un livreur.'],
    ['SOM-1001: return to seller needs a rider.', 'SOM-1001 : tâche « retour au vendeur » à confier à un livreur.'],
    ['SOM-1001: replacement delivery needs a rider.', 'SOM-1001 : tâche « livraison de remplacement » à confier à un livreur.'],
  ],
  '{}: {} is now in your tasks.': [
    ['SOM-1001: pickup is now in your tasks.', 'SOM-1001 : tâche « enlèvement » ajoutée à vos tâches.'],
    ['SOM-1001: return to seller is now in your tasks.', 'SOM-1001 : tâche « retour au vendeur » ajoutée à vos tâches.'],
  ],
  '{}: a rider will collect your package.': [['SOM-1001: a rider will collect your package.', 'SOM-1001 : un livreur viendra récupérer votre colis.']],
  '{}: your package reached the warehouse.': [['SOM-1001: your package reached the warehouse.', 'SOM-1001 : votre colis est arrivé à l’entrepôt.']],
  '{}: the delivery address has no map pin, so it was routed to {}.': [
    ['SOM-1001: the delivery address has no map pin, so it was routed to Limete Hub.', 'SOM-1001 : l’adresse de livraison n’a pas de repère sur la carte, la commande a été dirigée vers Limete Hub.'],
  ],
  '{}: no warehouse has an active rider, so it was routed to {}. Add riders there.': [
    ['SOM-1001: no warehouse has an active rider, so it was routed to Limete Hub. Add riders there.', 'SOM-1001 : aucun entrepôt n’a de livreur actif, la commande a été dirigée vers Limete Hub. Ajoutez-y des livreurs.'],
  ],
  '{}: 1 parcel to {} is now in your tasks.': [['TR-0042: 1 parcel to Entrepôt Limete is now in your tasks.', 'TR-0042 : 1 colis à destination d’Entrepôt Limete est ajouté à vos tâches.']],
  '{}: {} parcels to {} are now in your tasks.': [
    ['TR-0042: 18 parcels to Entrepôt Limete are now in your tasks.', 'TR-0042 : 18 colis à destination d’Entrepôt Limete sont ajoutés à vos tâches.'],
    ['TR-0042: 3 parcels to Kinshasa Hub are now in your tasks.', 'TR-0042 : 3 colis à destination de Kinshasa Hub sont ajoutés à vos tâches.'],
    // stored before the singular was used
    ['TR-0042: 18 parcel(s) to Entrepôt Limete are now in your tasks.', 'TR-0042 : 18 colis à destination d’Entrepôt Limete sont ajoutés à vos tâches.'],
  ],
  '{}: 1 parcel from {} is on its way to your warehouse.': [
    ['TR-0042: 1 parcel from Entrepôt Kinshasa is on its way to your warehouse.', 'TR-0042 : 1 colis en provenance d’Entrepôt Kinshasa est en route vers votre entrepôt.'],
  ],
  '{}: {} parcels from {} are on their way to your warehouse.': [
    ['TR-0042: 18 parcels from Entrepôt Kinshasa are on their way to your warehouse.', 'TR-0042 : 18 colis en provenance d’Entrepôt Kinshasa sont en route vers votre entrepôt.'],
    ['TR-0042: 18 parcel(s) from Entrepôt Kinshasa are on their way to your warehouse.', 'TR-0042 : 18 colis en provenance d’Entrepôt Kinshasa sont en route vers votre entrepôt.'],
  ],
  '{}: 1 parcel did not arrive from {} at {}.': [
    ['TR-0042: 1 parcel did not arrive from Entrepôt Kinshasa at Entrepôt Limete.', 'TR-0042 : 1 colis envoyé d’Entrepôt Kinshasa n’est pas arrivé à Entrepôt Limete.'],
  ],
  '{}: {} parcels did not arrive from {} at {}.': [
    ['TR-0042: 2 parcels did not arrive from Entrepôt Kinshasa at Entrepôt Limete.', 'TR-0042 : 2 colis envoyés d’Entrepôt Kinshasa ne sont pas arrivés à Entrepôt Limete.'],
    ['TR-0042: 2 parcel(s) did not arrive from Kinshasa Hub at Entrepôt Limete.', 'TR-0042 : 2 colis envoyés de Kinshasa Hub ne sont pas arrivés à Entrepôt Limete.'],
  ],
  '{}: no lane connects {} to {}, so the parcel goes direct.': [
    ['SOM-1001: no lane connects Entrepôt Limete to Entrepôt Kikwit, so the parcel goes direct.', 'SOM-1001 : aucune ligne ne relie Entrepôt Limete à Entrepôt Kikwit, le colis part en direct.'],
  ],
  '{}: {} has no active rider, so {} will handle it. Add riders to {}.': [
    [
      'SOM-1001: Entrepôt Limete has no active rider, so Entrepôt Kinshasa will handle it. Add riders to Entrepôt Limete.',
      'SOM-1001 : Entrepôt Limete n’a aucun livreur actif, Entrepôt Kinshasa s’en charge. Ajoutez des livreurs à Entrepôt Limete.',
    ],
  ],
  '{}: {} was scanned in but the next leg could not be created.': [
    ['SOM-1001: pickup was scanned in but the next leg could not be created.', 'SOM-1001 : tâche « enlèvement » scannée à l’entrepôt, mais l’étape suivante n’a pas pu être créée.'],
  ],
  '{}: {} failed after {} attempts ({}).': [
    ['SOM-1001: transfer failed after 3 attempts (Customer not reachable).', 'SOM-1001 : tâche « transfert » échouée après 3 tentatives (Client injoignable).'],
  ],
  '{} · ${} from {}': [['SOM-1001 · $12.50 from Jean Mukendi', 'SOM-1001 · 12,50\u00A0$ de Jean Mukendi']],
  '{}: {} item(s) to pack — ${}': [['SOM-1001: 2 item(s) to pack — $40.00', 'SOM-1001 : 2 article(s) à préparer — 40,00\u00A0$']],
  '{} is packed and ready.': [['SOM-1001 is packed and ready.', 'SOM-1001 : colis emballé et prêt.']],
  "{}: one seller's package is ready, waiting for {} more seller{}.": [
    ["SOM-1001: one seller's package is ready, waiting for 2 more sellers.", 'SOM-1001 : le colis d’un vendeur est prêt, en attente de 2 autres vendeurs.'],
    ["SOM-1001: one seller's package is ready, waiting for 1 more seller.", 'SOM-1001 : le colis d’un vendeur est prêt, en attente de 1 autre vendeur.'],
  ],
  '{}: {} was cancelled ({}).{} The rest of your order continues.': [
    [
      'SOM-1001: Sneakers was cancelled (Out of stock). $12.50 was refunded to your wallet. The rest of your order continues.',
      'SOM-1001 : Sneakers a été annulé (Out of stock). 12,50\u00A0$ ont été remboursés sur votre portefeuille. Le reste de votre commande continue.',
    ],
    [
      'SOM-1001: Sneakers was cancelled (Out of stock). The rest of your order continues.',
      'SOM-1001 : Sneakers a été annulé (Out of stock). Le reste de votre commande continue.',
    ],
  ],
  '{} was cancelled: {}.': [['SOM-1001 was cancelled: payment was not completed.', 'SOM-1001 a été annulée : le paiement n’a pas abouti.']],
  '{} was cancelled{}.{}': [
    [
      'SOM-1001 was cancelled by Somba&Teka support: Fraud check. $12.50 was refunded to your wallet.',
      'SOM-1001 a été annulée par l’assistance Somba&Teka : Fraud check. 12,50\u00A0$ ont été remboursés sur votre portefeuille.',
    ],
    ['SOM-1001 was cancelled.', 'SOM-1001 a été annulée.'],
    ['SOM-1001 was cancelled. $12.50 was refunded to your wallet.', 'SOM-1001 a été annulée. 12,50\u00A0$ ont été remboursés sur votre portefeuille.'],
  ],
  '{} was cancelled{}. Do not pack it.': [
    ['SOM-1001 was cancelled by the customer. Do not pack it.', 'SOM-1001 a été annulée par le client. Ne la préparez pas.'],
    ['SOM-1001 was cancelled by Somba&Teka. Do not pack it.', 'SOM-1001 a été annulée par Somba&Teka. Ne la préparez pas.'],
    ['SOM-1001 was cancelled (Fraud check). Do not pack it.', 'SOM-1001 a été annulée (Fraud check). Ne la préparez pas.'],
  ],
  '{}: {}. We will try again (attempt {} of {}). You can also cancel the order.': [
    [
      'SOM-1001: Customer not reachable. We will try again (attempt 2 of 3). You can also cancel the order.',
      'SOM-1001 : Client injoignable. Nous allons réessayer (tentative 2 sur 3). Vous pouvez aussi annuler la commande.',
    ],
  ],
  '{} could not be delivered after {} attempts ({}).{}': [
    [
      'SOM-1001 could not be delivered after 3 attempts (Wrong address). $12.50 was refunded to your wallet.',
      'SOM-1001 n’a pas pu être livrée après 3 tentatives (Adresse incorrecte). 12,50\u00A0$ ont été remboursés sur votre portefeuille.',
    ],
    [
      'SOM-1001 could not be delivered after 3 attempts (Wrong address).',
      'SOM-1001 n’a pas pu être livrée après 3 tentatives (Adresse incorrecte).',
    ],
  ],

  // Payments, refunds, payouts
  '${} added to your wallet.': [['$25.00 added to your wallet.', '25,00\u00A0$ ajoutés à votre portefeuille.']],
  'Payment for {} confirmed.': [['Payment for SOM-1001 confirmed.', 'Le paiement de SOM-1001 est confirmé.']],
  'Payment for your {} seller plan confirmed.': [['Payment for your Pro seller plan confirmed.', 'Le paiement de votre abonnement vendeur Pro est confirmé.']],
  '${} for {} → wallet.': [['$12.50 for SOM-1001 → wallet.', '12,50\u00A0$ pour SOM-1001 → portefeuille.']],
  '${} for {} is on its way back to your mobile-money number.': [
    ['$12.50 for SOM-1001 is on its way back to your mobile-money number.', '12,50\u00A0$ pour SOM-1001 reviennent sur votre numéro mobile money.'],
  ],
  '${} for {} was sent to your mobile-money number.': [
    ['$12.50 for SOM-1001 was sent to your mobile-money number.', '12,50\u00A0$ pour SOM-1001 ont été envoyés sur votre numéro mobile money.'],
  ],
  '${} for {} → wallet (the network could not take it back to your phone).': [
    [
      '$12.50 for SOM-1001 → wallet (the network could not take it back to your phone).',
      '12,50\u00A0$ pour SOM-1001 → portefeuille (le réseau n’a pas pu les renvoyer sur votre téléphone).',
    ],
  ],
  '{}: provider reported ${}, expected ${}. Review manually.': [
    ['PAY-1: provider reported $12.00, expected $12.50. Review manually.', 'PAY-1 : le prestataire a indiqué 12,00\u00A0$, 12,50\u00A0$ attendus. À vérifier manuellement.'],
  ],
  "{}: pawaPay could not refund ${}{}. It was credited to the customer's wallet.": [
    [
      "PAY-1: pawaPay could not refund $12.50 (Insufficient funds). It was credited to the customer's wallet.",
      'PAY-1 : pawaPay n’a pas pu rembourser 12,50\u00A0$ (Insufficient funds). Le montant a été crédité sur le portefeuille du client.',
    ],
    [
      "PAY-1: pawaPay could not refund $12.50. It was credited to the customer's wallet.",
      'PAY-1 : pawaPay n’a pas pu rembourser 12,50\u00A0$. Le montant a été crédité sur le portefeuille du client.',
    ],
  ],
  '{} · ${} {}.': [
    ['PO-1 · $40.00 credited to your wallet.', 'PO-1 · 40,00\u00A0$ crédités sur votre portefeuille.'],
    ['PO-1 · $40.00 sent to your bank account (ref B-77).', 'PO-1 · 40,00\u00A0$ envoyés sur votre compte bancaire (réf. B-77).'],
    ['PO-1 · $40.00 sent to your mobile-money number (ref M-77).', 'PO-1 · 40,00\u00A0$ envoyés sur votre numéro mobile money (réf. M-77).'],
  ],
  '{} · ${} sent to your mobile-money number{}.': [
    ['PO-1 · $40.00 sent to your mobile-money number (receipt R123).', 'PO-1 · 40,00\u00A0$ envoyés sur votre numéro mobile money (reçu R123).'],
    ['PO-1 · $40.00 sent to your mobile-money number.', 'PO-1 · 40,00\u00A0$ envoyés sur votre numéro mobile money.'],
  ],
  '{} · ${} is being sent to your mobile-money number.': [
    ['PO-1 · $40.00 is being sent to your mobile-money number.', 'PO-1 · 40,00\u00A0$ en cours d’envoi sur votre numéro mobile money.'],
  ],
  '{} · {}: {}. It is back in the queue.': [
    ['PO-1 · TechZone: the transfer failed. It is back in the queue.', 'PO-1 · TechZone : le transfert a échoué. Il est de nouveau dans la file d’attente.'],
  ],

  // Returns, disputes, reviews
  '{}: {}': [['Your review: Great, thanks!', 'Votre avis : Great, thanks!']],
  '{}: we received your goods. Your request is being reviewed.': [
    ['RET-1: we received your goods. Your request is being reviewed.', 'RET-1 : nous avons reçu vos articles. Votre demande est en cours d’examen.'],
  ],
  '{} · {}: the warehouse received the returned goods.': [
    ['RET-1 · SOM-1001: the warehouse received the returned goods.', 'RET-1 · SOM-1001 : l’entrepôt a reçu les articles retournés.'],
  ],

  // Sellers, products, campaigns
  'Your {} plan is active until {}.': [['Your Pro plan is active until 2026-11-24.', 'Votre abonnement Pro est actif jusqu’au 24/11/2026.']],
  'Your store "{}" is now {}.{}': [
    ['Your store "Fashion Hub" is now suspended. Reason: Policy breach', 'Votre boutique « Fashion Hub » est maintenant suspendue. Motif : Policy breach'],
    ['Your store "Fashion Hub" is now approved.', 'Votre boutique « Fashion Hub » est maintenant approuvée.'],
  ],
  'Your changes to {} are being reviewed': [['Your changes to Sneakers are being reviewed', 'Vos modifications de Sneakers sont en cours d’examen.']],
  '{} from {} needs moderation.': [
    ['Sneakers from TechZone needs moderation.', 'Sneakers de TechZone doit être modéré.'],
    ['Sneakers from a seller needs moderation.', 'Sneakers de un vendeur doit être modéré.'],
  ],
  '{} was edited by {} and needs moderation again.': [
    ['Sneakers was edited by TechZone and needs moderation again.', 'Sneakers a été modifié par TechZone et doit être modéré à nouveau.'],
  ],
  '{} withdrew "{}".': [['TechZone withdrew "Spring Sale".', 'TechZone a retiré « Spring Sale ».']],
  '{} · {}% off': [['Spring Sale · 15% off', 'Spring Sale · 15 % de réduction']],
  '"{}" reached its end date; prices are back to normal.': [
    ['"Spring Sale" reached its end date; prices are back to normal.', '« Spring Sale » a atteint sa date de fin ; les prix sont revenus à la normale.'],
  ],
  '"{}" is now live.': [['"Spring Sale" is now live.', '« Spring Sale » est maintenant en ligne.']],
  '"{}" is now {}.': [
    ['"Spring Sale" is now scheduled.', '« Spring Sale » est maintenant programmée.'],
    ['"Spring Sale" is now rejected.', '« Spring Sale » est maintenant refusée.'],
  ],
  '{} is now {}.': [
    ['SOM-1001 is now out for delivery.', 'SOM-1001 est maintenant en cours de livraison.'],
    ['SOM-1001 is now confirmed.', 'SOM-1001 est maintenant confirmée.'],
    ['Sneakers is now live.', 'Sneakers est maintenant en ligne.'],
    ['Sneakers is now rejected.', 'Sneakers est maintenant refusé.'],
  ],

  // Seller platform: team, security, storefront
  '{} invited you to join their store team ({}).': [
    ['TechZone invited you to join their store team (finance).', 'TechZone vous invite à rejoindre l’équipe de sa boutique (finances).'],
    ['TechZone invited you to join their store team (support).', 'TechZone vous invite à rejoindre l’équipe de sa boutique (support client).'],
  ],
  '{} joined your store team as {}.': [['Amina joined your store team as orders.', 'Amina a rejoint l’équipe de votre boutique en tant que commandes.']],
  'Your role in "{}" is now {}.': [['Your role in "TechZone" is now manager.', 'Votre rôle dans « TechZone » est maintenant : gestionnaire.']],
  'You no longer have access to "{}".': [['You no longer have access to "TechZone".', 'Vous n’avez plus accès à « TechZone ».']],
  '{} left your store team.': [['Amina left your store team.', 'Amina a quitté l’équipe de votre boutique.']],
  'Signing in to your account now asks for a code from your authenticator app.': [
    ['Signing in to your account now asks for a code from your authenticator app.', 'La connexion à votre compte demande maintenant un code de votre application d’authentification.'],
  ],
  'Two-factor authentication was turned off on your account.': [
    ['Two-factor authentication was turned off on your account.', 'L’authentification à deux facteurs a été désactivée sur votre compte.'],
  ],
  'Your store is open again and takes new orders.': [['Your store is open again and takes new orders.', 'Votre boutique est de nouveau ouverte et accepte les nouvelles commandes.']],
  'Your store badge is now {} (was {}).': [
    ['Your store badge is now gold (was silver).', 'Le badge de votre boutique est maintenant or (avant : argent).'],
    ['Your store badge is now somba_assured (was bronze).', 'Le badge de votre boutique est maintenant Somba Assuré (avant : bronze).'],
  ],

  // Stock, flash sales, campaign budget, invoices, bulk import (localize-commerce.ts)
  '{} is down to {} (alert at {}). Restock soon.': [
    ['Phone case (Size: M) is down to 4 (alert at 10). Restock soon.', 'Phone case (Size: M) : plus que 4 en stock (alerte à 10). Pensez à réapprovisionner.'],
  ],
  '{} is out of stock. Shoppers cannot buy it until you restock.': [
    ['Phone case is out of stock. Shoppers cannot buy it until you restock.', 'Phone case est en rupture de stock. Les clients ne peuvent plus l’acheter tant que vous ne réapprovisionnez pas.'],
  ],
  '{} from {} is out of stock.': [['Phone case from TechZone is out of stock.', 'Phone case de TechZone est en rupture de stock.']],
  '{} from {} is down to {}.': [['Phone case from TechZone is down to 4.', 'Phone case de TechZone : plus que 4 en stock.']],
  '"{}" used its ${} budget; prices are back to normal.': [
    ['"Spring Sale" used its $50.00 budget; prices are back to normal.', '« Spring Sale » a utilisé tout son budget de 50,00\u00A0$ ; les prix sont revenus à la normale.'],
  ],
  '"{}" was rejected: {}': [['"Spring Sale" was rejected: Discount too deep', '« Spring Sale » a été refusée : Discount too deep']],
  '{} goes on flash sale at ${} from {}.': [
    ['Phone case goes on flash sale at $4.50 from 2026-10-26 10:00 UTC.', 'Phone case passe en vente flash à 4,50\u00A0$ à partir du 26/10/2026 10:00 UTC.'],
  ],
  '{} is now on flash sale at ${}.': [['Phone case is now on flash sale at $4.50.', 'Phone case est maintenant en vente flash à 4,50\u00A0$.']],
  '{}: the flash sale has ended; the price is back to normal.': [
    ['Phone case: the flash sale has ended; the price is back to normal.', 'Phone case : la vente flash est terminée ; le prix est revenu à la normale.'],
  ],
  '{} proposes {} at ${}.': [['TechZone proposes Phone case at $4.50.', 'TechZone propose Phone case à 4,50\u00A0$.']],
  'Your flash sale for {} was approved.': [['Your flash sale for Phone case was approved.', 'Votre vente flash pour Phone case a été approuvée.']],
  'Your flash sale for {} was declined: {}': [
    ['Your flash sale for Phone case was declined: Price too close to normal', 'Votre vente flash pour Phone case a été refusée : Price too close to normal'],
  ],
  'Your commission invoice {} for {} is ready.': [
    ['Your commission invoice CI-202610-4F3A2B1C for 2026-10 is ready.', 'Votre facture de commission CI-202610-4F3A2B1C pour octobre 2026 est disponible.'],
  ],
  '{} products imported by {} need moderation.': [['12 products imported by TechZone need moderation.', '12 produits importés par TechZone sont à modérer.']],

  // Settings → "Send a test push"
  'Notifications reach this account. If push is set up, your devices show this too.': [
    [
      'Notifications reach this account. If push is set up, your devices show this too.',
      'Les notifications arrivent bien sur ce compte. Si les notifications push sont configurées, vos appareils affichent aussi celle-ci.',
    ],
  ],
};

// ── Reading the sources ──────────────────────────────────────────────────

function sourceFiles(dir = SRC): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === 'migrations' ? [] : sourceFiles(p);
    return p.endsWith('.ts') && !p.endsWith('.spec.ts') ? [p] : [];
  });
}

/** Index just past the quoted string or template literal that starts at `i`. */
function skipLiteral(src: string, i: number): number {
  const quote = src[i];
  for (i++; i < src.length; i++) {
    if (src[i] === '\\') i++;
    else if (src[i] === quote) return i + 1;
    else if (quote === '`' && src[i] === '$' && src[i + 1] === '{') i = skipBraces(src, i + 1) - 1;
  }
  return i;
}

/** Index just past the `{ ... }` that starts at `i`. */
function skipBraces(src: string, i: number): number {
  let depth = 0;
  for (; i < src.length; i++) {
    const c = src[i];
    if (c === "'" || c === '"' || c === '`') i = skipLiteral(src, i) - 1;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return i + 1;
  }
  return i;
}

/** Index where the expression that starts at `from` ends: its `,` or the bracket that closes the enclosing one. */
function exprEnd(src: string, from: number): number {
  let depth = 0;
  for (let i = from; i < src.length; i++) {
    const c = src[i];
    if (c === "'" || c === '"' || c === '`') i = skipLiteral(src, i) - 1;
    else if ('([{'.includes(c)) depth++;
    else if (')]}'.includes(c)) {
      if (depth-- === 0) return i;
    } else if (c === ',' && depth === 0) return i;
  }
  return src.length;
}

function callArgs(src: string, open: number): string[] {
  const args: string[] = [];
  let i = open + 1;
  for (;;) {
    while (/\s/.test(src[i] ?? ')')) i++;
    if (i >= src.length || src[i] === ')') return args;
    const end = exprEnd(src, i);
    args.push(src.slice(i, end).trim());
    i = src[end] === ',' ? end + 1 : end;
  }
}

/** The branches of `a ? b : c ? d : e` that are plain string literals (conditions are never titles). */
function literalBranches(expr: string): string[] {
  let q = -1;
  let colon = -1;
  let nested = 0;
  for (let i = 0, depth = 0; i < expr.length; i++) {
    const c = expr[i];
    if (c === "'" || c === '"' || c === '`') i = skipLiteral(expr, i) - 1;
    else if ('([{'.includes(c)) depth++;
    else if (')]}'.includes(c)) depth--;
    else if (depth === 0 && c === '?' && expr[i + 1] !== '.' && expr[i + 1] !== '?' && expr[i - 1] !== '?') {
      if (q < 0) q = i;
      else nested++;
    } else if (depth === 0 && c === ':' && q >= 0) {
      if (nested > 0) nested--;
      else {
        colon = i;
        break;
      }
    }
  }
  if (q < 0 || colon < 0) return /^(['"`])[\s\S]*\1$/.test(expr.trim()) ? [expr.trim()] : [];
  return [...literalBranches(expr.slice(q + 1, colon)), ...literalBranches(expr.slice(colon + 1))];
}

/** A literal's text with each top-level `${...}` shown as `{}`. */
function skeleton(literal: string): string {
  const quote = literal[0];
  const inner = literal.slice(1, -1);
  if (quote !== '`') return inner.replace(/\\(.)/g, '$1');
  let out = '';
  for (let i = 0; i < inner.length; i++) {
    if (inner[i] === '$' && inner[i + 1] === '{') {
      i = skipBraces(inner, i + 1) - 1;
      out += '{}';
    } else out += inner[i] === '\\' ? inner[++i] : inner[i];
  }
  return out;
}

/** The wording inside a literal's `${...}` parts (e.g. `${paid ? 'sent to your bank' : 'credited'}`). */
function nestedWording(literal: string): string {
  if (literal[0] !== '`') return '';
  const inner = literal.slice(1, -1);
  let out = '';
  for (let i = 0; i < inner.length; i++) {
    if (inner[i] === '\\') i++;
    else if (inner[i] === '$' && inner[i + 1] === '{') {
      const end = skipBraces(inner, i + 1);
      const expr = inner.slice(i + 2, end - 1);
      for (let j = 0; j < expr.length; j++) {
        if ("'\"`".includes(expr[j])) {
          const next = skipLiteral(expr, j);
          out += ` ${skeleton(expr.slice(j, next))} ${nestedWording(expr.slice(j, next))}`;
          j = next - 1;
        }
      }
      i = end - 1;
    }
  }
  return out;
}

const hasWords = (s: string) => /[A-Za-z]{3,}/.test(s.replace(/\{\}/g, ''));

interface Found {
  where: string;
  title: string[];
  body: string[];
}

/** Every title / body the server sends: `title:` and `body:` literals in files that call the notifier. */
function sentNotices(): Found[] {
  const found: Found[] = [];
  for (const file of sourceFiles()) {
    const src = readFileSync(file, 'utf8');
    if (!/(?<!emitter)\.(toUser|toRole|toUsers|toAdmins)\(/.test(src)) continue;
    const where = file.slice(SRC.length + 1);
    const title: string[] = [];
    const body: string[] = [];
    // A body that is only data (a reference, a name, free text) has nothing to translate.
    const addBody = (expr: string) =>
      body.push(...literalBranches(expr).filter((l) => hasWords(skeleton(l)) || hasWords(nestedWording(l))).map(skeleton));
    for (const key of ['title', 'body'] as const) {
      for (const m of src.matchAll(new RegExp(`\\b${key}:\\s*`, 'g'))) {
        const expr = src.slice(m.index! + m[0].length, exprEnd(src, m.index! + m[0].length)).trim();
        if (key === 'title') title.push(...literalBranches(expr).map(skeleton));
        else addBody(expr);
      }
    }
    // Helpers that forward their (title, body) arguments to the notifier.
    for (const [call, t, b] of [
      ['this.tellSellers(', 2, 3],
      ['this.notifySellers(', 1, 2],
    ] as const) {
      for (let at = src.indexOf(call); at >= 0; at = src.indexOf(call, at + 1)) {
        const args = callArgs(src, at + call.length - 1);
        title.push(...literalBranches(args[t] ?? '').map(skeleton));
        addBody(args[b] ?? '');
      }
    }
    found.push({ where, title, body });
  }
  return found;
}

describe('notification coverage (French)', () => {
  const notices = sentNotices();
  const titles = [...new Set(notices.flatMap((n) => n.title))].sort();
  const bodies = [...new Set(notices.flatMap((n) => n.body))].sort();

  it('finds the notices the server sends', () => {
    // A scanner that silently reads nothing would pass every other test here.
    expect(notices.length).toBeGreaterThan(10);
    expect(titles.length).toBeGreaterThan(50);
    expect(titles).toContain('Order placed');
    expect(bodies.length).toBeGreaterThan(30);
  });

  it('has a French title for every notification title the server sends', () => {
    const missing: string[] = [];
    for (const title of titles) {
      const values = title.includes('{}') ? TITLE_TEMPLATES[title] : [title];
      if (!values) {
        missing.push(`${title}   (a template: list its possible values in TITLE_TEMPLATES)`);
        continue;
      }
      for (const v of values) {
        const fr = localizeNotice(v, '', 'fr');
        if (!fr || fr.title === v) missing.push(v);
      }
    }
    expect(missing).toEqual([]);
  });

  it('has a French version for every notification body with fixed wording', () => {
    const missing = bodies.filter((b) => !BODY_CASES[b]);
    expect(missing).toEqual([]);
  });

  it.each(Object.entries(BODY_CASES).flatMap(([skeleton, cases]) => cases.map(([sample, french]) => [skeleton, sample, french])))(
    'translates the body %s: %s',
    (_skeleton, sample, french) => {
      expect(localizeNotice('', sample, 'fr')?.body).toBe(french);
    },
  );

  it('never writes a raw payment-method id ("airtel_money") into notification or wallet text', () => {
    const offenders: string[] = [];
    const rawMethod = /\b[A-Za-z.]*[Mm]ethod\b/;
    for (const file of sourceFiles()) {
      const src = readFileSync(file, 'utf8');
      const where = file.slice(SRC.length + 1);
      const check = (expr: string) => {
        if (expr.startsWith('{')) return; // a TypeScript parameter type (`body: { method?: string }`), not text
        // A comparison (`method === 'wallet'`) picks wording; only a method put into the sentence is a leak.
        if (rawMethod.test(expr) && !/paymentMethodLabel\(/.test(expr) && !/[!=]==/.test(expr)) offenders.push(`${where}: ${expr}`);
      };
      if (/(?<!emitter)\.(toUser|toRole|toUsers|toAdmins)\(/.test(src)) {
        for (const m of src.matchAll(/\bbody:\s*/g)) check(src.slice(m.index! + m[0].length, exprEnd(src, m.index! + m[0].length)));
      }
      for (const m of src.matchAll(/Wallet top-up via\s*\$\{([^}]*)\}/g)) check(m[1]);
    }
    expect(offenders).toEqual([]);
  });

  it('keeps no stale entries (every listed template and body is still sent)', () => {
    expect(Object.keys(TITLE_TEMPLATES).filter((t) => !titles.includes(t))).toEqual([]);
    expect(Object.keys(BODY_CASES).filter((b) => !bodies.includes(b))).toEqual([]);
  });
});
