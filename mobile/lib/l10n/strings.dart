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
  static const _prefKey = 'somba.lang';

  /// Language of the running app. French is the primary language of the market.
  static Strings current = const Strings('fr');

  /// True once the user picked a language on this device (it then wins over the account's).
  static bool hasChoice = false;

  /// Fires when the language changes (the root widget rebuilds on it).
  static final ValueNotifier<String> langNotifier = ValueNotifier('fr');

  static Strings of(BuildContext context) => Strings(Localizations.localeOf(context).languageCode);

  /// Switches the app language and remembers it on this device.
  static Future<void> setLang(String code, {bool persist = true}) async {
    final next = code == 'en' ? 'en' : 'fr';
    current = Strings(next);
    langNotifier.value = next;
    if (!persist) return;
    hasChoice = true;
    try {
      (await SharedPreferences.getInstance()).setString(_prefKey, next);
    } catch (_) {/* storage unavailable: the choice just won't survive a restart */}
  }

  /// Restores the language saved on this device (French when none).
  static Future<void> restore() async {
    try {
      final saved = (await SharedPreferences.getInstance()).getString(_prefKey);
      if (saved == 'en' || saved == 'fr') {
        await setLang(saved!, persist: false);
        hasChoice = true;
      }
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

  /// The cart/order line variant; the default one is stored as 'Default'.
  String variant(String v) => v == 'Default' ? t('variant_default') : v;

  String itemsCount(int n) => t(n == 1 ? 'itemOne' : 'itemMany', {'n': n});

  String orderStatus(String status) => has('status_$status') ? t('status_$status') : status;

  String paymentLabel(String m) {
    if (has('pay_$m')) return t('pay_$m');
    return switch (m) {
      'airtel_money' => 'Airtel Money',
      'orange_money' => 'Orange Money',
      'vodacom_mpesa' => 'Vodacom M-Pesa',
      _ => m,
    };
  }

  /// What to show for a failure: the API's message in the user's language, or a
  /// neutral sentence for anything unexpected (never a raw exception dump).
  String errorText(Object e) => e is ApiException ? e.toString() : t('err_unexpected');

  /// A server message (always English) in the user's language; unknown messages pass through.
  String serverError(String raw) => translateServerError(raw, this);

  // ---- dates and numbers, per language ----
  String _fmt(DateFormat Function(String locale) build, DateTime d) {
    try {
      return build(lang).format(d);
    } catch (_) {
      // Date data not loaded (it is, at app start): fall back to a plain form.
      return d.toString().split('.').first;
    }
  }

  /// `17 oct. 2026` / `Oct 17, 2026`
  String date(DateTime d) => _fmt((l) => DateFormat.yMMMd(l), d);

  /// `17 oct. 2026, 14:05` / `Oct 17, 2026, 2:05 PM`
  String dateTime(DateTime d) => _fmt((l) => DateFormat.yMMMd(l).add_jm(), d);

  /// `14:05` / `2:05 PM`
  String time(DateTime d) => _fmt((l) => DateFormat.jm(l), d);

  /// "today, 14:05" or a full date and time.
  String when(DateTime d) {
    final now = DateTime.now();
    final sameDay = now.year == d.year && now.month == d.month && now.day == d.day;
    return sameDay ? t('when_today', {'time': time(d)}) : t('when_date', {'date': dateTime(d)});
  }

  /// `1 234,5` / `1,234.5`
  String number(num n, {int decimals = 0}) {
    try {
      return NumberFormat.decimalPatternDigits(locale: lang, decimalDigits: decimals).format(n);
    } catch (_) {
      return n.toStringAsFixed(decimals);
    }
  }

  /// An exact US-dollar amount with the language's grouping: `$1,202.50` / `1 202,50 $`.
  ///
  /// This is for text that QUOTES a dollar figure the server wrote (a notification, a receipt line), which must read
  /// the same as the server's own French wording (`moneyFr` in the API). Prices on screen go through `money()` in
  /// `util/format.dart` instead, which follows the market (Congolese francs in DR Congo) and rounds to whole units.
  ///
  /// French groups thousands, and sets the symbol off, with a no-break space. The locale data's own thousands
  /// separator is the narrow U+202F, only ~0.18 em wide: in small bold text it all but disappears and reads as
  /// `1202,50`, so it is widened to the regular no-break space (U+00A0).
  String usd(num amount) {
    try {
      return NumberFormat.currency(locale: lang, symbol: '\$', decimalDigits: 2).format(amount).replaceAll('\u202f', '\u00a0');
    } catch (_) {
      return '\$${amount.toStringAsFixed(2)}';
    }
  }
}
