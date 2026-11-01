// Typed accessors for the texts in messages_engage.dart (Q&A, flash sales, coupons, storefront and the product gallery).
import 'strings.dart';

extension StringsEngage on Strings {
  // countdown + flash sales
  String cdDays(int n) => t('cd_days', {'n': n});
  String flashEnds(String time) => t('flash_ends', {'time': time});
  String flashEndsShort(String time) => t('flash_ends_short', {'time': time});
  String get flashDealsHint => t('flash_deals_hint');
  String get flashMoreDeals => t('flash_more_deals');
  // storefront
  String vacUntil(String date) => t('vac_until', {'date': date});
  String get vacGeneric => t('vac_generic');
  String get vacBadge => t('vac_badge');
  String get vacButton => t('vac_button');
  String storeHandling(int n) => n == 1 ? t('store_handling_one') : t('store_handling_many', {'n': n});
  String get storePolicies => t('store_policies');
  String get storeReturnsPolicy => t('store_returns_policy');
  String get storeShippingPolicy => t('store_shipping_policy');
  String pdHandlingNote(int n) => t('pd_handling_note', {'n': n});
  String pdBrandLine(String brand) => t('pd_brand_line', {'brand': brand});
  String pdSkuLine(String sku) => t('pd_sku_line', {'sku': sku});
  // gallery
  String get galClose => t('gal_close');
  String galCounter(int n, int total) => t('gal_counter', {'n': n, 'total': total});
  String galAlt(int n, int total, String name) => t('gal_alt', {'n': n, 'total': total, 'name': name});
  // Q&A
  String get qaAnswered => t('qa_answered');
  String get qaPending => t('qa_pending');
  String get qaSellerAnswer => t('qa_seller_answer');
  String qaAnsweredOn(String date) => t('qa_answered_on', {'date': date});
  String get qaYours => t('qa_yours');
  String get qaEmpty => t('qa_empty');
  String get qaLoadFailed => t('qa_load_failed');
  String get qaRetry => t('qa_retry');

  /// The notice a store on vacation shows: the server's text in this language, else "on vacation until {date}",
  /// else the generic sentence.
  String vacationText({Map<String, String>? notice, DateTime? until}) {
    final n = notice?[lang];
    if (n != null && n.trim().isNotEmpty) return n.trim();
    return until != null ? vacUntil(date(until)) : vacGeneric;
  }
}
