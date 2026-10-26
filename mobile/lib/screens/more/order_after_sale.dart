import 'package:flutter/foundation.dart';
import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';
import 'package:share_plus/share_plus.dart';
import '../../data/catalog_live.dart';
import '../../data/shop_state.dart';
import '../../l10n/strings.dart';
import '../../services/engage_store.dart';
import '../../services/maps_config.dart';
import '../../services/models.dart';
import '../../theme/app_theme.dart';
import '../../util/format.dart';
import '../../widgets/kit.dart';
import '../cart_screen.dart';
import 'catalog_extra.dart';

export 'aftersale_item_issue.dart' show ItemIssueScreen;

/// "Buy again": puts every still-available line of [order] back in the cart (capped at stock) and opens the cart.
Future<void> buyAgain(BuildContext context, OrderDto order, Locale locale) async {
  final s = Strings.of(context);
  final messenger = ScaffoldMessenger.of(context);
  var added = 0;
  final missing = <String>[];
  for (final i in order.items.where((i) => !i.isCancelled)) {
    final p = productByUuid(i.productId);
    if (p == null || p.stock <= 0 || EngageStore.instance.vacationOf(p) != null) {
      missing.add(i.displayName(s.lang));
      continue;
    }
    added += ShopState.instance.addToCart(p, variant: i.variant, qty: i.qty);
  }
  messenger
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(
      content: Text(added == 0
          ? s.buyAgainNone
          : missing.isEmpty
              ? s.buyAgainAdded(added)
              : s.buyAgainPartial(added, missing.join(', '))),
    ));
  if (added > 0 && context.mounted) {
    await Navigator.push(context, MaterialPageRoute(builder: (_) => CartScreen(locale: locale)));
  }
}

/// Plain-text receipt (shared through the phone's share sheet: WhatsApp, e-mail, Files…).
String receiptText(Strings s, OrderDto o) {
  final b = StringBuffer()
    ..writeln('Somba&Teka — ${s.receiptTitle}')
    ..writeln('${s.receiptOrder}: ${o.reference}')
    ..writeln('${s.receiptDate}: ${o.createdAt != null ? formatDateTime(o.createdAt!) : '—'}')
    ..writeln('${s.receiptCustomer}: ${o.customerName}');
  if (o.shippingText.isNotEmpty) b.writeln('${s.receiptDeliverTo}: ${o.shippingText}');
  b.writeln('');
  for (final i in o.items) {
    final cancelled = i.isCancelled ? ' (${s.receiptCancelled})' : '';
    b.writeln('${i.qty} × ${i.displayName(s.lang)}${i.hasVariant ? ' (${i.displayVariant(s.lang)})' : ''} — ${money(i.priceUsd * i.qty)}$cancelled');
  }
  b
    ..writeln('')
    ..writeln('${s.subtotal}: ${money(o.subtotalUsd)}')
    ..writeln('${s.delivery}: ${money(o.deliveryFeeUsd)}');
  if (o.discountUsd > 0) b.writeln('${s.receiptDiscount}${o.promoCode != null ? ' (${o.promoCode})' : ''}: -${money(o.discountUsd)}');
  if (o.refundedUsd > 0) b.writeln('${s.receiptRefunded}: -${money(o.refundedUsd)}');
  b
    ..writeln('${s.total}: ${money(o.totalUsd)}')
    ..writeln('${s.receiptPaidWith}: ${s.paymentLabel(o.paymentMethod)}');
  return b.toString();
}

class OrderReceiptScreen extends StatelessWidget {
  final OrderDto order;
  const OrderReceiptScreen({super.key, required this.order});

  @override
  Widget build(BuildContext context) {
    final s = Strings.of(context);
    final text = receiptText(s, order);
    return Scaffold(
      appBar: backAppBar(context, s.receiptTitle),
      body: ListView(padding: const EdgeInsets.fromLTRB(16, 8, 16, 24), children: [
        Panel(
          child: SelectableText(text, key: const ValueKey('receipt-text'), style: const TextStyle(fontSize: 13.5, height: 1.5, fontFamily: 'monospace')),
        ),
        const SizedBox(height: 14),
        FilledButton(
          key: const ValueKey('receipt-share'),
          onPressed: () => SharePlus.instance.share(ShareParams(text: text, subject: '${s.receiptTitle} ${order.reference}')),
          child: Text(s.receiptShare),
        ),
        const SizedBox(height: 8),
        OutlinedButton(
          onPressed: () async {
            await Clipboard.setData(ClipboardData(text: text));
            if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(s.receiptCopied)));
          },
          child: Text(s.receiptCopy),
        ),
      ]),
    );
  }
}

/// After delivery: one-tap entry to review each product of the order.
class ReviewPromptCard extends StatelessWidget {
  final OrderDto order;
  final Locale locale;
  const ReviewPromptCard({super.key, required this.order, required this.locale});

  @override
  Widget build(BuildContext context) {
    final s = Strings.of(context);
    final lines = <OrderItemDto>[];
    final seen = <String>{};
    for (final i in order.items) {
      if (!i.isCancelled && seen.add(i.productId)) lines.add(i);
    }
    if (lines.isEmpty) return const SizedBox.shrink();
    return Panel(
      key: const ValueKey('review-prompt'),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          const Icon(Icons.star_rate_rounded, color: AppColors.amber),
          const SizedBox(width: 8),
          Expanded(child: Text(s.reviewPromptTitle, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14.5))),
        ]),
        const SizedBox(height: 4),
        Text(s.reviewPromptBody, style: const TextStyle(color: AppColors.muted, fontSize: 12.5)),
        const SizedBox(height: 8),
        for (final i in lines)
          Row(children: [
            Expanded(child: Text(i.displayName(s.lang), maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13))),
            TextButton(
              key: ValueKey('review-${i.productId}'),
              onPressed: () {
                final p = productByUuid(i.productId);
                Navigator.push(context, MaterialPageRoute(builder: (_) => ReviewComposeScreen(locale: locale, product: p)));
              },
              child: Text(s.reviewWrite),
            ),
          ]),
      ]),
    );
  }
}

/// Live rider position on a map, with the delivery pin when the customer set one.
/// Only built when a Google Maps key is configured (callers fall back to text + "Open in Maps").
class RiderMap extends StatelessWidget {
  final ({double lat, double lng}) rider;
  final ({double lat, double lng})? destination;
  const RiderMap({super.key, required this.rider, this.destination});

  @override
  Widget build(BuildContext context) {
    final r = LatLng(rider.lat, rider.lng);
    final d = destination == null ? null : LatLng(destination!.lat, destination!.lng);
    return ClipRRect(
      borderRadius: BorderRadius.circular(14),
      child: SizedBox(
        height: 220,
        child: GoogleMap(
          key: const ValueKey('rider-map'),
          initialCameraPosition: CameraPosition(target: r, zoom: 14),
          markers: {
            Marker(markerId: const MarkerId('rider'), position: r, icon: BitmapDescriptor.defaultMarkerWithHue(BitmapDescriptor.hueAzure)),
            if (d != null) Marker(markerId: const MarkerId('home'), position: d),
          },
          myLocationButtonEnabled: false,
          mapToolbarEnabled: false,
          zoomControlsEnabled: false,
          gestureRecognizers: {Factory<OneSequenceGestureRecognizer>(() => EagerGestureRecognizer())},
        ),
      ),
    );
  }
}

/// True when the in-app map can be shown (a Maps key was supplied at build time).
bool get riderMapAvailable => MapsConfig.enabled;
