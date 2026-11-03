// Typed accessors for the texts in messages_r2f.dart (photos in reviews, following stores, Help contact options).
import 'strings.dart';

extension StringsR2f on Strings {
  // photos in reviews
  String get rvPhotosLabel => t('rv_photos_label');
  String get rvPhotosWait => t('rv_photos_wait');
  String rvPhotoAlt(int n, int total) => t('rv_photo_alt', {'n': n, 'total': total});
  // following stores
  String get follow => t('follow');
  String get following => t('following');
  String get unfollow => t('unfollow');
  String followNow(String store) => t('follow_now', {'store': store});
  String followStopped(String store) => t('follow_stopped', {'store': store});
  String followFollowers(int n) => n == 1 ? t('follow_followers_one') : t('follow_followers_many', {'n': n});
  String get followingTitle => t('following_title');
  String get followingEmpty => t('following_empty');
  String get followingEmptyHint => t('following_empty_hint');
  String followingProducts(int n) => n == 1 ? t('following_products_one') : t('following_products_many', {'n': n});
  String get followingLoadFailed => t('following_load_failed');
  String get followingRetry => t('following_retry');
  // help: contact options
  String get helpContactTitle => t('help_contact_title');
  String get helpCall => t('help_call');
  String get helpEmail => t('help_email');
  String get helpWhatsapp => t('help_whatsapp');
  String helpOpenFailed(String value) => t('help_open_failed', {'value': value});
}
