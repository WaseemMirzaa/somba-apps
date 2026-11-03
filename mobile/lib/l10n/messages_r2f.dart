// UI texts for: photos in reviews, following stores, the Help contact options. key -> (English, French); placeholders are written {name}.
// ignore_for_file: prefer_single_quote_strings

const Map<String, (String, String)> kMessagesR2f = {
  // photos in reviews
  'rv_photos_label': ('Photos (optional)', 'Photos (facultatif)'),
  'rv_photos_wait': ('Wait until the photos have finished uploading.', 'Attendez la fin de l’envoi des photos.'),
  'rv_photo_alt': ('Review photo {n} of {total}', 'Photo de l’avis {n} sur {total}'),
  // following stores
  'follow': ('Follow', 'Suivre'),
  'following': ('Following', 'Suivi'),
  'unfollow': ('Unfollow', 'Ne plus suivre'),
  'follow_now': ('You now follow {store}.', 'Vous suivez désormais {store}.'),
  'follow_stopped': ('You no longer follow {store}.', 'Vous ne suivez plus {store}.'),
  'follow_followers_one': ('1 follower', '1 abonné'),
  'follow_followers_many': ('{n} followers', '{n} abonnés'),
  'following_title': ('Stores you follow', 'Boutiques suivies'),
  'following_empty': ('You don’t follow any store yet.', 'Vous ne suivez aucune boutique pour le moment.'),
  'following_empty_hint': (
    'Tap Follow on a store page to hear about its new products.',
    'Touchez Suivre sur la page d’une boutique pour être prévenu de ses nouveaux produits.'
  ),
  'following_products_one': ('1 product', '1 produit'),
  'following_products_many': ('{n} products', '{n} produits'),
  'following_load_failed': ('Couldn’t load the stores you follow.', 'Impossible de charger les boutiques suivies.'),
  'following_retry': ('Try again', 'Réessayer'),
  // help: contact options
  'help_contact_title': ('Contact us', 'Nous contacter'),
  'help_call': ('Call us', 'Nous appeler'),
  'help_email': ('Send an e-mail', 'Envoyer un e-mail'),
  'help_whatsapp': ('Chat on WhatsApp', 'Discuter sur WhatsApp'),
  'help_open_failed': ('Couldn’t open that on this device. Copied: {value}', 'Impossible de l’ouvrir sur cet appareil. Copié : {value}'),
};
