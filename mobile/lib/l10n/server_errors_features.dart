import 'strings.dart';

// Server error messages added per feature (exact English text -> French). Each builder fills its own map.
// A message may be listed in one map only. A message with a number or a name in it goes to `_patternsFr` instead.

const Map<String, String> kServerErrorsLogistics = {
  'Pin your delivery address on the map.': 'Placez votre adresse de livraison sur la carte.',
  'Delivery is not available right now: no warehouse is open.': 'La livraison n’est pas disponible pour le moment : aucun entrepôt n’est ouvert.',
  'This order has no destination warehouse.': 'Cette commande n’a pas d’entrepôt de destination.',
  'One of the returned items is not on this order.': 'Un des articles retournés ne figure pas sur cette commande.',
  'This coupon applies to one store’s products: add them to your cart first.':
      'Ce coupon s’applique aux produits d’une seule boutique : ajoutez-les d’abord à votre panier.',
  'Your store must be approved before you can issue coupons.': 'Votre boutique doit être approuvée avant de pouvoir émettre des coupons.',
};
const Map<String, String> kServerErrorsAfterSale = {
  // returns and disputes (docs/contracts/after-sale.md section 11). The three photo messages are in the Social map.
  'Choose what is wrong from the list.': 'Choisissez le problème dans la liste.',
  'You can return items once the order has been delivered.': 'Vous pouvez retourner des articles une fois la commande livrée.',
  'Returns are not accepted at the moment.': 'Les retours ne sont pas acceptés pour le moment.',
  'Choose at least one item to return.': 'Choisissez au moins un article à retourner.',
  'Choose how many of each item to return.': 'Indiquez combien d’unités de chaque article vous retournez.',
  'An item appears twice in the request.': 'Un article apparaît deux fois dans la demande.',
  'One of the items is not on this order.': 'Un des articles ne fait pas partie de cette commande.',
  'The response time has passed; Somba support decides now.': 'Le délai de réponse est dépassé : le support Somba tranche désormais.',
  'This request was just updated by someone else. Refresh and try again.':
      'Cette demande vient d’être mise à jour par quelqu’un d’autre. Actualisez et réessayez.',
  'Wait for the seller to answer, or for the response time to pass.': 'Attendez la réponse du vendeur, ou la fin du délai de réponse.',
  'Only returns can be escalated; a dispute is already with Somba support.':
      'Seuls les retours peuvent être transmis au support ; un litige est déjà entre les mains du support Somba.',
  'It is too late to cancel: the return is already on its way.': 'Il est trop tard pour annuler : le retour est déjà en cours.',
  'This request is closed.': 'Cette demande est close.',
  'Pick the item to replace.': 'Choisissez l’article à remplacer.',
  // replacements and exchanges
  'That item is not on this order.': 'Cet article ne fait pas partie de cette commande.',
  'You already asked for a replacement of this item.': 'Vous avez déjà demandé le remplacement de cet article.',
  'You already asked to exchange this item.': 'Vous avez déjà demandé l’échange de cet article.',
  'Choose a different option to exchange for.': 'Choisissez une option différente pour l’échange.',
  'That product is no longer available.': 'Ce produit n’est plus disponible.',
  'Not enough stock of that item for an exchange.': 'Stock insuffisant de cet article pour un échange.',
  'This replacement was just updated by someone else. Refresh and try again.':
      'Ce remplacement vient d’être mis à jour par quelqu’un d’autre. Actualisez et réessayez.',
  'This exchange was just updated by someone else. Refresh and try again.':
      'Cet échange vient d’être mis à jour par quelqu’un d’autre. Actualisez et réessayez.',
};
const Map<String, String> kServerErrorsSocial = {
  // customer <-> seller chat (docs/contracts/seller-platform.md section 3)
  'Only shoppers can message a store.': 'Seuls les clients peuvent écrire à une boutique.',
  'Store not found.': 'Boutique introuvable.',
  'You cannot message your own store.': 'Vous ne pouvez pas écrire à votre propre boutique.',
  'A message can have up to 2000 characters.': 'Un message peut contenir 2 000 caractères au maximum.',
  'That product does not belong to this store.': 'Ce produit n’appartient pas à cette boutique.',
  'That order has nothing from this store.': 'Cette commande ne contient aucun article de cette boutique.',
  'You are opening too many conversations. Try again later.': 'Vous ouvrez trop de conversations. Réessayez plus tard.',
  'You are sending messages too fast. Wait a moment.': 'Vous envoyez des messages trop vite. Patientez un instant.',
  'Conversation not found.': 'Conversation introuvable.',
  'Message not found.': 'Message introuvable.',
  'Attach up to 4 photos.': 'Joignez 4 photos au maximum.',
  'Attachment must be an image uploaded through the platform.': 'La pièce jointe doit être une image envoyée via l’application.',
  'Attachment is not a valid image.': 'La pièce jointe n’est pas une image valide.',
  'Your store is suspended: you can read messages but not reply.':
      'Votre boutique est suspendue : vous pouvez lire les messages mais pas y répondre.',
  'Nothing to translate.': 'Rien à traduire.',
  'Translation is not available right now. Try again later.': 'La traduction n’est pas disponible pour le moment. Réessayez plus tard.',
  // support tickets with photos (docs/contracts/after-sale.md sections 6 and 11)
  'Photos must be a list of uploaded images.': 'Les photos doivent être une liste d’images envoyées.',
  'Photos must be images uploaded through the app.': 'Les photos doivent être des images envoyées depuis l’application.',
  'You can attach up to 6 photos.': 'Vous pouvez joindre 6 photos au maximum.',
  // notification categories
  'notify must be an object of true/false switches.': 'Les préférences de notification doivent être des interrupteurs activés ou désactivés.',
};
const Map<String, String> kServerErrorsEngage = {
  // product reviews (docs/contracts/after-sale.md section 11; the three the review form can meet are in the main map)
  'Review not found.': 'Avis introuvable.',
};

