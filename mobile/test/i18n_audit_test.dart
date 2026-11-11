// "Nothing untranslated" audit for the customer app, part 2 (see i18n_audit.dart for the method).
//
// The layout matrices (layout_matrix_*_test.dart) already report any text that is identical in English and French on
// the screens they pump. This file covers what they do not: screens the matrices skip (wishlist, coupons, receipt,
// splash, profile, account deletion), every list in its EMPTY state, and the helpers that turn server wording into the
// user's language (notices, wallet lines, reasons, variant options, server errors), with the shapes the server really
// sends. It fails on any non-allowlisted identical string, so a new hard-coded literal cannot slip in.
import 'package:flutter_test/flutter_test.dart';
import 'package:lipcart/data/market_profiles.dart';
import 'package:lipcart/data/shop_state.dart';
import 'package:lipcart/l10n/notification_text.dart';
import 'package:lipcart/l10n/server_errors.dart';
import 'package:lipcart/l10n/strings.dart';
import 'package:lipcart/screens/account_screen.dart';
import 'package:lipcart/screens/cart_screen.dart';
import 'package:lipcart/screens/more/account_more.dart';
import 'package:lipcart/screens/more/auth_screens.dart';
import 'package:lipcart/screens/more/browse.dart';
import 'package:lipcart/screens/more/catalog_extra.dart';
import 'package:lipcart/screens/more/chat_inbox.dart';
import 'package:lipcart/screens/more/order_after_sale.dart';
import 'package:lipcart/screens/more/returns_extra.dart';
import 'package:lipcart/screens/more/search_screen.dart';
import 'package:lipcart/screens/more/settings_extra.dart';
import 'package:lipcart/screens/more/support_extra.dart';
import 'package:lipcart/screens/orders_screen.dart';
import 'package:lipcart/screens/wallet_screen.dart';
import 'package:lipcart/services/models.dart';
import 'package:lipcart/services/realtime_store.dart';
import 'package:lipcart/util/format.dart';
import 'package:lipcart/util/variant_words.dart';

import 'gap_helpers.dart';
import 'matrix_helpers.dart';

OrderDto _order() => OrderDto.fromJson({
      'id': 'o1',
      'reference': 'SOM-1042',
      'customerName': 'Aline',
      'status': 'delivered',
      'paymentMethod': 'airtel_money',
      'subtotalUsd': 80,
      'deliveryFeeUsd': 3,
      'discountUsd': 0,
      'totalUsd': 83,
      'createdAt': '2026-10-24T09:30:00Z',
      'shippingAddress': '{"label":"Maison","line1":"12, avenue du Commerce","commune":"Gombe","city":"Kinshasa","phone":"+243812345678"}',
      'items': [
        {
          'productId': 'p1',
          'productName': 'Running shoes',
          'productNameFr': 'Chaussures de course',
          'qty': 2,
          'priceUsd': 40,
          // No variantFr: the phone words the known option names and colours itself.
          'variant': 'Size: 42 · Colour: Navy blue',
        },
      ],
    });

Future<void> _seedWithData(String lang) async {
  await gapReset(products: [gapDto('p1'), gapDto('p2', stock: 2)], lang: lang);
  marketNotifier.value = MarketProfileId.drc;
  final store = RealtimeStore.instance;
  store.user = gapUser(phone: '+243812345678');
  store.orders
    ..clear()
    ..add(_order());
  store.wishlistIds
    ..clear()
    ..addAll(['p1', 'p2']);
  store.debugCallRequest = (event, [body]) async => switch (event) {
        'promos:list' => [
            {'code': 'BIENVENUE', 'type': 'percent', 'value': 10, 'minOrder': 20, 'active': true},
            {'code': 'FIXE5', 'type': 'fixed', 'value': 5, 'minOrder': 0, 'active': true},
          ],
        _ => const <dynamic>[],
      };
}

Future<void> _seedEmpty(String lang) async {
  await gapReset(products: [gapDto('p1')], lang: lang);
  marketNotifier.value = MarketProfileId.drc;
  final store = RealtimeStore.instance;
  store.user = gapUser(phone: '+243812345678');
  store.orders.clear();
  store.wishlistIds.clear();
  store.notifications.clear();
  store.payments.clear();
  store.debugCallRequest = (event, [body]) async => const <dynamic>[];
}

void _tearDown() {
  RealtimeStore.instance
    ..debugCallRequest = null
    ..wishlistIds.clear()
    ..notifications.clear()
    ..payments.clear();
  ShopState.instance.cart.clear();
}

