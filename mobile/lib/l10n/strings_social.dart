// Typed accessors for the texts in messages_social.dart (seller chat, support and notification preferences).
import 'strings.dart';

extension StringsSocial on Strings {
  // chat
  String get chatInboxTitle => t('chat_inbox_title');
  String get chatInboxEmpty => t('chat_inbox_empty');
  String get chatMessageSeller => t('chat_message_seller');
  String get chatStoreFallback => t('chat_store_fallback');
  String chatCtxProduct(String name) => t('chat_ctx_product', {'name': name});
  String chatCtxOrder(String ref) => t('chat_ctx_order', {'ref': ref});
  String get chatCtxOrderPlain => t('chat_ctx_order_plain');
  String get chatComposeTitle => t('chat_compose_title');
  String chatComposeIntro(String store) => t('chat_compose_intro', {'store': store});
  String get chatComposeHint => t('chat_compose_hint');
  String get chatComposeSend => t('chat_compose_send');
  String get chatComposeRequired => t('chat_compose_required');
  String get chatInputHint => t('chat_input_hint');
  String get chatOlder => t('chat_older');
  String get chatMoreConvs => t('chat_more_convs');
  String get chatSent => t('chat_sent');
  String chatSentTo(String store) => t('chat_sent_to', {'store': store});
  String get chatReadOnly => t('chat_read_only');
  String get chatPhotoAlt => t('chat_photo_alt');
  String chatUnreadN(int n) => t('chat_unread_n', {'n': n});
  String get chatAttach => t('chat_attach');
  String get chatEmptyThread => t('chat_empty_thread');
  String chatViewPhoto(int n, int total) => t('chat_view_photo', {'n': n, 'total': total});
  String get socialCheckFields => t('social_check_fields');

  // support
  String get supportCatLabel => t('support_cat_label');
  String supportCategory(String slug) => switch (slug) {
        'order' => t('support_cat_order'),
        'payment' => t('support_cat_payment'),
        'delivery' => t('support_cat_delivery'),
        'return' => t('support_cat_return'),
        'account' => t('support_cat_account'),
        'other' => t('support_cat_other'),
        _ => t('support_cat_general'),
      };
  String supportCategoryLine(String slug) => t('support_category_line', {'name': supportCategory(slug)});
  String get supportOrderLabel => t('support_order_label');
  String get supportOrderNone => t('support_order_none');
  String get supportPhotosLabel => t('support_photos_label');
  String get supportCreate => t('support_create');
  String supportOpened(String ref) => t('support_opened', {'ref': ref});
  String get supportReplied => t('support_replied');
  String get supportSubjectRequired => t('support_subject_required');
  String get supportMessageRequired => t('support_message_required');
  String get supportStaff => t('support_staff');
  String supportClosedNote(String status) => status == 'closed' ? t('support_closed_closed') : t('support_closed_resolved');
  String get supportOpenNew => t('support_open_new');
  String supportUnreadN(int n) => t('support_unread_n', {'n': n});

  // notification categories
  String get notifCatTitle => t('notif_cat_title');
  String get notifCatIntro => t('notif_cat_intro');
  String get notifOrder => t('notif_order');
  String get notifOrderSub => t('notif_order_sub');
  String get notifMessage => t('notif_message');
  String get notifMessageSub => t('notif_message_sub');
  String get notifQuestion => t('notif_question');
  String get notifQuestionSub => t('notif_question_sub');
  String get notifReview => t('notif_review');
  String get notifReviewSub => t('notif_review_sub');
  String get notifProduct => t('notif_product');
  String get notifProductSub => t('notif_product_sub');
  String get notifPromo => t('notif_promo');
  String get notifPromoSub => t('notif_promo_sub');
  String get notifSaved => t('notif_saved');
}
