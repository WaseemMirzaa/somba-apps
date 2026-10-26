enum MarketProfileId { france, drc }

/// How prices are DISPLAYED. The business runs in DR Congo (the exchange
/// rate comes from the server's settings); `france` is simply "show me US dollars".
class MarketProfile {
  final MarketProfileId id;
  final String phonePrefix;
  final double? fxRateUsdCdf;

  const MarketProfile({
    required this.id,
    required this.phonePrefix,
    this.fxRateUsdCdf,
  });
}

const marketProfiles = {
  MarketProfileId.france: MarketProfile(
    id: MarketProfileId.france,
    phonePrefix: '+243',
  ),
  MarketProfileId.drc: MarketProfile(
    id: MarketProfileId.drc,
    phonePrefix: '+243',
    fxRateUsdCdf: 2850,
  ),
};
