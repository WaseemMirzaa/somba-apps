/// A process-wide, strictly increasing stamp. Two sources can describe the same fact at different times
/// (a product payload that says its store is on vacation, a `store:vacation` push that says it is back): each
/// is stamped when it is received, and the larger stamp wins. No clock involved, so it cannot go backwards.
int _last = 0;

int nextStamp() => ++_last;
