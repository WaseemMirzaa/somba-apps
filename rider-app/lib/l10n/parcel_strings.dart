// Typed accessors for the parcel scanning texts (parcel_messages.dart).
import 'strings.dart';

extension ParcelStrings on Strings {
  String get parcelScanTitle => t('parcel_scan_title');
  String parcelScanBtn(int done, int total) => t('parcel_scan_btn', {'done': done, 'total': total});
  String get parcelStagePickup => t('parcel_stage_pickup');
  String get parcelStageDropoff => t('parcel_stage_dropoff');

  /// "2 of 3 scanned" / "2 sur 3 scannés" (French: singular up to one box scanned).
  String parcelCounter(int done, int total) => t(done <= 1 ? 'parcel_counter_one' : 'parcel_counter', {'done': done, 'total': total});
  String get parcelAllDone => t('parcel_all_done');
  String get parcelListTitle => t('parcel_list_title');

  /// "Box 2/3", or "Parcel" for a package that was not split.
  String parcelBox(int n, int count) => count > 1 ? t('parcel_box', {'n': n, 'count': count}) : t('parcel_single');
  String get parcelDone => t('parcel_done');
  String get parcelTodo => t('parcel_todo');
  String get parcelNeedPickup => t('parcel_need_pickup');
  String get parcelNeedDropoff => t('parcel_need_dropoff');
  String get parcelNeedRoad => t('parcel_need_road');
  String get parcelAim => t('parcel_aim');
  String get parcelTypeLabel => t('parcel_type_label');
  String get parcelTypeHint => t('parcel_type_hint');
  String get parcelTypeSubmit => t('parcel_type_submit');
  String get parcelFinish => t('parcel_finish');
  String parcelScannedOk(String code, int done, int total) => t('parcel_scanned_ok', {'code': code, 'done': done, 'total': total});
  String parcelAlready(String code) => t('parcel_already', {'code': code});
  String get parcelCompleteMsg => t('parcel_complete_msg');
  String get parcelCamDeniedTitle => t('parcel_cam_denied_title');
  String get parcelCamDeniedBody => t('parcel_cam_denied_body');
  String get parcelCamUnavailable => t('parcel_cam_unavailable');
  String get parcelOpenSettings => t('parcel_open_settings');
  String get parcelTorch => t('parcel_torch');
  String get parcelSettingsFailed => t('parcel_settings_failed');

  String get parcelContentsTitle => t('parcel_contents_title');
  String stopOrdersPill(int n) => t('stop_orders_pill', {'n': n});
  String stopOrdersLine(String refs) => t('stop_orders_line', {'refs': refs});
  String get stopOneScan => t('stop_one_scan');
  String stopOneCode(int n) => t('stop_one_code', {'n': n});
  String stopAllOk(String text, int n) => t('stop_all_ok', {'text': text, 'n': n});
  String stopPartial(int ok, int total, String failed) => t('stop_partial', {'ok': ok, 'total': total, 'failed': failed});
  String get parcelResLoading => t('parcel_res_loading');
  String parcelResStore(String name) => t('parcel_res_store', {'name': name});
  String parcelResArea(String area) => t('parcel_res_area', {'area': area});
  String get parcelResVoided => t('parcel_res_voided');
  String get parcelResOrders => t('parcel_res_orders');
  String get parcelResLegs => t('parcel_res_legs');
}
