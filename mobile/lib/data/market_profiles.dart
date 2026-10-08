enum MarketProfileId { france, drc }

class Zone {
  final String id;
  final String name;
  final String nameFr;
  final String city;
  final double deliveryFeeUsd;

  const Zone({
    required this.id,
    required this.name,
    required this.nameFr,
    required this.city,
    required this.deliveryFeeUsd,
  });

  factory Zone.fromJson(Map<String, dynamic> j) => Zone(
        id: j['id'] as String,
        name: j['name'] as String? ?? j['id'] as String,
        nameFr: j['nameFr'] as String? ?? j['name'] as String? ?? '',
        city: j['city'] as String? ?? '',
        deliveryFeeUsd: (j['feeUsd'] as num?)?.toDouble() ?? 0,
      );
}

/// How prices are DISPLAYED. The business runs in DR Congo (zones and the exchange
/// rate come from the server's settings); `france` is simply "show me US dollars".
class MarketProfile {
  final MarketProfileId id;
  final String label;
  final String phonePrefix;
  final double? fxRateUsdCdf;

  const MarketProfile({
    required this.id,
    required this.label,
    required this.phonePrefix,
    this.fxRateUsdCdf,
  });
}

/// Delivery zones used before the server's `deliveryZones` setting has loaded.
/// (The server is the source of truth for fees; these only avoid an empty list.)
const fallbackZones = [
  Zone(id: 'gombe', name: 'Gombe', nameFr: 'Gombe', city: 'Kinshasa', deliveryFeeUsd: 3),
  Zone(id: 'limete', name: 'Limete', nameFr: 'Limete', city: 'Kinshasa', deliveryFeeUsd: 5),
];

const marketProfiles = {
  MarketProfileId.france: MarketProfile(
    id: MarketProfileId.france,
    label: 'US dollars (USD)',
    phonePrefix: '+243',
  ),
  MarketProfileId.drc: MarketProfile(
    id: MarketProfileId.drc,
    label: 'Congolese francs (FC)',
    phonePrefix: '+243',
    fxRateUsdCdf: 2850,
  ),
};
