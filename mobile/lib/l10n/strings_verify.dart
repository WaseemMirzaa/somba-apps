// Typed accessors for the texts in messages_verify.dart (verification, two-step sign-in, sign-up recovery, address pin fallback).
import 'strings.dart';

extension StringsVerify on Strings {
  String get errServer => t('err_server');
  // phone verification
  String verSubtitleOff(String value) => t('ver_subtitle_phone_off', {'value': value});
  String get verContinue => t('ver_continue');
  String get verPhoneSending => t('ver_phone_sending');
  String verPhoneSent(String? to) => (to ?? '').isEmpty ? t('ver_phone_sent_plain') : t('ver_phone_sent', {'to': to});
  String get verSmsOffTitle => t('ver_sms_off_title');
  String get verSmsOffBody => t('ver_sms_off_body');
  String get verSmsFailedTitle => t('ver_sms_failed_title');
  String get verSmsFailedBody => t('ver_sms_failed_body');
  String get verUseEmail => t('ver_use_email');
  String get verUsePhone => t('ver_use_phone');
  String get verChangeNumber => t('ver_change_number');
  String get verChangeTitle => t('ver_change_title');
  String get verChangeBody => t('ver_change_body');
  String get verChangeSave => t('ver_change_save');
  String get verChangeDone => t('ver_change_done');
  String get verCodeResent => t('ver_code_resent');
  String get verPhoneDone => t('ver_phone_done');
  String get verEmailDone => t('ver_email_done');
  String get verCodeLabel => t('ver_code_label');
  String verBoxLabel(int n) => t('ver_box_label', {'n': n});
  // e-mail verification
  String veSentTo(String to) => t('ve_sent_to', {'to': to});
  String get veOffTitle => t('ve_off_title');
  String get veOffBody => t('ve_off_body');
  String get veFailedTitle => t('ve_failed_title');
  String get veFailedBody => t('ve_failed_body');
  String get veResent => t('ve_resent');
  String veWait(String time) => t('ve_wait', {'time': time});
  // checkout / wallet prompt
  String get vpPhoneRow => t('vp_phone_row');
  String get vpEmailRow => t('vp_email_row');
  String get vpVerified => t('vp_verified');
  String get vpNotVerified => t('vp_not_verified');
  String get vpNoPhone => t('vp_no_phone');
  String get vpNoChannel => t('vp_no_channel');
  String get vpChoose => t('vp_choose');
  // two-step sign-in
  String get tfTitle => t('tf_title');
  String get tfBody => t('tf_body');
  String get tfCode => t('tf_code');
  String get tfCodeHint => t('tf_code_hint');
  String get tfSubmit => t('tf_submit');
  String get tfCancel => t('tf_cancel');
  String get tfErrEmpty => t('tf_err_empty');
  // sign-up recovery
  String get regExistsSignin => t('reg_exists_signin');
  String get regRecovered => t('reg_recovered');
  String get regGoSignin => t('reg_go_signin');
  String get forgotOff => t('forgot_off');
  String get phoneLoginOff => t('phone_login_off');
  // address pin without the map
  String get addrUseGps => t('addr_use_gps');
  String get addrGpsPinned => t('addr_gps_pinned');
  String get addrGpsDone => t('addr_gps_done');
  String get addrLocationOff => t('addr_location_off');
  String get addrLocationSettings => t('addr_location_settings');
  String get addrLocationBlocked => t('addr_location_blocked');
  String get addrLocationDeniedPin => t('addr_location_denied_pin');
  String get addrLocationNone => t('addr_location_none');
  String get addrPinNeededNoMap => t('addr_pin_needed_no_map');
}
