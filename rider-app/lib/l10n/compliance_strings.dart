// Typed accessors for the texts in compliance_messages.dart, written like `strings_keys.dart`.
import 'strings.dart';

/// Typed accessors, written like `strings_keys.dart`.
extension ComplianceStrings on Strings {
  String get vehicleTitle => t('vehicle_title');
  String get vehicleSub => t('vehicle_sub');
  String get vehicleNone => t('vehicle_none');
  String get vehicleReadonly => t('vehicle_readonly');
  String get vehicleModel => t('vehicle_model');
  String get vehicleKind => t('vehicle_kind');
  String get vehiclePlate => t('vehicle_plate');
  String get vehicleColour => t('vehicle_colour');
  String get vehicleOdometer => t('vehicle_odometer');
  String get vehicleFuel => t('vehicle_fuel');
  String get vehicleInsurance => t('vehicle_insurance');
  String get vehicleLastService => t('vehicle_last_service');
  String get vehicleNextService => t('vehicle_next_service');
  String vehicleTypeName(String? id) => has('vtype_$id') ? t('vtype_$id') : '';
  String fuelName(String? id) => has('fuel_$id') ? t('fuel_$id') : '';
  String insuranceExpired(Object date) => t('insurance_expired', {'date': date});
  String insuranceExpiring(int days) => days == 0 ? t('insurance_expiring_today') : t('insurance_expiring', {'n': days});
  String serviceOverdue(Object date) => t('service_overdue', {'date': date});
  String serviceDue(int days) => days == 0 ? t('service_due_today') : t('service_due', {'n': days});
  String get docTitle => t('doc_title');
  String get docSub => t('doc_sub');
  String get docNone => t('doc_none');
  String get docUpload => t('doc_upload');
  String get docAttention => t('doc_attention');
  String get docLoadFailed => t('doc_load_failed');
  String docTypeName(String id) => has('dtype_$id') ? t('dtype_$id') : t('dtype_other');
  String docStatus(String id) => has('doc_status_$id') ? t('doc_status_$id') : id;
  String docNumber(Object number) => t('doc_number', {'number': number});
  String docValidUntil(Object date) => t('doc_valid_until', {'date': date});
  String get docNoExpiry => t('doc_no_expiry');
  String docExpired(Object date) => t('doc_expired', {'date': date});
  String docExpiring(int days, Object date) => days == 0 ? t('doc_expiring_today') : t('doc_expiring', {'n': days, 'date': date});
  String docRejectedReason(Object reason) => t('doc_rejected_reason', {'reason': reason});
  String docCheckedBy(Object name) => t('doc_checked_by', {'name': name});
  String get docWarnExpired => t('doc_warn_expired');
  String get docWarnExpiring => t('doc_warn_expiring');
  String get docWarnNote => t('doc_warn_note');
  String get upType => t('up_type');
  String get upNumber => t('up_number');
  String get upExpiry => t('up_expiry');
  String get upExpiryPick => t('up_expiry_pick');
  String get upPhoto => t('up_photo');
  String get upPhotoReplace => t('up_photo_replace');
  String get upPhotoAlt => t('up_photo_alt');
  String get upSend => t('up_send');
  String get errDocType => t('err_doc_type');
  String get errDocPhoto => t('err_doc_photo');
  String get docSent => t('doc_sent');
  String get errCameraDenied => t('err_camera_denied');
  String get errPhotosDenied => t('err_photos_denied');
}
