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
}

class MarketProfile {
  final MarketProfileId id;
  final String label;
  final String phonePrefix;
  final double? fxRateUsdCdf;
  final double codMaxOrderValue;
  final List<Zone> zones;

  const MarketProfile({
    required this.id,
    required this.label,
    required this.phonePrefix,
    this.fxRateUsdCdf,
    required this.codMaxOrderValue,
    required this.zones,
  });
}

const marketProfiles = {
  MarketProfileId.france: MarketProfile(
    id: MarketProfileId.france,
    label: 'France (Demo)',
    phonePrefix: '+33',
    codMaxOrderValue: 500,
    zones: [
      Zone(id: 'zone-a', name: 'Zone A — Centre', nameFr: 'Zone A — Centre', city: 'Paris', deliveryFeeUsd: 0),
      Zone(id: 'zone-b', name: 'Zone B — Nord', nameFr: 'Zone B — Nord', city: 'Paris', deliveryFeeUsd: 5),
    ],
  ),
  MarketProfileId.drc: MarketProfile(
    id: MarketProfileId.drc,
    label: 'DRC (Production)',
    phonePrefix: '+243',
    fxRateUsdCdf: 2850,
    codMaxOrderValue: 200,
    zones: [
      Zone(id: 'gombe', name: 'Gombe', nameFr: 'Gombe', city: 'Kinshasa', deliveryFeeUsd: 3),
      Zone(id: 'limete', name: 'Limete', nameFr: 'Limete', city: 'Kinshasa', deliveryFeeUsd: 5),
    ],
  ),
};

MarketProfileId currentMarketProfile = MarketProfileId.france;