void main() {
  group('i18n audit: screens the matrices skip', () {
    registerLayoutMatrix(
      {
        'wishlist': (l) => WishlistScreen(locale: l),
        'coupons': (l) => CouponsScreen(locale: l),
        'splash': (l) => CustomerSplashScreen(onDone: () {}),
        'receipt': (l) => OrderReceiptScreen(order: _order()),
        'edit profile': (l) => CustomerEditProfileScreen(locale: l),
        'delete account': (l) => const AccountDeleteScreen(),
        'settings': (l) => CustomerSettingsScreen(locale: l),
        'account': (l) => AccountScreen(locale: l, onLocaleChanged: (_) {}),
        'order list': (l) => OrdersScreen(locale: l),
        'help': (l) => HelpScreen(locale: l),
      },
      seed: _seedWithData,
      tearDownFakes: _tearDown,
      buttonRules: false,
      i18nOnly: true,
    );
  });

  group('i18n audit: empty states', () {
    registerLayoutMatrix(
      {
        'empty wishlist': (l) => WishlistScreen(locale: l),
        'empty cart': (l) => CartScreen(locale: l),
        'empty orders': (l) => OrdersScreen(locale: l),
        'empty notifications': (l) => NotificationsScreen(locale: l),
        'empty wallet': (l) => WalletScreen(locale: l),
        'empty search': (l) => SearchScreen(locale: l, initialText: 'zzzz'),
        'empty stores': (l) => SellersDirectoryScreen(locale: l, initialQuery: 'zzzz'),
        'empty returns': (l) => ReturnsListScreen(locale: l),
        'empty support tickets': (l) => SupportListScreen(locale: l),
        'empty messages': (l) => ChatInboxScreen(locale: l),
      },
      seed: _seedEmpty,
      tearDownFakes: _tearDown,
      buttonRules: false,
      i18nOnly: true,
    );
  });

  group('i18n audit: server wording in the user\'s language', () {
    const fr = Strings('fr'), en = Strings('en');

    // Every shape a shopper's notice can take (title, body) and the French the phone shows when the server sent none.
    final notices = <(String, String, String, String)>[
      ('Order placed', "We received SOM-1042. You'll get updates here in real time.", 'Commande enregistrée', 'Nous avons reçu SOM-1042. Vous recevrez les mises à jour ici en temps réel.'),
      ('Complete your payment', 'Complete the card payment to confirm SOM-1042.', 'Finalisez votre paiement', 'Finalisez le paiement par carte pour confirmer SOM-1042.'),
      ('Pickup scheduled', 'SOM-1042: a rider will collect your package.', 'Enlèvement programmé', 'SOM-1042 : un livreur viendra récupérer votre colis.'),
      ('Package at the warehouse', 'SOM-1042: your package reached the warehouse.', 'Colis à l’entrepôt', 'SOM-1042 : votre colis est arrivé à l’entrepôt.'),
      ('Item cancelled by the seller', 'SOM-1042: Lamp was cancelled (Out of stock). \$12.50 was refunded to your wallet. The rest of your order continues.', 'Article annulé par le vendeur',
          'SOM-1042 : Lamp a été annulé (Rupture de stock). 12,50 \$ ont été remboursés sur votre portefeuille. Le reste de votre commande continue.'),
      ('Delivery attempt failed', 'SOM-1042: Customer not reachable. We will try again (attempt 1 of 3).', 'Échec de la livraison', 'SOM-1042 : Client injoignable. Nous allons réessayer (tentative 1 sur 3).'),
      ('Items could not be delivered', 'SOM-1042: Lamp could not be delivered (Customer not reachable). \$12.50 was refunded to your wallet.', 'Articles non livrés',
          'SOM-1042 : Lamp n’a pas pu être livré (Client injoignable). 12,50 \$ ont été remboursés sur votre portefeuille.'),
      ('Order cancelled', 'SOM-1042 was cancelled by KOMORIKO support: Fraud check. \$20.00 was refunded to your wallet.', 'Commande annulée',
          'SOM-1042 a été annulée par l’assistance KOMORIKO : Fraud check. 20,00 \$ ont été remboursés sur votre portefeuille.'),
      ('Payment failed', 'Declined by subscriber.', 'Paiement échoué', 'Refusé par l’abonné.'),
      ('Payment failed', 'Timed out waiting for the card payment.', 'Paiement échoué', 'Délai de paiement par carte dépassé.'),
      ('Refund issued', '\$20.00 for SOM-1042 is on its way back to your card.', 'Remboursement effectué', '20,00 \$ pour SOM-1042 reviennent sur votre carte.'),
      ('Refund issued', '\$20.00 for SOM-1042 → wallet (the card refund could not be completed).', 'Remboursement effectué',
          '20,00 \$ pour SOM-1042 → portefeuille (le remboursement sur la carte n’a pas pu aboutir).'),
      ('Return approved', 'RET-7 · SOM-1042', 'Retour approuvé', 'RET-7 · SOM-1042'),
      ('Return rejected', 'RET-7 · SOM-1042: Item used', 'Retour refusé', 'RET-7 · SOM-1042: Item used'),
      ('Returned goods received', 'RET-7 · SOM-1042: the warehouse received the returned goods.', 'Articles retournés reçus', 'RET-7 · SOM-1042 : l’entrepôt a reçu les articles retournés.'),
      ('Dispute resolved', 'DSP-3 · SOM-1042: Refunded to wallet', 'Litige résolu', 'DSP-3 · SOM-1042 : Remboursé sur le portefeuille'),
      ('Exchange shipped', 'SOM-1042', 'Échange shipped', 'SOM-1042'),
      ('Exchange delivered', 'SOM-1042', 'Échange livré', 'SOM-1042'),
      ('Replacement dispatched', 'SOM-1042', 'Remplacement expédié', 'SOM-1042'),
      ('Support reply', 'We have fixed it.', 'Réponse de l’assistance', 'We have fixed it.'),
      ('The seller replied to your review', 'Thank you!', 'Le vendeur a répondu à votre avis', 'Thank you!'),
      ('Your question was answered', 'Yes, it is waterproof.', 'Votre question a reçu une réponse', 'Yes, it is waterproof.'),
      ('Seller did not respond', 'SOM-1042: the seller did not answer in time.', 'Le vendeur n’a pas répondu', 'SOM-1042: the seller did not answer in time.'),
      ('Account suspended', 'Your account is suspended. Contact support for help.', 'Compte suspendu', 'Votre compte est suspendu. Contactez le support pour obtenir de l’aide.'),
      ('Two-factor authentication enabled', 'Signing in to your account now asks for a code from your authenticator app.', 'Authentification à deux facteurs activée',
          'La connexion à votre compte demande maintenant un code de votre application d’authentification.'),
      ('New message from the seller', 'Hello, your order ships today.', 'Nouveau message du vendeur', 'Hello, your order ships today.'),
      ('Flash sale started', 'Phone case is now on flash sale at \$4.50.', 'Vente flash démarrée', 'Phone case est maintenant en vente flash à 4,50 \$.'),
    ];

    test('shopper notices are shown in French when the server sent no French, and left alone in English', () {
      final wrong = <String>[];
      for (final n in notices) {
        final got = localizeNotification(fr, n.$1, n.$2);
        // Titles with free-text parts (a seller's own words, a reason typed by an agent) stay as written.
        if (n.$1 != 'Exchange shipped' && got.$1 != n.$3) wrong.add('title "${n.$1}": got "${got.$1}"');
        if (got.$2 != n.$4) wrong.add('body "${n.$2}": got "${got.$2}"');
        expect(localizeNotification(en, n.$1, n.$2), (n.$1, n.$2), reason: 'English is shown as the server wrote it');
      }
      expect(wrong, isEmpty, reason: wrong.join('\n'));
    });

    test('the server\'s own French wins in French, and English ignores it', () {
      expect(displayNotice(fr, title: 'Order update', body: 'SOM-1 is now shipped.', titleFr: 'Mise à jour', bodyFr: 'SOM-1 est expédiée.'), ('Mise à jour', 'SOM-1 est expédiée.'));
      expect(displayNotice(en, title: 'Order update', body: 'SOM-1 is now shipped.', titleFr: 'Mise à jour', bodyFr: 'SOM-1 est expédiée.'), ('Order update', 'SOM-1 is now shipped.'));
      // A "French" text that is a copy of the English was never translated: the phone's own wording is used.
      expect(displayNotice(fr, title: 'Order cancelled', body: 'SOM-1 was cancelled.', titleFr: 'Order cancelled', bodyFr: 'SOM-1 was cancelled.'), ('Commande annulée', 'SOM-1 a été annulée.'));
      // One half in French only: the other half falls back to the phone's own wording.
      expect(displayNotice(fr, title: 'Order cancelled', body: 'SOM-1 was cancelled.', titleFr: '', bodyFr: null), ('Commande annulée', 'SOM-1 a été annulée.'));
    });

    test('wallet history lines the server writes are shown in French', () {
      final cases = {
        'Order SOM-1': 'Commande SOM-1',
        'Wallet top-up via vodacom_mpesa': 'Recharge du portefeuille via Vodacom M-Pesa',
        'Refund for cancelled order SOM-1': 'Remboursement de la commande annulée SOM-1',
        'Refund for SOM-1': 'Remboursement de SOM-1',
        'Refund for SOM-1 (returned items)': 'Remboursement de SOM-1 (articles retournés)',
        'Refund for SOM-1 (dispute)': 'Remboursement de SOM-1 (litige)',
        'Exchange EX-2: price difference': 'Échange EX-2 : différence de prix',
        'Exchange EX-2: price difference refunded': 'Échange EX-2 : différence de prix remboursée',
        'Refund: seller cancelled part of SOM-1': 'Remboursement : le vendeur a annulé une partie de SOM-1',
        'Welcome store credit': 'Crédit de bienvenue',
      };
      cases.forEach((en, frText) => expect(localizeWalletDescription(fr, en), frText, reason: en));
    });

    test('reasons (failed delivery, cancelled item, dispute outcome) are worded in French', () {
      expect(translateReason('Customer not reachable'), 'Client injoignable');
      expect(translateReason('Wrong address'), 'Adresse incorrecte');
      expect(translateReason('Other: gate was locked'), 'Autre : gate was locked');
      expect(translateReason('The mobile-money network refused the payment: PIN wrong'), 'Le réseau mobile money a refusé le paiement : PIN wrong');
      expect(translateReason('Something typed by an agent'), 'Something typed by an agent');
      expect(fr.deliveryAttemptFailed(1, 'Customer not reachable', true), startsWith('Tentative de livraison 1 échouée: Client injoignable.'));
      expect(en.deliveryAttemptFailed(1, 'Customer not reachable', true), contains('Customer not reachable'));
    });

    test('product options the server did not translate: known option names and colours in French', () {
      expect(frenchVariantText('Size: 42 · Colour: Navy blue'), 'Taille: 42 · Couleur: Bleu marine');
      expect(frenchVariantText('Storage: 128 GB · Color: Black'), 'Stockage: 128 GB · Couleur: Noir');
      expect(frenchVariantText('Default'), 'Default');
      expect(frenchVariantText('Size: 42 · Fabric: Kente'), 'Taille: 42 · Fabric: Kente', reason: 'an unknown word stays as the seller wrote it');
      final line = _order().items.first;
      expect(line.displayVariant('fr'), 'Taille: 42 · Couleur: Bleu marine');
      expect(variantInFrench('Size: 42', 'Size: 42'), 'Taille: 42', reason: 'a variantFr that is only a copy of the English is not a translation');
      expect(variantInFrench('Size: 42', 'Pointure : 42'), 'Pointure : 42', reason: 'the server\'s own French wins');
      expect(line.displayVariant('en'), 'Size: 42 · Colour: Navy blue');
    });

    test('server errors a shopper or a rider can meet are shown in French', () {
      const messages = {
        'The card payment was cancelled.': 'Le paiement par carte a été annulé.',
        'Timed out waiting for the card payment.': 'Délai de paiement par carte dépassé.',
        'Incorrect or expired code.': 'Code incorrect ou expiré.',
        'Too many wrong codes. Try again in a few minutes.': 'Trop de codes erronés. Réessayez dans quelques minutes.',
        'This sign-in expired. Enter your password again.': 'Cette connexion a expiré. Saisissez de nouveau votre mot de passe.',
        'You already reported this review.': 'Vous avez déjà signalé cet avis.',
        'You cannot buy your own listing.': 'Vous ne pouvez pas acheter votre propre annonce.',
        'This product is no longer available.': 'Ce produit n’est plus disponible.',
        'Invalid or missing token.': 'Session invalide ou absente. Reconnectez-vous.',
        'You can attach up to 8 photos.': 'Vous pouvez joindre 8 photos au maximum.',
        'At most 100 lines.': 'Au plus 100 lignes.',
        'Pay with your wallet or mobile money (airtel_money, orange_money).': 'Payez avec votre portefeuille ou par mobile money (airtel money, orange money).',
      };
      messages.forEach((raw, expected) {
        expect(translateServerError(raw, fr), expected, reason: raw);
        expect(translateServerError(raw, en), raw, reason: 'English stays as the server wrote it');
      });
    });
  });
}
