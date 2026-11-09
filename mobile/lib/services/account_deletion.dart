import 'auth_service.dart' show ApiException;

/// One reason the account cannot be deleted yet, as the server lists it (`me:deleteCheck`, or the `blockers` of a
/// refused `me:delete`). [kind] is one of [kinds]; [count] is how many open items there are; [amountUsd] is the money
/// for `wallet_balance`. The app words every reason itself (see `Strings.delaccBlocker`), so it reads in either language.
class DeletionBlocker {
  static const kinds = {
    'wallet_balance',
    'open_order',
    'open_return',
    'open_dispute',
    'open_ticket',
    'pending_payout',
    'pending_refund',
    'pending_topup',
  };

  final String kind;
  final int count;
  final double? amountUsd;
  const DeletionBlocker(this.kind, {this.count = 1, this.amountUsd});

  /// A blocker from the server's JSON; an unknown kind (a newer server) is dropped by [listFrom].
  factory DeletionBlocker.fromJson(Map<dynamic, dynamic> j) => DeletionBlocker(
        '${j['kind']}',
        count: (j['count'] as num?)?.toInt() ?? 1,
        amountUsd: (j['amountUsd'] as num?)?.toDouble(),
      );

  /// The blockers in a server reply (a list of maps); anything else gives an empty list.
  static List<DeletionBlocker> listFrom(Object? raw) => [
        if (raw is List)
          for (final b in raw)
            if (b is Map && kinds.contains('${b['kind']}')) DeletionBlocker.fromJson(b),
      ];

  /// The blockers a refused deletion carries, or null when [e] is some other failure.
  static List<DeletionBlocker>? fromRefusal(Object e) {
    if (e is! ApiException || e.code != 'account_blocked') return null;
    return listFrom(e.details['blockers']);
  }

  @override
  bool operator ==(Object other) => other is DeletionBlocker && other.kind == kind && other.count == count && other.amountUsd == amountUsd;
  @override
  int get hashCode => Object.hash(kind, count, amountUsd);
}
