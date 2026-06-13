import 'dart:ui';

import 'package:get/get.dart';

import '../../data/models/rider.dart';

/// Holds the logged-in rider, the online/offline flag and the app locale.
class SessionService extends GetxService {
  final Rxn<Rider> rider = Rxn<Rider>();
  final RxBool online = true.obs;
  final RxBool kycApproved = false.obs;
  final Rx<Locale> locale = const Locale('fr').obs;

  bool get isLoggedIn => rider.value != null;

  void login(Rider value) {
    rider.value = value;
  }

  void logout() {
    rider.value = null;
    kycApproved.value = false;
    online.value = true;
  }

  void setOnline(bool value) => online.value = value;

  void setLocale(Locale value) {
    locale.value = value;
    Get.updateLocale(value);
  }
}
