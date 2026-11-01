// Typed accessors for the texts in messages_logistics.dart (delivery quote, legs and addresses).
import 'strings.dart';

extension StringsLogistics on Strings {
  String get errUpload => t('err_upload');
  String get photoAdd => t('photo_add');
  String get photoTake => t('photo_take');
  String get photoChoose => t('photo_choose');
  String get photoRemove => t('photo_remove');
  String get photoUploading => t('photo_uploading');
  String photoMax(Object? n) => t('photo_max', {'n': n});
  String get photoWait => t('photo_wait');
  String get cartDeliveryLater => t('cart_delivery_later');
  String get cartDeliveryHint => t('cart_delivery_hint');
  String get cartDeliveryUnpinned => t('cart_delivery_unpinned');
  String get checkoutNeedPin => t('checkout_need_pin');
  String get checkoutPinCta => t('checkout_pin_cta');
  String get checkoutQuoteFailed => t('checkout_quote_failed');
  String checkoutFromHub(Object? hub) => t('checkout_from_hub', {'hub': hub});
  String checkoutTransferFee(Object? fee) => t('checkout_transfer_fee', {'fee': fee});
  String get checkoutQuoteWait => t('checkout_quote_wait');
  String get storeCouponsTitle => t('store_coupons_title');
  String storeCouponApplies(Object? store) => t('store_coupon_applies', {'store': store});
  String get journeyPickedUp => t('journey_picked_up');
  String get journeyAtOrigin => t('journey_at_origin');
  String get journeyInTransfer => t('journey_in_transfer');
  String get journeyAtDestination => t('journey_at_destination');
  String get journeyOutForDelivery => t('journey_out_for_delivery');
  String get journeyDelivered => t('journey_delivered');
  String journeyHopTransfer(Object? hub) => t('journey_hop_transfer', {'hub': hub});
  String journeyHopAt(Object? hub) => t('journey_hop_at', {'hub': hub});
  String journeyDriver(Object? name) => t('journey_driver', {'name': name});
  String get journeyHopNext => t('journey_hop_next');
  String get journeyHopRelay => t('journey_hop_relay');
  String checkoutRoute(Object? route) => t('checkout_route', {'route': route});

  /// "About 28 h in transit…" / "About 3 days in transit…" for the time the parcels spend between warehouses.
  String checkoutTransit(double hours) {
    final h = hours.ceil();
    return h >= 48 ? t('checkout_transit_days', {'n': (h / 24).round()}) : t('checkout_transit_hours', {'n': h});
  }

  /// "{covering} has no rider available right now — delivered from {hub}": another warehouse delivers instead.
  String checkoutFallback(Object? covering, Object? hub) => t('checkout_fallback', {'covering': covering, 'hub': hub});

  /// "{covering} has no rider available right now. Delivery may take longer.": nobody nearby has one, the order stays.
  String checkoutFallbackNone(Object? covering) => t('checkout_fallback_none', {'covering': covering});

  /// The same for a seller's pickup: [area] (the pickup area, when known) is collected by [hub] instead.
  String checkoutPickupFallback(Object? covering, Object? hub, {String? area}) => area == null || area.isEmpty
      ? t('checkout_pickup_fallback_plain', {'covering': covering, 'hub': hub})
      : t('checkout_pickup_fallback', {'covering': covering, 'hub': hub, 'area': area});

  /// "about 4 h" / "about 3 days": the transit time of one hop.
  String checkoutHopTransit(double hours) {
    final h = hours.ceil();
    return h >= 48 ? t('checkout_hop_days', {'n': (h / 24).round()}) : t('checkout_hop_hours', {'n': h});
  }

  /// "Delivery between cities adds about 3 days."
  String checkoutInterCity(int days) => days == 1 ? t('checkout_intercity_one') : t('checkout_intercity', {'n': days});

  String journeyRun(Object? ref) => t('journey_run', {'ref': ref});
  String get journeyTitle => t('journey_title');
  String get journeyWaiting => t('journey_waiting');
}
