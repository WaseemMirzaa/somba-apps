import 'package:flutter/material.dart';

/// Close the on-screen keyboard (drops focus from whatever field has it).
void dismissKeyboard() => FocusManager.instance.primaryFocus?.unfocus();

/// A tap on any part of the screen that is not itself tappable closes the keyboard. Sits once, in
/// `MaterialApp.builder`, so no screen has to remember it. A tap on a button or field is still its own: the field keeps
/// focus, the button runs (a button that leaves the screen closes the keyboard through [KeyboardDismissObserver]).
class KeyboardDismisser extends StatelessWidget {
  final Widget child;
  const KeyboardDismisser({super.key, required this.child});

  @override
  Widget build(BuildContext context) => GestureDetector(
        behavior: HitTestBehavior.translucent,
        onTap: dismissKeyboard,
        child: child,
      );
}

/// Closes the keyboard whenever a screen opens or closes, so it never stays up over the wrong page (back with the
/// keyboard open; a button that opens another screen).
class KeyboardDismissObserver extends NavigatorObserver {
  @override
  void didPush(Route<dynamic> route, Route<dynamic>? previousRoute) => dismissKeyboard();
  @override
  void didPop(Route<dynamic> route, Route<dynamic>? previousRoute) => dismissKeyboard();
  @override
  void didRemove(Route<dynamic> route, Route<dynamic>? previousRoute) => dismissKeyboard();
  @override
  void didReplace({Route<dynamic>? newRoute, Route<dynamic>? oldRoute}) => dismissKeyboard();
}
