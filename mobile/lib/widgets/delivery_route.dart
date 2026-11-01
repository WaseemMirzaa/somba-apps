import 'package:flutter/material.dart';
import '../l10n/strings.dart';
import '../services/delivery_quote.dart';
import '../theme/app_theme.dart';
import '../util/format.dart';

/// What the delivery quote says about where the parcels come from and how they travel, as the small grey lines under
/// the delivery fee at checkout: the delivering warehouse, a warehouse without riders and who stands in, each route
/// between warehouses with the transit time and cost of its hops, the total transit time and the transfer fee.
class DeliveryRouteLines extends StatelessWidget {
  const DeliveryRouteLines({super.key, required this.quote});

  final DeliveryQuote quote;

  static const _style = TextStyle(fontSize: 12, color: AppColors.muted);

  Widget _line(String key, String text) => Align(
        alignment: Alignment.centerRight,
        child: Text(text, key: ValueKey(key), textAlign: TextAlign.end, style: _style),
      );

  /// The warehouses without riders, once each: who stands in, or that nobody can and the order may take longer.
  List<Widget> _fallbackLines(Strings s) {
    final out = <Widget>[];
    final said = <String>{};
    void add(String key, String text) {
      if (said.add(text)) out.add(_line(key, text));
    }

    final covering = quote.coveringHubName;
    if (quote.standsIn) {
      add('checkout-fallback', s.checkoutFallback(covering, quote.destinationHubName));
    } else if (quote.hasFallback) {
      add('checkout-fallback', s.checkoutFallbackNone(covering));
    }
    for (var i = 0; i < quote.origins.length; i++) {
      final o = quote.origins[i];
      if (o.standsIn) {
        add('checkout-pickup-fallback-$i', s.checkoutPickupFallback(o.coveringHubName, o.hubName, area: o.areaNameFor(s.lang)));
      } else if (o.hasFallback) {
        add('checkout-pickup-fallback-$i', s.checkoutFallbackNone(o.coveringHubName));
      }
    }
    return out;
  }

  /// One route between warehouses: the chain of names (when parcels are relayed) and, when the hops have a transit time
  /// or a cost of their own, a line per hop.
  List<Widget> _routeLines(Strings s, int i, QuoteRoute route) {
    final names = route.names;
    return [
      if (names.length >= 3) _line('checkout-route-$i', s.checkoutRoute(names.join(' → '))),
      if (route.hasHopDetails)
        for (var j = 0; j < route.hops.length; j++) _line('checkout-hop-$i-$j', _hopText(s, route.hops[j], names[j], names[j + 1])),
    ];
  }

  String _hopText(Strings s, QuoteHop hop, String from, String to) {
    final fee = quote.hopFeeUsd(hop);
    return [
      '$from → $to',
      if (hop.transitHours > 0) s.checkoutHopTransit(hop.transitHours),
      if (fee != null) money(fee),
    ].join(' · ');
  }

  @override
  Widget build(BuildContext context) {
    final s = Strings.of(context);
    final chains = quote.routeChains;
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      if ((quote.destinationHubName ?? '').isNotEmpty) _line('checkout-hub', s.checkoutFromHub(quote.destinationHubName)),
      ..._fallbackLines(s),
      for (var i = 0; i < chains.length; i++) ..._routeLines(s, i, chains[i]),
      if (quote.transitHours > 0) _line('checkout-transit', s.checkoutTransit(quote.transitHours)),
      if (quote.interCity && quote.transitHours <= 0 && quote.interCityDays > 0) _line('checkout-intercity', s.checkoutInterCity(quote.interCityDays)),
      if (quote.transferUsd > 0) _line('checkout-transfer', s.checkoutTransferFee(money(quote.transferUsd))),
    ]);
  }
}
