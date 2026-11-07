// Typed accessors for the texts in messages_cartstore.dart (cart / checkout grouped by store, store page search).
import 'strings.dart';

extension StringsCartStore on Strings {
  String get storeSubtotal => t('store_subtotal');
  String storeItems(int n) => n == 1 ? t('store_items_one') : t('store_items_many', {'n': n});
  String get storeOtherItems => t('store_other_items');
  String storeGroupOpen(String store) => t('store_group_open', {'store': store});
  String orderSplitNote(int n) => t('order_split_note', {'n': n});
  String get storeSearchHint => t('store_search_hint');
  String storeSearchNone(String q) => t('store_search_none', {'q': q});
}
