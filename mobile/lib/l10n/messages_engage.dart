// UI texts for: Q&A, flash sales, coupons, storefront and the product gallery. key -> (English, French); placeholders are written {name}.
// ignore_for_file: prefer_single_quote_strings

const Map<String, (String, String)> kMessagesEngage = {
  // countdown + flash sales
  'cd_days': ('{n}d', '{n} j'),
  'flash_ends': ('Flash sale · ends in {time}', 'Vente flash · fin dans {time}'),
  'flash_ends_short': ('Ends in {time}', 'Fin dans {time}'),
  'flash_deals_hint': ('Prices go back up when the timer ends.', 'Les prix remontent à la fin du compte à rebours.'),
  'flash_more_deals': ('More deals', 'Autres offres'),
  // storefront: vacation, handling time, policies
  'vac_until': ('On vacation until {date}', 'En vacances jusqu’au {date}'),
  'vac_generic': ('This store is on vacation and is not taking new orders.', 'Cette boutique est en vacances et ne prend pas de nouvelles commandes.'),
  'vac_badge': ('On vacation', 'En vacances'),
  'vac_button': ('Store on vacation', 'Boutique en vacances'),
  'store_handling_one': ('Handling time: 1 day', 'Délai de préparation : 1 jour'),
  'store_handling_many': ('Handling time: {n} days', 'Délai de préparation : {n} jours'),
  'store_policies': ('Store policies', 'Politiques de la boutique'),
  'store_returns_policy': ('Returns policy', 'Politique de retour'),
  'store_shipping_policy': ('Shipping policy', 'Politique d’expédition'),
  'pd_handling_note': ('Includes {n} d for the seller to prepare your order', 'Dont {n} j de préparation par le vendeur'),
  'pd_brand_line': ('Brand: {brand}', 'Marque : {brand}'),
  'pd_sku_line': ('SKU: {sku}', 'Réf. : {sku}'),
  // product gallery
  'gal_close': ('Close', 'Fermer'),
  'gal_counter': ('{n} of {total}', '{n} sur {total}'),
  'gal_alt': ('Photo {n} of {total}: {name}', 'Photo {n} sur {total} : {name}'),
  // questions and answers
  'qa_answered': ('Answered', 'Répondu'),
  'qa_pending': ('Awaiting answer', 'En attente de réponse'),
  'qa_seller_answer': ('Seller’s answer', 'Réponse du vendeur'),
  'qa_answered_on': ('Answered on {date}', 'Répondu le {date}'),
  'qa_yours': ('Your question', 'Votre question'),
  'qa_empty': ('Write your question first.', 'Écrivez d’abord votre question.'),
  'qa_load_failed': ('Couldn’t load the questions.', 'Impossible de charger les questions.'),
  'qa_retry': ('Try again', 'Réessayer'),
};