/// A store on vacation refuses new orders with ONE message that carries both languages, English first and French
/// second, joined by " / " (the first half reads "Kinshasa Traders is on vacation until 12 Nov 2026 and is not taking
/// new orders."). The store name may itself contain " / ". Group 1 is the English half, group 2 the French one.
final RegExp kVacationErrorPattern = RegExp(
    r'^(.*? is on vacation until .*?and is not taking new orders\.) / (.*? est en vacances jusqu.au .*?et ne prend pas de nouvelles commandes\.)$',
    dotAll: true);

/// English users see the English half of a bilingual server message (the vacation one); anything else as written.
String englishServerError(String raw) {
  final m = kVacationErrorPattern.firstMatch(raw.trim());
  return m == null ? raw : m[1]!;
}

// Messages with a number or a name inside: (pattern, French builder). First match wins.
final List<(RegExp, String Function(RegExpMatch))> kServerPatternsLogistics = [
  (RegExp(r'^This coupon only applies to products from (.+)\.$'), (m) => 'Ce coupon ne s’applique qu’aux produits de ${m[1]}.'),
];
final List<(RegExp, String Function(RegExpMatch))> kServerPatternsAfterSale = [
  (RegExp(r'^Returns are accepted within (\d+) days of delivery, and that time has passed\.$'),
      (m) => 'Les retours sont acceptés dans les ${m[1]} jours suivant la livraison, et ce délai est dépassé.'),
  (RegExp(r'^You can return at most (\d+) of "(.+)"\.$'), (m) => 'Vous pouvez retourner au maximum ${m[1]} unité(s) de « ${m[2]} ».'),
  (RegExp(r'^Choose a (.+) for "(.+)"\.$'), (m) => 'Choisissez l’option « ${m[1]} » pour « ${m[2]} ».'),
  (RegExp(r'^Your wallet balance is too low for the price difference \(\$([\d.,]+)\)\. Top up your wallet and try again\.$'),
      (m) => 'Le solde de votre portefeuille est insuffisant pour la différence de prix (${const Strings('fr').usd(double.tryParse(m[1]!.replaceAll(',', '')) ?? 0)}). Rechargez votre portefeuille puis réessayez.'),
];
final List<(RegExp, String Function(RegExpMatch))> kServerPatternsSocial = [
  (RegExp(r'^Unknown notification kind: (.+)\.$'), (m) => 'Type de notification inconnu : ${m[1]}.'),
  (RegExp(r'^(\w+) must be true or false\.$'), (m) => 'Le réglage « ${m[1]} » doit être activé ou désactivé.'),
];
final List<(RegExp, String Function(RegExpMatch))> kServerPatternsEngage = [
  // the bilingual vacation refusal: show the French half
  (kVacationErrorPattern, (m) => m[2]!),
];
