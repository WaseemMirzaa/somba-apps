// Typed accessors for the texts in messages_areas.dart (delivery areas: pickers and not-served notices).
import '../services/geo_models.dart';
import 'strings.dart';

extension StringsAreas on Strings {
  String get areaTitle => t('area_title');
  String get areaProvince => t('area_province');
  String get areaCity => t('area_city');
  String get areaCommune => t('area_commune');
  String get areaQuartier => t('area_quartier');
  String get areaChoose => t('area_choose');
  String get areaComingSoon => t('area_coming_soon');
  String get areaSearch => t('area_search');
  String get areaNoneFound => t('area_none_found');
  String get areaLoadFailed => t('area_load_failed');
  String get areaFromPin => t('area_from_pin');
  String get areaNoMatch => t('area_no_match');
  String areaNotServed(Object? area) => t('area_not_served', {'area': area});
  String get areaNotServedGeneric => t('area_not_served_generic');
  String areaDeliverIn(Object? cities) => t('area_deliver_in', {'cities': cities});
  String areaPartialHint(Object? area) => t('area_partial_hint', {'area': area});
  String get areaNotServedSave => t('area_not_served_save');
  String get areaNotServedBadge => t('area_not_served_badge');
  String get areaChangeAddress => t('area_change_address');
  String get coverageTitle => t('coverage_title');
  String coverageMore(int n) => t('coverage_more', {'n': n});
  String get coverageNone => t('coverage_none');

  /// The field label of a picker level.
  String areaLevelLabel(String level) => switch (level) {
        AreaLevel.province => areaProvince,
        AreaLevel.city => areaCity,
        AreaLevel.quartier => areaQuartier,
        _ => areaCommune,
      };

  /// The title of the sheet that lists the areas of one level.
  String areaSheetTitle(String level) => t(switch (level) {
        AreaLevel.province => 'area_sheet_province',
        AreaLevel.city => 'area_sheet_city',
        AreaLevel.quartier => 'area_sheet_quartier',
        _ => 'area_sheet_commune',
      });
}
