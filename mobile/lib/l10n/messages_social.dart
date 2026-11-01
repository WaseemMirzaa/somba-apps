// UI texts for: seller chat, support and notification preferences. key -> (English, French); placeholders are written {name}.
// ignore_for_file: prefer_single_quote_strings

const Map<String, (String, String)> kMessagesSocial = {
  // ---- chat: inbox, thread, compose ----
  'chat_inbox_title': ('My messages', 'Mes messages'),
  'chat_inbox_empty': (
    'No conversations yet. Message a store from a product, an order or a store page.',
    'Aucune conversation pour le moment. Écrivez à une boutique depuis un produit, une commande ou une page boutique.'
  ),
  'chat_message_seller': ('Message the seller', 'Écrire au vendeur'),
  'chat_store_fallback': ('Store', 'Boutique'),
  'chat_ctx_product': ('About: {name}', 'À propos de : {name}'),
  'chat_ctx_order': ('Order {ref}', 'Commande {ref}'),
  'chat_ctx_order_plain': ('About an order', 'À propos d’une commande'),
  'chat_compose_title': ('New message', 'Nouveau message'),
  'chat_compose_intro': ('Your message goes straight to {store}.', 'Votre message est envoyé directement à {store}.'),
  'chat_compose_hint': ('Write your message…', 'Écrivez votre message…'),
  'chat_compose_send': ('Send message', 'Envoyer le message'),
  'chat_compose_required': ('Write a message first.', 'Écrivez d’abord un message.'),
  'chat_input_hint': ('Write a message…', 'Écrire un message…'),
  'chat_older': ('Load earlier messages', 'Charger les messages précédents'),
  'chat_more_convs': ('Show more conversations', 'Afficher plus de conversations'),
  'chat_sent': ('Message sent.', 'Message envoyé.'),
  'chat_sent_to': ('Message sent to {store}.', 'Message envoyé à {store}.'),
  'chat_read_only': (
    'This store is suspended for now: you can read the messages but not reply.',
    'Cette boutique est suspendue pour le moment : vous pouvez lire les messages mais pas y répondre.'
  ),
  'chat_photo_alt': ('Photo sent in the conversation', 'Photo envoyée dans la conversation'),
  'chat_unread_n': ('Unread messages: {n}', 'Messages non lus : {n}'),
  'chat_attach': ('Add photos', 'Ajouter des photos'),
  'chat_empty_thread': ('No messages yet.', 'Aucun message pour le moment.'),
  'chat_view_photo': ('Photo {n} of {total}', 'Photo {n} sur {total}'),
  'social_check_fields': ('Check the highlighted fields.', 'Vérifiez les champs signalés.'),

  // ---- support tickets ----
  'support_cat_label': ('Category', 'Catégorie'),
  'support_cat_order': ('An order', 'Une commande'),
  'support_cat_payment': ('Payment or refund', 'Paiement ou remboursement'),
  'support_cat_delivery': ('Delivery', 'Livraison'),
  'support_cat_return': ('Return or exchange', 'Retour ou échange'),
  'support_cat_account': ('My account', 'Mon compte'),
  'support_cat_other': ('Something else', 'Autre chose'),
  'support_cat_general': ('General', 'Général'),
  'support_category_line': ('Category: {name}', 'Catégorie : {name}'),
  'support_order_label': ('Related order (optional)', 'Commande concernée (facultatif)'),
  'support_order_none': ('No order', 'Aucune commande'),
  'support_photos_label': ('Photos (optional)', 'Photos (facultatif)'),
  'support_create': ('Create ticket', 'Créer le ticket'),
  'support_opened': ('Ticket {ref} created. We will reply here.', 'Ticket {ref} créé. Nous vous répondrons ici.'),
  'support_replied': ('Reply sent.', 'Réponse envoyée.'),
  'support_subject_required': ('Enter a subject.', 'Saisissez un objet.'),
  'support_message_required': ('Describe your problem.', 'Décrivez votre problème.'),
  'support_staff': ('Somba support', 'Assistance Somba'),
  'support_closed_resolved': (
    'This ticket is resolved. If you still need help, open a new ticket.',
    'Ce ticket est résolu. Si vous avez encore besoin d’aide, ouvrez un nouveau ticket.'
  ),
  'support_closed_closed': (
    'This ticket is closed. If you still need help, open a new ticket.',
    'Ce ticket est fermé. Si vous avez encore besoin d’aide, ouvrez un nouveau ticket.'
  ),
  'support_open_new': ('Open a new ticket', 'Ouvrir un nouveau ticket'),
  'support_unread_n': ('Unread replies: {n}', 'Réponses non lues : {n}'),

  // ---- notification categories (settings) ----
  'notif_cat_title': ('What you hear about', 'Ce dont vous êtes informé'),
  'notif_cat_intro': (
    'Switch a kind off to stop its push notifications. It still appears in your notifications list.',
    'Désactivez un type pour ne plus recevoir ses notifications push. Il reste visible dans votre liste de notifications.'
  ),
  'notif_order': ('Orders and delivery', 'Commandes et livraison'),
  'notif_order_sub': ('Payments, delivery, returns and refunds', 'Paiements, livraison, retours et remboursements'),
  'notif_message': ('Messages and support', 'Messages et assistance'),
  'notif_message_sub': ('Replies from sellers and from Somba support', 'Réponses des vendeurs et de l’assistance Somba'),
  'notif_question': ('Product questions', 'Questions sur les produits'),
  'notif_question_sub': ('Answers to the questions you asked', 'Réponses aux questions que vous avez posées'),
  'notif_review': ('Reviews', 'Avis'),
  'notif_review_sub': ('Seller replies and moderation of your reviews', 'Réponses des vendeurs et modération de vos avis'),
  'notif_product': ('Product updates', 'Actualités produits'),
  'notif_product_sub': ('News about the products you care about', 'Nouveautés sur les produits qui vous intéressent'),
  'notif_promo': ('Offers and promotions', 'Offres et promotions'),
  'notif_promo_sub': ('Deals, flash sales and coupons', 'Bons plans, ventes flash et coupons'),
  'notif_saved': ('Notification settings saved.', 'Préférences de notification enregistrées.'),
};
