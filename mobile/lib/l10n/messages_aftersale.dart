// UI texts for: returns, disputes, replacements and exchanges. key -> (English, French); placeholders are written {name}.
// ignore_for_file: prefer_single_quote_strings

const Map<String, (String, String)> kMessagesAfterSale = {
  // ---- hub and lists ----
  'as_hub_title': ('Returns & exchanges', 'Retours et échanges'),
  'as_tab_returns': ('Returns', 'Retours'),
  'as_tab_replacements': ('Replacements', 'Remplacements'),
  'as_tab_exchanges': ('Exchanges', 'Échanges'),
  'as_filter_all': ('All', 'Tous'),
  'as_filter_open': ('In progress', 'En cours'),
  'as_filter_closed': ('Closed', 'Terminés'),
  'as_empty_returns': (
    'No returns or problems yet. Open a delivered order to start one.',
    'Aucun retour ni problème pour le moment. Ouvrez une commande livrée pour en démarrer un.'
  ),
  'as_empty_replacements': (
    'No replacements yet. Open a delivered order and choose “Replace or exchange”.',
    'Aucun remplacement pour le moment. Ouvrez une commande livrée et choisissez « Remplacer ou échanger ».'
  ),
  'as_empty_exchanges': (
    'No exchanges yet. Open a delivered order and choose “Replace or exchange”.',
    'Aucun échange pour le moment. Ouvrez une commande livrée et choisissez « Remplacer ou échanger ».'
  ),
  'as_empty_filtered': ('Nothing here with this filter.', 'Rien ici avec ce filtre.'),
  'as_load_failed': ('We could not load your requests.', 'Impossible de charger vos demandes.'),
  'as_report_problem': ('Report a problem', 'Signaler un problème'),

  // ---- stage badges and banners ----
  'as_sb_awaiting': ('Waiting for seller', 'Attente du vendeur'),
  'as_sb_replied': ('Seller replied', 'Vendeur a répondu'),
  'as_sb_rejected': ('Seller declined', 'Refusé par le vendeur'),
  'as_sb_timeout': ('No answer', 'Sans réponse'),
  'as_sb_escalated': ('With support', 'Chez le support'),
  'as_sb_approved': ('Accepted', 'Accepté'),
  'as_sb_pickup': ('Pickup', 'Collecte'),
  'as_sb_received': ('Received', 'Reçu'),
  'as_sb_cancelled': ('Cancelled', 'Annulé'),
  'as_st_awaiting_title': ('Waiting for the seller', 'En attente du vendeur'),
  'as_st_awaiting_return_due': (
    'The seller has until {when} to accept or decline your return.',
    'Le vendeur a jusqu’au {when} pour accepter ou refuser votre retour.'
  ),
  'as_st_awaiting_return': ('The seller will accept or decline your return soon.', 'Le vendeur va bientôt accepter ou refuser votre retour.'),
  'as_st_awaiting_late': (
    'The seller’s time to answer has passed. You will soon be able to ask Somba support to decide.',
    'Le délai de réponse du vendeur est dépassé. Vous pourrez bientôt demander au support Somba de trancher.'
  ),
  'as_st_awaiting_dispute': (
    'The seller can reply to your report. Add details or photos below if you like.',
    'Le vendeur peut répondre à votre signalement. Ajoutez des détails ou des photos ci-dessous si vous le souhaitez.'
  ),
  'as_st_replied_title': ('The seller replied', 'Le vendeur a répondu'),
  'as_st_replied': (
    'Somba support will review the conversation and decide. You can keep adding details below.',
    'Le support Somba examinera l’échange et tranchera. Vous pouvez continuer à ajouter des détails ci-dessous.'
  ),
  'as_st_rejected_title': ('The seller declined your return', 'Le vendeur a refusé votre retour'),
  'as_st_timeout_title': ('The seller did not answer in time', 'Le vendeur n’a pas répondu à temps'),
  'as_st_next_steps': (
    'You can ask Somba support to decide, or cancel your request.',
    'Vous pouvez demander au support Somba de trancher, ou annuler votre demande.'
  ),
  'as_st_escalated_title': ('With Somba support', 'Chez le support Somba'),
  'as_st_escalated': ('Our team is reviewing your request and will decide soon.', 'Notre équipe examine votre demande et tranchera bientôt.'),
  'as_st_approved_title': ('Return accepted', 'Retour accepté'),
  'as_st_approved': (
    'The warehouse will arrange to collect the items from you. We will keep you posted here.',
    'L’entrepôt va organiser la collecte des articles chez vous. Nous vous tiendrons informé ici.'
  ),
  'as_st_pickup_title': ('Pickup arranged', 'Collecte organisée'),
  'as_st_pickup': (
    'A warehouse rider will collect the items from you. Keep them packed and ready.',
    'Un livreur de l’entrepôt viendra récupérer les articles chez vous. Gardez-les emballés et prêts.'
  ),
  'as_st_received_title': ('Received at the warehouse', 'Reçu à l’entrepôt'),
  'as_st_received': ('We have your items and are processing your refund.', 'Nous avons vos articles et traitons votre remboursement.'),
  'as_st_refund_title': ('Refund issued', 'Remboursement effectué'),
  'as_st_replacement_title': ('Replacement approved', 'Remplacement accepté'),
  'as_st_replacement': (
    'Somba support decided to replace your item. Follow it in the Replacements tab.',
    'Le support Somba a décidé de remplacer votre article. Suivez-le dans l’onglet Remplacements.'
  ),
  'as_st_cancelled_title': ('Request cancelled', 'Demande annulée'),
  'as_st_cancelled': ('You cancelled this request.', 'Vous avez annulé cette demande.'),
  'as_st_declined_body': ('No refund was made for this request.', 'Aucun remboursement n’a été effectué pour cette demande.'),
  'as_refund_wallet': ('{amount} refunded to your wallet', '{amount} remboursés sur votre portefeuille'),
  'as_refund_phone': ('{amount} sent back to your mobile-money number', '{amount} renvoyés sur votre numéro mobile money'),
  'as_decision': ('Decision', 'Décision'),
  'as_outcome_refund_full': ('Full refund', 'Remboursement intégral'),
  'as_outcome_refund_partial': ('Partial refund', 'Remboursement partiel'),
  'as_outcome_replacement': ('Replacement', 'Remplacement'),
  'as_outcome_reject': ('Request declined', 'Demande refusée'),
  'as_outcome_return_refund': ('Return and refund', 'Retour et remboursement'),

  // ---- request detail ----
  'as_kv_category': ('Category', 'Catégorie'),
  'as_kv_opened': ('Opened', 'Ouverte le'),
  'as_sec_items': ('Items in this request', 'Articles de cette demande'),
  'as_item_refund': ('Refund {amount}', 'Remboursement {amount}'),
  'as_item_value': ('Worth up to {amount}', 'Jusqu’à {amount}'),
  'as_sec_photos': ('Your photos', 'Vos photos'),
  'as_sec_seller': ('The seller’s answer', 'La réponse du vendeur'),
  'as_seller_reason': ('Reason given', 'Motif donné'),
  'as_seller_due': ('Answer due: {when}', 'Réponse attendue : {when}'),
  'as_seller_accepted': ('The seller accepted your return.', 'Le vendeur a accepté votre retour.'),
  'as_seller_answered': ('Answered {when}', 'Répondu {when}'),
  'as_sec_thread': ('Conversation', 'Conversation'),
  'as_thread_empty': ('No messages yet. Write the first one below.', 'Aucun message pour le moment. Écrivez le premier ci-dessous.'),
  'as_thread_you': ('You', 'Vous'),
  'as_thread_seller': ('{name} · seller', '{name} · vendeur'),
  'as_thread_support': ('Somba support', 'Support Somba'),
  'as_thread_team': ('Somba team', 'Équipe Somba'),
  'as_reply_hint': ('Write a message…', 'Écrivez un message…'),
  'as_reply_sent': ('Message sent.', 'Message envoyé.'),
  'as_reply_empty': ('Write a message first.', 'Écrivez d’abord un message.'),
  'as_photos_wait': ('Wait for your photos to finish uploading.', 'Attendez la fin de l’envoi de vos photos.'),
  'as_closed_note': (
    'This request is closed, so you can no longer add messages.',
    'Cette demande est close : vous ne pouvez plus ajouter de messages.'
  ),
  'as_pk_title': ('Return progress', 'Suivi du retour'),
  'as_pk_sent': ('Request sent', 'Demande envoyée'),
  'as_pk_accepted': ('Return accepted', 'Retour accepté'),
  'as_pk_collect': ('Collected from you', 'Récupéré chez vous'),
  'as_pk_collect_sub': ('A warehouse rider will collect it.', 'Un livreur de l’entrepôt viendra le récupérer.'),
  'as_pk_received': ('Received at the warehouse', 'Reçu à l’entrepôt'),
  'as_pk_refund': ('Refund issued', 'Remboursement effectué'),
  'as_escalate': ('Ask Somba support to decide', 'Demander au support Somba de trancher'),
  'as_escalate_title': ('Ask Somba support to decide?', 'Demander au support Somba de trancher ?'),
  'as_escalate_body': (
    'Somba support will look at this return and make the final decision.',
    'Le support Somba examinera ce retour et prendra la décision finale.'
  ),
  'as_escalate_note': ('Add a note (optional)', 'Ajouter une note (facultatif)'),
  'as_escalate_confirm': ('Send to support', 'Envoyer au support'),
  'as_escalate_done': ('Sent to Somba support.', 'Transmis au support Somba.'),
  'as_cancel_request': ('Cancel this request', 'Annuler cette demande'),
  'as_cancel_title': ('Cancel this request?', 'Annuler cette demande ?'),
  'as_cancel_body': (
    'This cannot be undone. You can make a new request later if the time allows.',
    'Cette action est définitive. Vous pourrez refaire une demande plus tard si le délai le permet.'
  ),
  'as_cancel_keep': ('Keep my request', 'Garder ma demande'),
  'as_cancel_confirm': ('Cancel request', 'Annuler la demande'),
  'as_cancel_done': ('Request cancelled.', 'Demande annulée.'),
  'as_siblings_title': ('Several requests were created', 'Plusieurs demandes ont été créées'),
  'as_siblings_body': (
    '{n} requests were created, one per store, because your items come from several stores. Each store answers its own request.',
    '{n} demandes ont été créées, une par boutique, car vos articles viennent de plusieurs boutiques. Chaque boutique répond à sa demande.'
  ),
  'as_siblings_this': ('This request', 'Cette demande'),

  // ---- categories ----
  'as_cat_damaged': ('Damaged', 'Endommagé'),
  'as_cat_wrong_item': ('Wrong item', 'Mauvais article'),
  'as_cat_not_as_described': ('Not as described', 'Non conforme à la description'),
  'as_cat_changed_mind': ('Changed my mind', 'J’ai changé d’avis'),
  'as_cat_defective': ('Defective', 'Défectueux'),
  'as_cat_other': ('Other', 'Autre'),
  'as_cat_missing': ('Item missing', 'Article manquant'),
  'as_cat_not_received': ('Not received', 'Non reçu'),

  // ---- return form ----
  'as_win_open': ('You can return items until {date}.', 'Vous pouvez retourner des articles jusqu’au {date}.'),
  'as_win_closed_title': ('The return window is closed', 'Le délai de retour est dépassé'),
  'as_win_closed_body': (
    'Returns are accepted within {days} days of delivery, and that time ended on {date}.',
    'Les retours sont acceptés dans les {days} jours suivant la livraison, et ce délai s’est terminé le {date}.'
  ),
  'as_win_unavailable_title': ('Return not available', 'Retour impossible'),
  'as_ret_items': ('What do you want to return?', 'Que souhaitez-vous retourner ?'),
  'as_ret_remaining': ('Up to {n} can be returned', 'Jusqu’à {n} à retourner'),
  'as_ret_none_left': ('Already part of another request', 'Déjà dans une autre demande'),
  'as_ret_pick_one': ('Choose at least one item to return.', 'Choisissez au moins un article à retourner.'),
  'as_ret_refund_preview': ('Estimated refund', 'Remboursement estimé'),
  'as_ret_refund_note': (
    'The refund covers the returned items only, at the price you paid.',
    'Le remboursement ne porte que sur les articles retournés, au prix payé.'
  ),
  'as_reason_label': ('Tell us more', 'Dites-nous en plus'),
  'as_reason_hint': ('Describe what happened', 'Décrivez ce qui s’est passé'),
  'as_reason_short': ('Describe the problem in at least 5 characters.', 'Décrivez le problème en 5 caractères au moins.'),
  'as_photos_label': ('Photos (optional)', 'Photos (facultatif)'),
  'as_refund_to': ('Refund to', 'Rembourser sur'),
  'as_refund_to_wallet': ('My Somba&Teka wallet', 'Mon portefeuille Somba&Teka'),
  'as_refund_to_phone': ('My mobile-money number', 'Mon numéro mobile money'),
  'as_refund_to_note': (
    'If the payment cannot go back to your phone, the refund goes to your wallet.',
    'Si le paiement ne peut pas revenir sur votre téléphone, le remboursement est versé sur votre portefeuille.'
  ),
  'as_ret_sent': ('Return request {ref} sent.', 'Demande de retour {ref} envoyée.'),
  'as_ret_sent_many': ('{n} return requests sent, one per store.', '{n} demandes de retour envoyées, une par boutique.'),

  // ---- dispute form ----
  'as_dp_intro': (
    'Tell us what went wrong with order {ref}. The seller replies first; Somba support steps in if needed.',
    'Dites-nous ce qui s’est mal passé avec la commande {ref}. Le vendeur répond d’abord ; le support Somba intervient si besoin.'
  ),
  'as_dp_category': ('What happened?', 'Que s’est-il passé ?'),
  'as_dp_items': ('Which items? (optional)', 'Quels articles ? (facultatif)'),
  'as_dp_items_hint': ('Leave all unticked if it concerns the whole order.', 'Ne cochez rien si cela concerne toute la commande.'),
  'as_dp_submit': ('Send report', 'Envoyer le signalement'),
  'as_dp_sent': ('Report {ref} sent.', 'Signalement {ref} envoyé.'),
  'as_pick_category': ('Choose what is wrong first.', 'Choisissez d’abord le problème.'),
  'as_check_fields': ('Check the highlighted fields.', 'Vérifiez les champs signalés.'),

  // ---- replacement / exchange form ----
  'as_qty_label': ('How many?', 'Combien ?'),
  'as_rep_condition': ('What is wrong?', 'Quel est le problème ?'),
  'as_ex_options': ('Choose the new option', 'Choisissez la nouvelle option'),
  'as_ex_current': ('You have: {variant}', 'Vous avez : {variant}'),
  'as_ex_same': ('Choose an option different from the one you have.', 'Choisissez une option différente de celle que vous avez.'),
  'as_ex_diff_pay': (
    'Price difference: {amount} more. It is taken from your wallet when you send the request.',
    'Différence de prix : {amount} de plus. Ce montant est prélevé sur votre portefeuille à l’envoi de la demande.'
  ),
  'as_ex_diff_refund': (
    'Price difference: {amount} back. It is refunded to your wallet when the new item is delivered.',
    'Différence de prix : {amount} en moins. Ce montant est remboursé sur votre portefeuille à la livraison du nouvel article.'
  ),
  'as_ex_diff_none': ('No price difference.', 'Aucune différence de prix.'),
  'as_ex_diff_unknown': ('Our team will confirm any price difference.', 'Notre équipe confirmera l’éventuelle différence de prix.'),
  'as_ex_wallet_low': (
    'Your wallet balance is too low for the price difference ({amount}). Top up your wallet and try again.',
    'Le solde de votre portefeuille est insuffisant pour la différence de prix ({amount}). Rechargez votre portefeuille puis réessayez.'
  ),
  'as_ex_topup': ('Top up my wallet', 'Recharger mon portefeuille'),

  // ---- replacement / exchange status ----
  'as_rs_requested': ('Requested', 'Demandé'),
  'as_rs_approved': ('Approved', 'Accepté'),
  'as_rs_preparing': ('Being prepared', 'En préparation'),
  'as_rs_dispatched': ('On its way', 'En route'),
  'as_rs_delivered': ('Delivered', 'Livré'),
  'as_rs_rejected': ('Declined', 'Refusé'),
  'as_rp_progress': ('Progress', 'Avancement'),
  'as_rp_requested': ('Request sent', 'Demande envoyée'),
  'as_rp_due': ('Answer expected: {when}', 'Réponse attendue : {when}'),
  'as_rp_approved': ('Approved by the seller', 'Accepté par le vendeur'),
  'as_rp_approved_sub': ('Your new item is being prepared.', 'Votre nouvel article est en préparation.'),
  'as_rp_dispatched': ('On its way', 'En route'),
  'as_rp_rider': ('A rider will bring the new item and collect the old one.', 'Un livreur apportera le nouvel article et récupérera l’ancien.'),
  'as_rp_delivered': ('Delivered', 'Livré'),
  'as_rp_rejected': ('Request declined', 'Demande refusée'),
  'as_rp_reason': ('Reason: {reason}', 'Motif : {reason}'),
  'as_rp_item': ('Item', 'Article'),
  'as_rp_option': ('Option chosen', 'Option choisie'),
  'as_ex_change': ('From {from} to {to}', 'De {from} à {to}'),
  'as_ex_diff_title': ('Price difference', 'Différence de prix'),
  'as_ex_paid': ('{amount} was taken from your wallet.', '{amount} ont été prélevés sur votre portefeuille.'),
  'as_ex_returned': ('{amount} was returned to your wallet.', '{amount} ont été remis sur votre portefeuille.'),
  'as_ex_will_refund': (
    '{amount} will be refunded to your wallet when the new item is delivered.',
    '{amount} seront remboursés sur votre portefeuille à la livraison du nouvel article.'
  ),
  'as_ex_refunded': ('{amount} was refunded to your wallet.', '{amount} ont été remboursés sur votre portefeuille.'),
};
