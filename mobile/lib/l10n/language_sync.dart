import 'dart:async';
import '../services/realtime_store.dart';
import 'strings.dart';

/// What to do about the language once an account is known.
enum LanguageAction { none, followAccount, saveToAccount }

/// The language rule:
///  - no choice made on this device: the app follows the account's language;
///  - a choice made on this device (the sign-in screen's toggle, Settings): it wins and is saved to the account.
/// An account whose language the server did not send ([account] null) is never guessed: nothing changes.
/// The account can only be told once the session is [online] (before the socket is ready a request is refused).
LanguageAction languageAction({required bool deviceChoice, required String current, required String? account, required bool online}) {
  if (account == null || account == current) return LanguageAction.none;
  if (!deviceChoice) return LanguageAction.followAccount;
  return online ? LanguageAction.saveToAccount : LanguageAction.none;
}

/// Applies [languageAction] for the signed-in user of [store]. Called when a session starts (the account's language
/// from the sign-in answer, before the socket is up) and again each time the session finished loading, when
/// the account's language is authoritative (`me:get`) and the account can be told.
Future<LanguageAction> reconcileLanguage(RealtimeStore store, {bool? online}) async {
  final user = store.user;
  if (user == null) return LanguageAction.none;
  final action = languageAction(
    deviceChoice: Strings.hasChoice,
    current: Strings.current.lang,
    account: user.locale,
    online: online ?? store.isConnected,
  );
  switch (action) {
    case LanguageAction.followAccount:
      // Not saved on the device: it is the account's language, not a choice made here.
      unawaited(Strings.setLang(user.locale!, persist: false));
    case LanguageAction.saveToAccount:
      try {
        await store.updateProfile(locale: Strings.current.lang);
      } catch (_) {/* the next time the session loads, the device's choice is offered to the account again */}
    case LanguageAction.none:
      break;
  }
  return action;
}
