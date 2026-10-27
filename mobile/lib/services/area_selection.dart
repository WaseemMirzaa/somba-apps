import 'geo_models.dart';

/// The delivery area an address form has chosen: province > city > (district) > commune > quartier. It is filled from
/// the map pin (`geo:resolve`) or by the pickers; choosing a level clears the ones below it.
class AreaSelection {
  AreaDto? province, city, district, commune, quartier;

  /// The last `geo:resolve` answer (null when the areas were picked by hand).
  AreaResolution? resolution;

  /// The areas were filled in from the pin (the form says so until the user changes one).
  bool fromPin = false;

  /// The pin matched no area (or an old address has none): the typed city and commune fields stand in.
  bool typed = false;

  /// The most specific area chosen: this is the address's `areaId`.
  AreaDto? get deepest => quartier ?? commune ?? district ?? city ?? province;
  String? get areaId => deepest?.id;
  bool get isEmpty => deepest == null;

  /// The chosen areas from the province down (the district is part of the chain, though never shown).
  List<AreaDto> get chain => [province, city, district, commune, quartier].whereType<AreaDto>().toList();

  /// The most specific area is only partly served (not served itself, but something inside it is): the user is still
  /// narrowing it down, so it is neither "served" nor "not served" yet.
  bool get needsMoreDetail => deepest?.partiallyServed ?? false;

  /// The most specific area has no active warehouse, and nothing inside it has one either. False while nothing is
  /// chosen, and while a partly served area still has to be narrowed down.
  bool get notServed {
    final d = deepest;
    if (d == null || d.partiallyServed) return false;
    final r = resolution;
    if (r != null && r.area?.id == d.id) return !r.served;
    return !d.served;
  }

  /// The warehouse that delivers to the chosen area, when there is one.
  String? get hubName {
    final d = deepest;
    if (d == null) return null;
    final r = resolution;
    return (r != null && r.area?.id == d.id ? r.hubName : null) ?? d.hubName;
  }

  void clear() {
    province = city = district = commune = quartier = null;
    resolution = null;
    fromPin = false;
  }

  /// Take the areas of a chain (country first, as the server sends it), replacing what was chosen.
  void setChain(List<AreaDto> chain) {
    province = areaAt(chain, AreaLevel.province);
    city = areaAt(chain, AreaLevel.city);
    district = areaAt(chain, AreaLevel.district);
    commune = areaAt(chain, AreaLevel.commune);
    quartier = areaAt(chain, AreaLevel.quartier);
  }

  void setResolution(AreaResolution r) {
    clear();
    setChain(r.chain);
    resolution = r;
    fromPin = true;
    typed = false;
  }

  /// A level picked by hand. [district] is the district a commune sits in (Kinshasa), when known.
  void choose(AreaDto a, {AreaDto? district}) {
    switch (a.level) {
      case AreaLevel.province:
        province = a;
        city = this.district = commune = quartier = null;
      case AreaLevel.city:
        city = a;
        this.district = commune = quartier = null;
      case AreaLevel.district:
        this.district = a;
        commune = quartier = null;
      case AreaLevel.commune:
        commune = a;
        this.district = district ?? this.district;
        quartier = null;
      case AreaLevel.quartier:
        quartier = a;
      default:
        return;
    }
    resolution = null;
    fromPin = false;
    typed = false;
  }
}
