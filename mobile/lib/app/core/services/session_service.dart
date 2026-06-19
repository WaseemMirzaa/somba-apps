import 'dart:ui';

import 'package:get/get.dart';
import 'package:intl/intl.dart';

import '../../data/mock/mock_data.dart';
import '../../data/models/models.dart';

/// Session, locale and currency state shared by the whole app.
class SessionService extends GetxService {
  final user = Rxn<AppUser>();
  final languageCode = 'fr'.obs;
  final currency = 'CDF'.obs; // 'CDF' | 'USD'

  /// Phone awaiting OTP verification during sign-up / reset.
  String pendingPhone = '';

  bool get isLoggedIn => user.value != null;

  void setLanguage(String code) {
    languageCode.value = code;
    Get.updateLocale(Locale(code));
  }

  void toggleCurrency() =>
      currency.value = currency.value == 'CDF' ? 'USD' : 'CDF';

  bool login(String phone, String password) {
    if (password != 'somba123') return false;
    user.value = AppUser(
      id: 'u-1',
      name: MockData.demoUser.name,
      phone: phone.isEmpty ? MockData.demoUser.phone : phone,
      email: MockData.demoUser.email,
      city: MockData.demoUser.city,
    );
    return true;
  }

  void completeRegistration(String name, String phone, String email) {
    user.value = AppUser(
      id: 'u-${DateTime.now().millisecondsSinceEpoch}',
      name: name,
      phone: phone,
      email: email,
      city: 'Kinshasa',
    );
  }

  void updateProfile({required String name, required String email}) {
    final u = user.value;
    if (u == null) return;
    user.value =
        AppUser(id: u.id, name: name, phone: u.phone, email: email, city: u.city);
  }

  void logout() => user.value = null;

  static final _grouping = NumberFormat('#,##0', 'en_US');

  /// Formats a USD amount in the active display currency.
  String money(double usd) {
    if (currency.value == 'USD') {
      final cents = usd.truncateToDouble() == usd
          ? _grouping.format(usd)
          : usd.toStringAsFixed(2);
      return '\$$cents';
    }
    final cdf = usd * MockData.fxRateCdfPerUsd;
    return '${_grouping.format(cdf).replaceAll(',', ' ')} FC';
  }
}
