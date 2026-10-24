import 'dart:ui' show PlatformDispatcher;

import 'package:flutter/widgets.dart';
import 'package:intl/intl.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../services/auth_service.dart' show ApiException;
import 'messages.dart';
import 'server_errors.dart';

export 'strings_keys.dart';

/// UI texts in English and French. Every text lives in `messages.dart`
/// (key -> (English, French)); the typed accessors in `strings_keys.dart`
/// (`s.cartEmpty`, `s.itemOne(3)`) are what the screens call.
///
/// A screen gets its strings with `Strings.of(context)`, which also makes it
/// rebuild when the language changes. Code without a [BuildContext] (stores,
/// formatters) uses [Strings.current].
class Strings {
  final String lang;
  const Strings(String code) : lang = code == 'fr' ? 'fr' : 'en';

  static const supportedLanguages = ['fr', 'en'];
  static const _prefKey = 'somba.rider.lang';

  /// Language of the running app. Starts from the phone's language (French → French, anything else → English).
  static Strings current = Strings(_phoneLanguage());

  static String _phoneLanguage() {
    try {
      // The binding's dispatcher (tests can fake the phone's language on it).
      return WidgetsBinding.instance.platformDispatcher.locale.languageCode == 'fr' ? 'fr' : 'en';
    } catch (_) {
      return PlatformDispatcher.instance.locale.languageCode == 'fr' ? 'fr' : 'en';
    }
  }

  /// Fires when the language changes (the root widget rebuilds on it).
  static final ValueNotifier<String> langNotifier = ValueNotifier(current.lang);

  static Strings of(BuildContext context) => Strings(Localizations.localeOf(context).languageCode);

  /// Switches the app language and remembers it on this device.
  static Future<void> setLang(String code, {bool persist = true}) async {
    final next = code == 'en' ? 'en' : 'fr';
    current = Strings(next);
    langNotifier.value = next;
    if (!persist) return;
    try {
      (await SharedPreferences.getInstance()).setString(_prefKey, next);
    } catch (_) {/* storage unavailable: the choice just won't survive a restart */}
  }

  /// Restores the language saved on this device; without one, the phone's language applies.
  static Future<void> restore() async {
    try {
      final saved = (await SharedPreferences.getInstance()).getString(_prefKey);
      await setLang(saved == 'en' || saved == 'fr' ? saved! : _phoneLanguage(), persist: false);
    } catch (_) {}
  }

  bool get isFr => lang == 'fr';
  Locale get locale => Locale(lang);
  String get brand => 'Somba&Teka';

  /// Looks a text up; `{name}` placeholders are replaced from [args].
  String t(String key, [Map<String, Object?>? args]) {
    final m = kMessages[key];
    if (m == null) {
      assert(false, 'Missing string key: $key');
      return key;
    }
    var text = isFr ? m.$2 : m.$1;
    if (args != null) {
      args.forEach((k, v) => text = text.replaceAll('{$k}', '$v'));
    }
    return text;
  }

  bool has(String key) => kMessages.containsKey(key);

  /// What to show for a failure: the API's message in the user's language, or a
  /// neutral sentence for anything unexpected (never a raw exception dump).
  String errorText(Object e) => e is ApiException ? e.toString() : t('err_unexpected');

  /// A server message (always English) in the user's language; unknown messages pass through.
  String serverError(String raw) => translateServerError(raw, this);

  // ---- amounts, per language ----
  /// A US-dollar amount with the language's grouping: `$1,202.50` / `1 202,50 $`.
  /// French groups thousands (and sets the symbol off) with a no-break space. The locale data's own
  /// separator for thousands is the narrow U+202F, only ~0.18 em wide: in the small bold pills it all
  /// but disappears and reads as `1202,50`, so it is widened to the regular no-break space (U+00A0).
  String usd(num amount) {
    try {
      return NumberFormat.currency(locale: lang, symbol: '\$', decimalDigits: 2).format(amount).replaceAll('\u202f', '\u00a0');
    } catch (_) {
      return '\$${amount.toStringAsFixed(2)}';
    }
  }
}
