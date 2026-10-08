import 'package:flutter/material.dart';
import 'more/order_screens.dart';

/// Open an order's detail page (kept separate to avoid import cycles between
/// the notification, order and checkout screens).
void openOrder(BuildContext context, Locale locale, String orderId) {
  Navigator.push(context, MaterialPageRoute(builder: (_) => OrderDetailScreen(locale: locale, orderId: orderId)));
}
